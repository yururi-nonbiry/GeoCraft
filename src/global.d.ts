
export { };

declare global {
    interface Window {
        electronAPI: ElectronAPI;
        chrome: {
            webview: {
                hostObjects: {
                    geoCraft: any;
                };
                addEventListener: (type: string, listener: (event: any) => void) => void;
                removeEventListener: (type: string, listener: (event: any) => void) => void;
                postMessage: (message: any) => void;
            };
        };
    }
}

export type PocketPathParams = {
    geometry: number[][];
    toolDiameter: number;
    stepover: number;
};

export type RoughingPathParams = {
    stockPath: string;
    targetPath: string;
    sliceHeight: number;
    toolDiameter: number;
    stepoverRatio: number;
};

export type GcodeGenerationParams = {
    toolpaths?: unknown;
    drillPoints?: unknown;
    feedRate: number;
    safeZ: number;
    stepDown: number;
    peckQ?: number;
    retractZ: number;
};

export type SettingsPayload = Record<string, unknown>;

export interface ElectronAPI {
    // --- File/Python Operations ---
    onFileOpen: (callback: (filePath: string) => void) => () => void;
    parseDxfFile: (filePath: string) => Promise<any>;
    parseSvgFile: (filePath: string) => Promise<any>;
    generateContourPath: (toolDiameter: number, geometry: any, side: string) => Promise<any>;
    generatePocketPath: (params: PocketPathParams) => Promise<any>;
    openFile: (fileType: string) => Promise<any>;
    generate3dRoughingPath: (params: RoughingPathParams) => Promise<any>;
    fitArcsToToolpath: (toolpath: number[][], arcs: any[]) => Promise<any>;
    generateGcode: (params: GcodeGenerationParams) => Promise<any>;
    generateDrillGcode: (params: GcodeGenerationParams) => Promise<any>;

    // Settings
    getSettings: () => Promise<any>;
    saveSettings: (settings: SettingsPayload) => Promise<any>;

    // --- Serial Port Communication ---
    listSerialPorts: () => Promise<any>;
    connectSerial: (path: string, baudRate: number) => Promise<any>;
    disconnectSerial: () => Promise<any>;
    onSerialData: (callback: (data: string) => void) => () => void;
    onSerialClosed: (callback: () => void) => () => void;

    // --- G-Code Sending ---
    sendGcode: (gcode: string) => void;
    pauseGcode: () => void;
    resumeGcode: () => void;
    stopGcode: () => void;
    onGcodeProgress: (callback: (progress: { sent: number, total: number, status: 'sending' | 'paused' | 'finished' | 'error' }) => void) => () => void;

    // --- Jogging ---
    jog: (axis: 'X' | 'Y' | 'Z', direction: number, step: number) => void;
    setZero: () => void;
    onStatus: (callback: (status: any) => void) => () => void;
}
