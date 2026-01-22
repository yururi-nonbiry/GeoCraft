import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { parse } from 'svg-parser';
import { parseSvgContent } from './svgParser';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

let mainWindow: BrowserWindow | null = null;
let port: SerialPort | null = null;

type PocketPathParams = {
  geometry: number[][];
  toolDiameter: number;
  stepover: number;
};

type RoughingPathParams = {
  stockPath: string;
  targetPath: string;
  sliceHeight: number;
  toolDiameter: number;
  stepoverRatio: number;
};


// G-code sending job management
let gcodeQueue: string[] = [];
let gcodeJobStatus: 'idle' | 'sending' | 'paused' = 'idle';
let totalLines = 0;
let statusInterval: NodeJS.Timeout | null = null;


const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexPath = path.join(__dirname, 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// --- Settings IPC Handlers ---
const getSettingsPath = () => path.join(app.getPath('userData'), 'geocraft_settings.json');

ipcMain.handle('get-settings', async () => {
  const settingsPath = getSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data);
    } else {
      // Return default settings if file doesn't exist
      return {};
    }
  } catch (error: unknown) {
    console.error('Failed to get settings:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', message };
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  const settingsPath = getSettingsPath();
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { status: 'success' };
  } catch (error: unknown) {
    console.error('Failed to save settings:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', message };
  }
});

// Create the browser window.

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
                { name: '3D/2Dファイル', extensions: ['stl', 'dxf', 'svg', 'obj'] },
                { name: 'STL Files', extensions: ['stl'] },
                { name: 'OBJ Files', extensions: ['obj'] },
                { name: 'DXF Files', extensions: ['dxf'] },
                { name: 'SVG Files', extensions: ['svg'] }
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
        label: '開発者ツール',
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

