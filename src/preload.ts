import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// レンダラープロセスに公開するAPIを定義
contextBridge.exposeInMainWorld('electronAPI', {
  // メインプロセスから'open-file'チャンネルでメッセージが来たときにコールバックを実行
  onFileOpen: (callback: (filePath: string) => void) => {
    const listener = (event: IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-file', listener);
    return () => {
      ipcRenderer.removeListener('open-file', listener);
    };
  },
  invokePythonTest: () => ipcRenderer.invoke('run-python-test'),
  generateContourPath: (toolDiameter: number, geometry: any) => ipcRenderer.invoke('generate-contour-path', toolDiameter, geometry),
  parseDxfFile: (filePath: string) => ipcRenderer.invoke('parse-dxf-file', filePath),
  generateGcode: (params: any) => ipcRenderer.invoke('generate-gcode', params)
});
