import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

const menuTemplate: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
  {
    label: 'ファイル',
    submenu: [
      {
        label: 'ファイルを開く...',
        click: async (item, window) => {
          if (window instanceof BrowserWindow) {
            const result = await dialog.showOpenDialog(window, {
              properties: ['openFile'],
              filters: [
                { name: '3D/2D Files', extensions: ['stl', 'dxf'] },
                { name: 'STL Files', extensions: ['stl'] },
                { name: 'DXF Files', extensions: ['dxf'] }
              ]
            });
            if (!result.canceled && result.filePaths.length > 0) {
              window.webContents.send('open-file', result.filePaths[0]);
            }
          }
        }
      },
      { type: 'separator' },
      {
        label: '終了',
        accelerator: 'CmdOrCtrl+Q',
        click: () => app.quit(),
      },
    ],
  },
  {
    label: '表示',
    submenu: [
      {
        label: '開発者ツールを開く',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: (item, window: Electron.BaseWindow | undefined) => {
          if (window instanceof BrowserWindow) {
            window.webContents.toggleDevTools();
          }
        },
      },
    ],
  },
];

// Pythonプロセスを呼び出す汎用関数
function callPython(scriptName: string, args: (string | number)[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonExecutable = process.platform === 'win32'
      ? path.join(app.getAppPath(), '.venv', 'Scripts', 'python.exe')
      : path.join(app.getAppPath(), '.venv', 'bin', 'python');

    const scriptPath = path.join(app.getAppPath(), 'src', 'python', scriptName);
    const pythonProcess = spawn(pythonExecutable, [scriptPath, ...args.map(arg => String(arg))]);

    let stdout = '';
    let stderr = '';
    pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(`Failed to parse Python output: ${stdout}`);
        }
      } else {
        console.error(`Python stderr: ${stderr}`);
        reject(`Python script exited with code ${code}. Stderr: ${stderr}`);
      }
    });
  });
}

app.whenReady().then(() => {
  // IPCハンドラ
  ipcMain.handle('run-python-test', () => callPython('test.py', []));
  ipcMain.handle('parse-dxf-file', (event, filePath) => callPython('dxf_parser.py', [filePath]));
  ipcMain.handle('generate-contour-path', (event, toolDiameter, geometry) => callPython('contour_generator.py', [toolDiameter, JSON.stringify(geometry)]));
  ipcMain.handle('generate-pocket-path', (event, params) => callPython('pocket_generator.py', [JSON.stringify(params.geometry), params.toolDiameter, params.stepover]));
  ipcMain.handle('generate-3d-path', (event, params) => callPython('z_level_slicer.py', [params.filePath, params.sliceHeight, params.toolDiameter, params.stepoverRatio]));

  const setupGcodeGeneratorHandler = (name: string, script: string) => {
    ipcMain.handle(name, async (event, params) => {
      const gcodeResult = await callPython(script, [JSON.stringify(params.toolpaths || params.drillPoints), params.feedRate, params.safeZ, params.stepDown, params.peckQ, params.retractZ]);
      if (gcodeResult.status !== 'success') throw new Error(gcodeResult.message);

      const focusedWindow = BrowserWindow.fromWebContents(event.sender);
      if (!focusedWindow) throw new Error('Could not find the focused window.');

      const { canceled, filePath } = await dialog.showSaveDialog(focusedWindow, {
        title: 'G-codeを保存',
        defaultPath: `${name}.nc`,
        filters: [{ name: 'NC Files', extensions: ['nc', 'gcode', 'txt'] }, { name: 'All Files', extensions: ['*'] }]
      });

      if (canceled || !filePath) return { status: 'canceled' };

      try {
        fs.writeFileSync(filePath, gcodeResult.gcode);
        return { status: 'success', filePath };
      } catch (err) {
        throw new Error(`Failed to save file: ${(err as Error).message}`);
      }
    });
  };

  setupGcodeGeneratorHandler('generate-gcode', 'gcode_generator.py');
  setupGcodeGeneratorHandler('generate-drill-gcode', 'drill_gcode_generator.py');

  // メニューとウィンドウの作成
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