// Helper to run Python scripts
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
  const sendNextLine = () => {
    if (!port || !port.isOpen) return;

    if (gcodeJobStatus === 'sending' && gcodeQueue.length > 0) {
      const line = gcodeQueue.shift();
      if (line) {
        port.write(line + '\n', (err) => {
          if (err) {
            console.error('Serial write error:', err.message);
            gcodeJobStatus = 'idle';
            mainWindow?.webContents.send('serial:gcode-progress', { sent: totalLines - gcodeQueue.length, total: totalLines, status: 'error' });
          }
        });
      }
    } else if (gcodeJobStatus === 'sending' && gcodeQueue.length === 0) {
      gcodeJobStatus = 'idle';
      mainWindow?.webContents.send('serial:gcode-progress', { sent: totalLines, total: totalLines, status: 'finished' });
    }
  };

  // --- Serial Port Handlers ---
  ipcMain.handle('serial:list-ports', async () => {
    try {
      const ports = await SerialPort.list();
      return { status: 'success', ports };
    } catch (e: any) {
      return { status: 'error', message: e.message };
    }
  });

  ipcMain.handle('serial:connect', (event, path, baudRate) => {
    if (port && port.isOpen) {
      return { status: 'error', message: 'A port is already open.' };
    }
    return new Promise((resolve) => {
      port = new SerialPort({ path, baudRate }, (err) => {
        if (err) {
          port = null;
          resolve({ status: 'error', message: err.message });
        } else {
          resolve({ status: 'success' });
          // Start polling for status
          if (statusInterval) clearInterval(statusInterval);
          statusInterval = setInterval(() => {
            if (port && port.isOpen) {
              port.write('?\n');
            }
          }, 250);
        }
      });

      const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

      parser.on('data', (data) => {
        const line = data.toString().trim();
        mainWindow?.webContents.send('serial:data', line);

        // Parse status reports like <Idle|WPos:0.000,0.000,0.000|MPos:0.000,0.000,0.000|FS:0,0>
        if (line.startsWith('<') && line.endsWith('>')) {
          const status = line.substring(1, line.length - 1).split('|');
          const machineStatus = {
            status: status[0],
            wpos: { x: 0, y: 0, z: 0 },
            mpos: { x: 0, y: 0, z: 0 },
          };
          status.forEach((part: string) => {
            if (part.startsWith('WPos:')) {
              const coords = part.substring(5).split(',');
              machineStatus.wpos = { x: parseFloat(coords[0]), y: parseFloat(coords[1]), z: parseFloat(coords[2]) };
            }
            if (part.startsWith('MPos:')) {
              const coords = part.substring(5).split(',');
              machineStatus.mpos = { x: parseFloat(coords[0]), y: parseFloat(coords[1]), z: parseFloat(coords[2]) };
            }
          });
          mainWindow?.webContents.send('serial:status', machineStatus);
        }

        if (line.startsWith('ok') || line.startsWith('error')) {
          mainWindow?.webContents.send('serial:gcode-progress', { sent: totalLines - gcodeQueue.length, total: totalLines, status: gcodeJobStatus });
          sendNextLine();
        }
      });

      port.on('close', () => {
        port = null;
        gcodeJobStatus = 'idle';
        gcodeQueue = [];
        if (statusInterval) clearInterval(statusInterval);
        statusInterval = null;
        mainWindow?.webContents.send('serial:closed');
      });
    });
  });

  ipcMain.handle('serial:disconnect', () => {
    return new Promise((resolve) => {
      if (port && port.isOpen) {
        port.close((err) => {
          if (err) {
            resolve({ status: 'error', message: err.message });
          } else {
            // port.on('close') will handle the rest
            resolve({ status: 'success' });
          }
        });
      } else {
        if (statusInterval) clearInterval(statusInterval);
        statusInterval = null;
        resolve({ status: 'success' }); // Already disconnected
      }
    });
  });

  // --- G-code and Jogging Handlers ---
  ipcMain.on('serial:send-gcode', (event, gcode) => {
    if (port && port.isOpen && gcodeJobStatus === 'idle') {
      gcodeQueue = gcode.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      totalLines = gcodeQueue.length;
      if (totalLines > 0) {
        gcodeJobStatus = 'sending';
        mainWindow?.webContents.send('serial:gcode-progress', { sent: 0, total: totalLines, status: 'sending' });
        sendNextLine(); // Start sending the first line
      }
    }
  });

  ipcMain.on('serial:pause-gcode', () => {
    if (gcodeJobStatus === 'sending') {
      gcodeJobStatus = 'paused';
      mainWindow?.webContents.send('serial:gcode-progress', { sent: totalLines - gcodeQueue.length, total: totalLines, status: 'paused' });
    }
  });

  ipcMain.on('serial:resume-gcode', () => {
    if (gcodeJobStatus === 'paused') {
      gcodeJobStatus = 'sending';
      mainWindow?.webContents.send('serial:gcode-progress', { sent: totalLines - gcodeQueue.length, total: totalLines, status: 'sending' });
      sendNextLine(); // Resume sending
    }
  });

  ipcMain.on('serial:stop-gcode', () => {
    gcodeQueue = [];
    gcodeJobStatus = 'idle';
    if (port && port.isOpen) {
      // Send a soft reset to Grbl to clear any running commands
      port.write('\x18');
    }
    mainWindow?.webContents.send('serial:gcode-progress', { sent: 0, total: 0, status: 'idle' });
  });

  ipcMain.on('serial:jog', (event, { axis, direction, step }) => {
    if (port && port.isOpen) {
      const command = `$J=G91 ${axis}${step * direction} F1000\n`; // Using a fixed feedrate for jogging
      port.write(command);
    }
  });

  ipcMain.on('serial:set-zero', () => {
    if (port && port.isOpen) {
      port.write('G10 L20 P1 X0 Y0 Z0\n');
    }
  });

  // --- Python Handlers ---
  ipcMain.handle('run-python-test', () => callPython('test.py', []));
  ipcMain.handle('parse-dxf-file', (event, filePath) => callPython('dxf_parser.py', [filePath]));
  ipcMain.handle('generate-contour-path', (event, toolDiameter, geometry, side) => callPython('contour_generator.py', [toolDiameter, JSON.stringify(geometry), side]));
  ipcMain.handle('generate-pocket-path', async (event, params: PocketPathParams) => {
    if (!params || !Array.isArray(params.geometry)) {
      return { status: 'error', message: 'Invalid geometry for pocket generation.' };
    }

    const { geometry, toolDiameter, stepover } = params;
    return callPython('pocket_generator.py', [
      JSON.stringify(geometry),
      toolDiameter,
      stepover,
    ]);
  });

  ipcMain.handle('open-file', async (event, fileType: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: `${fileType.toUpperCase()} Files`, extensions: [fileType] }],
    });
    if (canceled || filePaths.length === 0) {
      return { status: 'canceled' };
    }
    return { status: 'success', filePath: filePaths[0] };
  });

  ipcMain.handle('generate-3d-roughing-path', async (event, params: RoughingPathParams) => {
    if (!params?.stockPath || !params?.targetPath) {
      return { status: 'error', message: 'Missing STL file paths.' };
    }

    return callPython('z_level_roughing.py', [JSON.stringify(params)]);
  });
  ipcMain.handle('fit-arcs-to-toolpath', (event, toolpath, arcs) => callPython('arc_fitter.py', [JSON.stringify(toolpath), JSON.stringify(arcs)]));

  // SVG parser handler
  ipcMain.handle('parse-svg-file', async (event, filePath) => {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const { segments, drill_points } = parseSvgContent(data);
      return { status: 'success', segments, drill_points };
    } catch (e: any) {
      return { status: 'error', message: e.message };
    }
  });


  const setupGcodeGeneratorHandler = (name: string, script: string) => {
    ipcMain.handle(name, async (event, params) => {
      const gcodeResult = await callPython(script, [JSON.stringify(params.toolpaths || params.drillPoints), params.feedRate, params.safeZ, params.stepDown, params.peckQ, params.retractZ]);
      if (gcodeResult.status !== 'success') throw new Error(gcodeResult.message);

      const focusedWindow = BrowserWindow.fromWebContents(event.sender);
      if (!focusedWindow) throw new Error('Could not find the focused window.');

      const { canceled, filePath } = await dialog.showSaveDialog(focusedWindow, {
        title: 'Save G-code',
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

  // Build application menu and window
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

