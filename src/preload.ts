import { contextBridge, ipcRenderer } from 'electron';

// レンダラープロセスに公開するAPIを定義
contextBridge.exposeInMainWorld('electronAPI', {
  // メインプロセスから'open-file'チャンネルでメッセージが来たときにコールバックを実行
  onFileOpen: (callback: (filePath: string) => void) => {
    ipcRenderer.on('open-file', (event, filePath) => callback(filePath));
  },
  invokePythonTest: () => ipcRenderer.invoke('run-python-test')
});
