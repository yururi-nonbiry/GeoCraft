import type { ElectronAPI, PocketPathParams, RoughingPathParams, GcodeGenerationParams, SettingsPayload } from './global';

class WebView2API implements ElectronAPI {
    private bridge: any;
    private listeners: Map<string, Array<(data: any) => void>> = new Map();

    constructor() {
        // Check if running in WebView2
        if (window.chrome?.webview?.hostObjects?.geoCraft) {
            this.bridge = window.chrome.webview.hostObjects.geoCraft;

            // Setup Message Listener
            window.chrome.webview.addEventListener('message', (event) => {
                const { type, payload } = event.data; // or event.data if it's already an object? 
                // WebView2 PostWebMessageAsJson sends the parsed object in event.data usually.
                // But let's handle if it sends string.
                let msg = event.data;
                if (typeof msg === 'string') {
                    try { msg = JSON.parse(msg); } catch { }
                }

                if (msg && msg.type) {
                    this.emit(msg.type, msg.payload);
                }
            });
        } else {
            console.warn("WebView2 Bridge not found. Running in detached mode?");
            this.bridge = {}; // Mock or throw
        }
    }

    private emit(type: string, payload: any) {
        const handlers = this.listeners.get(type);
        if (handlers) {
            handlers.forEach(h => h(payload));
        }
    }

    private on(type: string, callback: (data: any) => void): () => void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type)!.push(callback);
        return () => {
            const handlers = this.listeners.get(type);
            if (handlers) {
                this.listeners.set(type, handlers.filter(h => h !== callback));
            }
        };
    }

    // Helper to parse JSON result from C#
    private async callBridge(method: string, ...args: any[]): Promise<any> {
        if (!this.bridge || !this.bridge[method]) {
            console.error(`Bridge method ${method} not found.`);
            return { status: 'error', message: 'Bridge not connected' };
        }
        try {
            const resultJson = await this.bridge[method](...args);
            try {
                return JSON.parse(resultJson);
            } catch {
                return resultJson;
            }
        } catch (err) {
            console.error(`Bridge call failed: ${err}`);
            return { status: 'error', message: String(err) };
        }
    }

    // --- API Implementation ---

    onFileOpen(callback: (filePath: string) => void) { return this.on('file-open', callback); }

    parseDxfFile(filePath: string) { return this.callBridge('ParseDxfFile', filePath); }
    parseSvgFile(filePath: string) { return this.callBridge('ParseSvgFile', filePath); }
    generateContourPath(toolDiameter: number, geometry: any, side: string) {
        return this.callBridge('GenerateContourPath', toolDiameter, JSON.stringify(geometry), side);
    }
    generatePocketPath(params: PocketPathParams) {
        return this.callBridge('GeneratePocketPath', JSON.stringify(params));
    }
    openFile(fileType: string) { return this.callBridge('OpenFile', fileType); }
    generate3dRoughingPath(params: RoughingPathParams) {
        return this.callBridge('Generate3dRoughingPath', JSON.stringify(params));
    }
    fitArcsToToolpath(toolpath: number[][], arcs: any[]) {
        return this.callBridge('FitArcsToToolpath', JSON.stringify(toolpath), JSON.stringify(arcs));
    }
    generateGcode(params: GcodeGenerationParams) {
        return this.callBridge('GenerateGcode', JSON.stringify(params));
    }
    generateDrillGcode(params: GcodeGenerationParams) {
        return this.callBridge('GenerateDrillGcode', JSON.stringify(params));
    }

    getSettings() { return this.callBridge('GetSettings'); }
    saveSettings(settings: SettingsPayload) { return this.callBridge('SaveSettings', JSON.stringify(settings)); }

    listSerialPorts() { return this.callBridge('ListSerialPorts'); }
    connectSerial(path: string, baudRate: number) { return this.callBridge('ConnectSerial', path, baudRate); }
    disconnectSerial() { return this.callBridge('DisconnectSerial'); }

    onSerialData(callback: (data: string) => void) { return this.on('serial-data', callback); }
    onSerialClosed(callback: () => void) { return this.on('serial-closed', callback); }

    sendGcode(gcode: string) { this.callBridge('SendGcode', gcode); }
    pauseGcode() { this.callBridge('PauseGcode'); }
    resumeGcode() { this.callBridge('ResumeGcode'); }
    stopGcode() { this.callBridge('StopGcode'); }

    onGcodeProgress(callback: (progress: any) => void) { return this.on('gcode-progress', callback); }

    jog(axis: 'X' | 'Y' | 'Z', direction: number, step: number) { this.callBridge('Jog', axis, direction, step); }
    setZero() { this.callBridge('SetZero'); }
    onStatus(callback: (status: any) => void) { return this.on('serial-status', callback); }
}

// Export singleton
export const api = new WebView2API();
// Fallback for console debugging
(window as any).electronAPI = api;
