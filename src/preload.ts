import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Define the API we want to expose to the renderer process
const electronAPI = {
  // --- File/Python Operations ---
  onFileOpen: (callback: (filePath: string) => void) => {
    const listener = (event: IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-file', listener);
    return () => ipcRenderer.removeListener('open-file', listener);
  },
  parseDxfFile: (filePath: string) => ipcRenderer.invoke('parse-dxf-file', filePath),
  parseSvgFile: (filePath: string) => ipcRenderer.invoke('parse-svg-file', filePath),
  generateContourPath: (toolDiameter: number, geometry: any, side: string) => ipcRenderer.invoke('generate-contour-path', toolDiameter, geometry, side),
  generatePocketPath: (params: any) => ipcRenderer.invoke('generate-pocket-path', params),
  generate3dPath: (params: any) => ipcRenderer.invoke('generate-3d-path', params),
  fitArcsToToolpath: (toolpath: number[][], arcs: any[]) => ipcRenderer.invoke('fit-arcs-to-toolpath', toolpath, arcs),
  generateGcode: (params: any) => ipcRenderer.invoke('generate-gcode', params),
  generateDrillGcode: (params: any) => ipcRenderer.invoke('generate-drill-gcode', params),

  // --- Serial Port Communication ---
  listSerialPorts: () => ipcRenderer.invoke('serial:list-ports'),
  connectSerial: (path: string, baudRate: number) => ipcRenderer.invoke('serial:connect', path, baudRate),
  disconnectSerial: () => ipcRenderer.invoke('serial:disconnect'),
  onSerialData: (callback: (data: string) => void) => {
    const listener = (event: IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('serial:data', listener);
    return () => ipcRenderer.removeListener('serial:data', listener);
  },
  onSerialClosed: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('serial:closed', listener);
    return () => ipcRenderer.removeListener('serial:closed', listener);
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// It's good practice to also type the API for the renderer process
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}