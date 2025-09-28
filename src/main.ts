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

  // index.htmlをロードする
  // 注意: このパスはコンパイル後のdistディレクトリからの相対パスになる
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// メニューのテンプレートを定義
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

app.whenReady().then(() => {
  ipcMain.handle('generate-contour-path', async (event, toolDiameter, geometry) => {
    return new Promise((resolve, reject) => {
      const pythonExecutable = process.platform === 'win32'
        ? path.join(app.getAppPath(), '.venv', 'Scripts', 'python.exe')
        : path.join(app.getAppPath(), '.venv', 'bin', 'python');

      const scriptPath = path.join(app.getAppPath(), 'src', 'python', 'contour_generator.py');
      const geometryString = JSON.stringify(geometry);
      const pythonProcess = spawn(pythonExecutable, [scriptPath, String(toolDiameter), geometryString]);

      let result = '';
      pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
        reject(data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(result));
          } catch (e) {
            reject('Failed to parse Python script output.');
          }
        } else {
          reject(`Python script exited with code ${code}`);
        }
      });
    });
  });

  // IPCハンドラの設定
  ipcMain.handle('run-python-test', async () => {
    return new Promise((resolve, reject) => {
      // OSに応じて仮想環境内のPython実行ファイルのパスを決定
      const pythonExecutable = process.platform === 'win32'
        ? path.join(app.getAppPath(), '.venv', 'Scripts', 'python.exe')
        : path.join(app.getAppPath(), '.venv', 'bin', 'python');

      const scriptPath = path.join(app.getAppPath(), 'src', 'python', 'test.py');
      const pythonProcess = spawn(pythonExecutable, [scriptPath]);

      let result = '';
      pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
        reject(data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(result));
          } catch (e) {
            reject('Failed to parse Python script output.');
          }
        } else {
          reject(`Python script exited with code ${code}`);
        }
      });
    });
  });

  ipcMain.handle('parse-dxf-file', async (event, filePath) => {
    return new Promise((resolve, reject) => {
      const pythonExecutable = process.platform === 'win32'
        ? path.join(app.getAppPath(), '.venv', 'Scripts', 'python.exe')
        : path.join(app.getAppPath(), '.venv', 'bin', 'python');

      const scriptPath = path.join(app.getAppPath(), 'src', 'python', 'dxf_parser.py');
      const pythonProcess = spawn(pythonExecutable, [scriptPath, filePath]);

      let result = '';
      pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
        reject(data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(result));
          } catch (e) {
            reject('Failed to parse Python script output.');
          }
        } else {
          reject(`Python script exited with code ${code}`);
        }
      });
    });
  });

  ipcMain.handle('generate-gcode', async (event, params) => {
    // 1. Pythonを呼び出してGコードを生成
    const gcodeResult = await new Promise<any>((resolve, reject) => {
      const { toolpath, feedRate, safeZ, stepDown } = params;
      const pythonExecutable = process.platform === 'win32'
        ? path.join(app.getAppPath(), '.venv', 'Scripts', 'python.exe')
        : path.join(app.getAppPath(), '.venv', 'bin', 'python');
      
      const scriptPath = path.join(app.getAppPath(), 'src', 'python', 'gcode_generator.py');
      const toolpathString = JSON.stringify(toolpath);
      
      const pythonProcess = spawn(pythonExecutable, [
        scriptPath,
        toolpathString,
        String(feedRate),
        String(safeZ),
        String(stepDown)
      ]);

      let result = '';
      pythonProcess.stdout.on('data', (data) => { result += data.toString(); });
      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
        reject(data.toString());
      });
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try { resolve(JSON.parse(result)); }
          catch (e) { reject('Failed to parse Python script output.'); }
        } else {
          reject(`Python script exited with code ${code}`);
        }
      });
    });

    if (gcodeResult.status !== 'success') {
      throw new Error(gcodeResult.message);
    }

    // 2. 保存ダイアログを表示
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    if (!focusedWindow) {
      throw new Error('Could not find the focused window.');
    }

    const { canceled, filePath } = await dialog.showSaveDialog(focusedWindow, {
      title: 'G-codeを保存',
      defaultPath: 'toolpath.nc',
      filters: [
        { name: 'NC Files', extensions: ['nc', 'gcode', 'txt'] },
        { name: 'All Files', extensions: ['*' ] }
      ]
    });

    if (canceled || !filePath) {
      return { status: 'canceled' };
    }

    // 3. ファイルに書き込み
    try {
      fs.writeFileSync(filePath, gcodeResult.gcode);
      return { status: 'success', filePath };
    } catch (err) {
      throw new Error(`Failed to save file: ${(err as Error).message}`);
    }
  });

  // メニューをテンプレートから作成
  const menu = Menu.buildFromTemplate(menuTemplate);
  // アプリケーションメニューとして設定
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