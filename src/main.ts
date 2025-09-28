import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { spawn } from 'child_process';

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
        label: 'STLファイルを開く...',
        click: async (item, window) => {
          if (window instanceof BrowserWindow) {
            const result = await dialog.showOpenDialog(window, {
              properties: ['openFile'],
              filters: [
                { name: 'STL Files', extensions: ['stl'] }
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
  // IPCハンドラの設定
  ipcMain.handle('run-python-test', async () => {
    return new Promise((resolve, reject) => {
      // 開発時のPythonスクリプトへのパスを解決
      // 注意: パッケージ化する際は、このパスの解決方法を変更する必要がある
      const scriptPath = path.join(app.getAppPath(), 'src', 'python', 'test.py');
      const pythonProcess = spawn('python', [scriptPath]);

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