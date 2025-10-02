import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

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


type GcodeGenerationParams = {
  toolpaths?: unknown;
  drillPoints?: unknown;
  feedRate: number;
  safeZ: number;
  stepDown: number;
  peckQ?: number;
  retractZ: number;
};

type SettingsPayload = Record<string, unknown>;

// Define the API we want to expose to the renderer process
const electronAPI = {
  // --- File/Python Operations ---
  onFileOpen: (callback: (filePath: string) => void): () => void => {
    const listener = (event: IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-file', listener);
    return () => ipcRenderer.removeListener('open-file', listener);
  },
  parseDxfFile: (filePath: string) => ipcRenderer.invoke('parse-dxf-file', filePath),
  parseSvgFile: (filePath: string) => ipcRenderer.invoke('parse-svg-file', filePath),
  generateContourPath: (toolDiameter: number, geometry: any, side: string) => ipcRenderer.invoke('generate-contour-path', toolDiameter, geometry, side),
  generatePocketPath: (params: PocketPathParams) => ipcRenderer.invoke('generate-pocket-path', params),
  openFile: (fileType: string) => ipcRenderer.invoke('open-file', fileType),
  generate3dRoughingPath: (params: RoughingPathParams) => ipcRenderer.invoke('generate-3d-roughing-path', params),
  fitArcsToToolpath: (toolpath: number[][], arcs: any[]) => ipcRenderer.invoke('fit-arcs-to-toolpath', toolpath, arcs),
  generateGcode: (params: GcodeGenerationParams) => ipcRenderer.invoke('generate-gcode', params),
  generateDrillGcode: (params: GcodeGenerationParams) => ipcRenderer.invoke('generate-drill-gcode', params),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: SettingsPayload) => ipcRenderer.invoke('save-settings', settings),

  // File System

  // --- Serial Port Communication ---
  listSerialPorts: () => ipcRenderer.invoke('serial:list-ports'),
  connectSerial: (path: string, baudRate: number) => ipcRenderer.invoke('serial:connect', path, baudRate),
  disconnectSerial: () => ipcRenderer.invoke('serial:disconnect'),
  onSerialData: (callback: (data: string) => void): () => void => {
    const listener = (event: IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('serial:data', listener);
    return () => ipcRenderer.removeListener('serial:data', listener);
  },
  onSerialClosed: (callback: () => void): () => void => {
    const listener = () => callback();
    ipcRenderer.on('serial:closed', listener);
    return () => ipcRenderer.removeListener('serial:closed', listener);
  },

  // --- G-Code Sending ---
  sendGcode: (gcode: string) => ipcRenderer.send('serial:send-gcode', gcode),
  pauseGcode: () => ipcRenderer.send('serial:pause-gcode'),
  resumeGcode: () => ipcRenderer.send('serial:resume-gcode'),
  stopGcode: () => ipcRenderer.send('serial:stop-gcode'),
  onGcodeProgress: (callback: (progress: { sent: number, total: number, status: 'sending' | 'paused' | 'finished' | 'error' }) => void): () => void => {
    const listener = (event: IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on('serial:gcode-progress', listener);
    return () => ipcRenderer.removeListener('serial:gcode-progress', listener);
  },

  // --- Jogging ---
  jog: (axis: 'X' | 'Y' | 'Z', direction: number, step: number) => ipcRenderer.send('serial:jog', { axis, direction, step }),
  setZero: () => ipcRenderer.send('serial:set-zero'),
  onStatus: (callback: (status: any) => void): () => void => {
      const listener = (event: IpcRendererEvent, status: any) => callback(status);
      ipcRenderer.on('serial:status', listener);
      return () => ipcRenderer.removeListener('serial:status', listener);
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
