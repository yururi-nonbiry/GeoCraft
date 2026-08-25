import React, { useState } from 'react';
import {
    Typography,
    Grid,
    Box,
    TextField,
    Button,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Checkbox,
    FormControlLabel,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tabs,
    Tab,
} from '@mui/material';
import { MachineSetting, ToolSetting, WorkOrigin, Geometry, ToolpathSegment, SerialPortInfo } from '../../types';
import { TabPanel, NumberField } from './shared';
import CamTab from './CamTab';
import CncTab from './CncTab';
import SimTab from './SimTab';

interface ControlPanelProps {
    workOrigin: WorkOrigin | null;
    setWorkOrigin: (val: WorkOrigin | null) => void;
    pickOriginMode: boolean;
    setPickOriginMode: (val: boolean) => void;
    handleSelectOriginPreset: (preset: 'left-front-top' | 'left-front-bottom' | 'center-top' | 'center-bottom' | 'right-back-top' | 'table-origin') => void;
    toolDiameter: number;
    setToolDiameter: (val: number) => void;
    stepover: number;
    setStepover: (val: number) => void;
    contourSide: string;
    setContourSide: (val: string) => void;
    handleGenerateContour: () => void;
    handleGeneratePocket: () => void;
    stockStlFile: string | null;
    targetStlFile: string | null;
    handleSelectStockStl: () => void;
    handleSelectTargetStl: () => void;
    stockBoxSize: { x: number; y: number; z: number };
    setStockBoxSize: (val: { x: number; y: number; z: number }) => void;
    handleCreateBoxStock: () => void;
    pickFaceMode: 'stock' | 'target' | null;
    setPickFaceMode: (val: 'stock' | 'target' | null) => void;
    stockOffset: { x: number; y: number; z: number };
    setStockOffset: (val: { x: number; y: number; z: number }) => void;
    targetOffset: { x: number; y: number; z: number };
    setTargetOffset: (val: { x: number; y: number; z: number }) => void;
    // 3Dパス生成後のプレビューモード。true の間は材料/加工後形状の位置調整・底面選択を禁止する
    previewMode: boolean;
    onTogglePreviewMode: () => void;
    sliceHeight: number;
    setSliceHeight: (val: number) => void;
    handleGenerate3dPath: () => void;
    isGenerating3dPath: boolean;
    path3dProgress: { current: number; total: number };
    retractZ: number;
    setRetractZ: (val: number) => void;
    peckQ: number;
    setPeckQ: (val: number) => void;
    handleGenerateDrillGcode: () => void;
    feedRate: number;
    setFeedRate: (val: number) => void;
    handleSaveGcode: () => void;
    handleTransferGcodeToCnc: () => Promise<boolean>;
    safeZ: number;
    setSafeZ: (val: number) => void;
    stepDown: number;
    setStepDown: (val: number) => void;
    isConnected: boolean;
    selectedPort: string;
    setSelectedPort: (val: string) => void;
    serialPorts: SerialPortInfo[];
    baudRate: number;
    setBaudRate: (val: number) => void;
    handleRefreshPorts: () => void;
    handleConnect: () => void;
    handleDisconnect: () => void;
    connectionError: string | null;
    clearConnectionError: () => void;
    consoleLog: string[];
    gcode: string;
    setGcode: (val: string) => void;
    handleSendGcode: () => void;
    gcodeStatus: 'idle' | 'sending' | 'paused' | 'finished' | 'error';
    handlePauseGcode: () => void;
    handleResumeGcode: () => void;
    handleStopGcode: () => void;
    handleResetGcodeState: () => void;
    gcodeProgress: { sent: number; total: number };
    machinePosition: { wpos: { x: number; y: number; z: number }; mpos: { x: number; y: number; z: number }; status: string; homed: boolean };
    jogStep: number;
    setJogStep: (val: number) => void;
    handleJog: (axis: 'X' | 'Y' | 'Z', direction: number) => void;
    handleSetZero: () => void;
    enableMachineOriginReset: boolean;
    setEnableMachineOriginReset: (val: boolean) => void;
    handleResetMachineOrigin: () => void;
    handleUnlockAlarm: () => void;
    spindleSpeed: number;
    setSpindleSpeed: (val: number) => void;
    spindleOn: boolean;
    handleSpindleOn: () => void;
    handleSpindleOff: () => void;
    machineSettings: MachineSetting[];
    selectedMachineId: number | '';
    setSelectedMachineId: (val: number) => void;
    grblSettings: { stepsX: number; stepsY: number; stepsZ: number; invertX: boolean; invertY: boolean; invertZ: boolean };
    setGrblSettings: React.Dispatch<React.SetStateAction<{ stepsX: number; stepsY: number; stepsZ: number; invertX: boolean; invertY: boolean; invertZ: boolean }>>;
    handleRequestGrblSettings: () => void;
    handleSaveGrblSettings: () => void;
    toolSettings: ToolSetting[];
    selectedToolId: number | '';
    setSelectedToolId: (val: number) => void;
    processType: 'roughing' | 'finishing';
    setProcessType: (val: 'roughing' | 'finishing') => void;
    stockToLeave: number;
    setStockToLeave: (val: number) => void;
    geometry: Geometry | null;
    toolpaths: ToolpathSegment[] | null;
    showStock: boolean;
    setShowStock: (val: boolean) => void;
    showTarget: boolean;
    setShowTarget: (val: boolean) => void;
    showGeometry: boolean;
    setShowGeometry: (val: boolean) => void;
    showToolpaths: boolean;
    setShowToolpaths: (val: boolean) => void;
    handleDeleteStock: () => void;
    handleDeleteTarget: () => void;
    handleDeleteGeometry: () => void;
    handleDeleteToolpaths: () => void;
    simEnabled: boolean;
    setSimEnabled: (val: boolean) => void;
    simPlaying: boolean;
    setSimPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    simProgress: number;
    simSpeed: number;
    setSimSpeed: (val: number) => void;
    stockMargin: number;
    setStockMargin: (val: number) => void;
    stockThickness: number;
    setStockThickness: (val: number) => void;
    handleResetSimulation: () => void;
    handleSkipSimulation: () => void;
}

const SIDE_PANEL_WIDTH = 360;

const ControlPanel = (props: ControlPanelProps) => {
    const [activeTab, setActiveTab] = useState(0);
    const [isMachineSettingsOpen, setIsMachineSettingsOpen] = useState(false);
    const [isToolSettingsOpen, setIsToolSettingsOpen] = useState(false);
    const [isSetZeroConfirmOpen, setIsSetZeroConfirmOpen] = useState(false);

    return (
        <Grid
            item
            sx={{
                width: SIDE_PANEL_WIDTH,
                flexShrink: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderLeft: '1px solid #ccc',
            }}
        >
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} centered>
                    <Tab label="CAM" />
                    <Tab label="CNC" />
                    <Tab label="シミュレーション" />
                </Tabs>
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <TabPanel value={activeTab} index={0}>
                    <CamTab
                        machineSettings={props.machineSettings}
                        selectedMachineId={props.selectedMachineId}
                        setSelectedMachineId={props.setSelectedMachineId}
                        toolSettings={props.toolSettings}
                        selectedToolId={props.selectedToolId}
                        setSelectedToolId={props.setSelectedToolId}
                        toolDiameter={props.toolDiameter}
                        processType={props.processType}
                        workOrigin={props.workOrigin}
                        setWorkOrigin={props.setWorkOrigin}
                        pickOriginMode={props.pickOriginMode}
                        setPickOriginMode={props.setPickOriginMode}
                        handleSelectOriginPreset={props.handleSelectOriginPreset}
                        showStock={props.showStock}
                        setShowStock={props.setShowStock}
                        showTarget={props.showTarget}
                        setShowTarget={props.setShowTarget}
                        showGeometry={props.showGeometry}
                        setShowGeometry={props.setShowGeometry}
                        showToolpaths={props.showToolpaths}
                        setShowToolpaths={props.setShowToolpaths}
                        stepover={props.stepover}
                        setStepover={props.setStepover}
                        contourSide={props.contourSide}
                        setContourSide={props.setContourSide}
                        handleGenerateContour={props.handleGenerateContour}
                        handleGeneratePocket={props.handleGeneratePocket}
                        previewMode={props.previewMode}
                        onTogglePreviewMode={props.onTogglePreviewMode}
                        stockStlFile={props.stockStlFile}
                        targetStlFile={props.targetStlFile}
                        handleSelectStockStl={props.handleSelectStockStl}
                        handleSelectTargetStl={props.handleSelectTargetStl}
                        stockBoxSize={props.stockBoxSize}
                        setStockBoxSize={props.setStockBoxSize}
                        handleCreateBoxStock={props.handleCreateBoxStock}
                        pickFaceMode={props.pickFaceMode}
                        setPickFaceMode={props.setPickFaceMode}
                        stockOffset={props.stockOffset}
                        setStockOffset={props.setStockOffset}
                        targetOffset={props.targetOffset}
                        setTargetOffset={props.setTargetOffset}
                        sliceHeight={props.sliceHeight}
                        setSliceHeight={props.setSliceHeight}
                        handleGenerate3dPath={props.handleGenerate3dPath}
                        isGenerating3dPath={props.isGenerating3dPath}
                        path3dProgress={props.path3dProgress}
                        retractZ={props.retractZ}
                        setRetractZ={props.setRetractZ}
                        peckQ={props.peckQ}
                        setPeckQ={props.setPeckQ}
                        handleGenerateDrillGcode={props.handleGenerateDrillGcode}
                        feedRate={props.feedRate}
                        setFeedRate={props.setFeedRate}
                        handleSaveGcode={props.handleSaveGcode}
                        handleTransferGcodeToCnc={props.handleTransferGcodeToCnc}
                        onGcodeTransferred={() => setActiveTab(1)}
                        geometry={props.geometry}
                        toolpaths={props.toolpaths}
                        handleDeleteStock={props.handleDeleteStock}
                        handleDeleteTarget={props.handleDeleteTarget}
                        handleDeleteGeometry={props.handleDeleteGeometry}
                        handleDeleteToolpaths={props.handleDeleteToolpaths}
                        onOpenToolSettings={() => setIsToolSettingsOpen(true)}
                    />
                </TabPanel>
                <TabPanel value={activeTab} index={1}>
                    <CncTab
                        isConnected={props.isConnected}
                        selectedPort={props.selectedPort}
                        setSelectedPort={props.setSelectedPort}
                        serialPorts={props.serialPorts}
                        baudRate={props.baudRate}
                        setBaudRate={props.setBaudRate}
                        handleRefreshPorts={props.handleRefreshPorts}
                        handleConnect={props.handleConnect}
                        handleDisconnect={props.handleDisconnect}
                        consoleLog={props.consoleLog}
                        gcode={props.gcode}
                        setGcode={props.setGcode}
                        handleSendGcode={props.handleSendGcode}
                        gcodeStatus={props.gcodeStatus}
                        handlePauseGcode={props.handlePauseGcode}
                        handleResumeGcode={props.handleResumeGcode}
                        handleStopGcode={props.handleStopGcode}
                        handleResetGcodeState={props.handleResetGcodeState}
                        gcodeProgress={props.gcodeProgress}
                        machinePosition={props.machinePosition}
                        jogStep={props.jogStep}
                        setJogStep={props.setJogStep}
                        handleJog={props.handleJog}
                        enableMachineOriginReset={props.enableMachineOriginReset}
                        handleResetMachineOrigin={props.handleResetMachineOrigin}
                        handleUnlockAlarm={props.handleUnlockAlarm}
                        spindleSpeed={props.spindleSpeed}
                        setSpindleSpeed={props.setSpindleSpeed}
                        spindleOn={props.spindleOn}
                        handleSpindleOn={props.handleSpindleOn}
                        handleSpindleOff={props.handleSpindleOff}
                        machineSettings={props.machineSettings}
                        selectedMachineId={props.selectedMachineId}
                        setSelectedMachineId={props.setSelectedMachineId}
                        grblSettings={props.grblSettings}
                        setGrblSettings={props.setGrblSettings}
                        handleRequestGrblSettings={props.handleRequestGrblSettings}
                        handleSaveGrblSettings={props.handleSaveGrblSettings}
                        onOpenMachineSettings={() => setIsMachineSettingsOpen(true)}
                        onOpenSetZeroConfirm={() => setIsSetZeroConfirmOpen(true)}
                    />
                </TabPanel>
                <TabPanel value={activeTab} index={2}>
                    <SimTab
                        simEnabled={props.simEnabled}
                        setSimEnabled={props.setSimEnabled}
                        showStock={props.showStock}
                        setShowStock={props.setShowStock}
                        showTarget={props.showTarget}
                        setShowTarget={props.setShowTarget}
                        showToolpaths={props.showToolpaths}
                        setShowToolpaths={props.setShowToolpaths}
                        stockMargin={props.stockMargin}
                        setStockMargin={props.setStockMargin}
                        stockThickness={props.stockThickness}
                        setStockThickness={props.setStockThickness}
                        simSpeed={props.simSpeed}
                        setSimSpeed={props.setSimSpeed}
                        simPlaying={props.simPlaying}
                        setSimPlaying={props.setSimPlaying}
                        handleResetSimulation={props.handleResetSimulation}
                        simProgress={props.simProgress}
                        handleSkipSimulation={props.handleSkipSimulation}
                    />
                </TabPanel>
            </Box>
            <Dialog
                open={isMachineSettingsOpen}
                onClose={() => setIsMachineSettingsOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>マシン詳細設定</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        名称・加工範囲・G-codeヘッダー/フッターなどその他の設定は、上部メニューの「設定」画面で編集できます。
                    </Typography>
                    <NumberField
                        label="安全高さ (mm)"
                        value={props.safeZ}
                        onChange={props.setSafeZ}
                        min={0}
                        size="small"
                    />
                    <NumberField
                        label="切り込み深さ (mm)"
                        value={props.stepDown}
                        onChange={props.setStepDown}
                        validate={(v) => (v >= 0 ? 'マイナスの値を入力してください（Z方向への切込み量）' : undefined)}
                        size="small"
                    />
                    <NumberField
                        label="リトラクト高さ (mm)"
                        value={props.retractZ}
                        onChange={props.setRetractZ}
                        min={0}
                        size="small"
                    />
                    <NumberField
                        label="ペック量 (Q)"
                        value={props.peckQ}
                        onChange={props.setPeckQ}
                        validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
                        size="small"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={props.enableMachineOriginReset}
                                onChange={(e) => props.setEnableMachineOriginReset(e.target.checked)}
                            />
                        }
                        label="機械原点のリセットを有効にする"
                        sx={{ mt: 1, display: 'block' }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsMachineSettingsOpen(false)} variant="contained">
                        閉じる
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={isToolSettingsOpen}
                onClose={() => setIsToolSettingsOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>加工機・工具設定</DialogTitle>
                <DialogContent dividers>
                    <FormControl fullWidth margin="normal" size="small">
                        <InputLabel>加工機</InputLabel>
                        <Select
                            value={props.selectedMachineId}
                            label="加工機"
                            onChange={(e) => props.setSelectedMachineId(e.target.value as number)}
                        >
                            {props.machineSettings.map(machine => (
                                <MenuItem key={machine.id} value={machine.id}>{machine.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth margin="normal" size="small">
                        <InputLabel>工具</InputLabel>
                        <Select
                            value={props.selectedToolId}
                            label="工具"
                            onChange={(e) => props.setSelectedToolId(e.target.value as number)}
                        >
                            {props.toolSettings
                                .filter(t => t.machineId === props.selectedMachineId)
                                .map(tool => (
                                    <MenuItem key={tool.id} value={tool.id}>{tool.name} (Φ{tool.diameter}mm)</MenuItem>
                                ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label="工具径 (mm)"
                        type="number"
                        value={props.toolDiameter}
                        onChange={(e) => props.setToolDiameter(parseFloat(e.target.value) || 0)}
                        fullWidth
                        margin="normal"
                        size="small"
                        InputProps={{ readOnly: true }}
                        helperText="選択した工具の直径（編集不可）"
                    />
                    <FormControl fullWidth margin="normal" size="small">
                        <InputLabel>加工方法</InputLabel>
                        <Select
                            value={props.processType}
                            label="加工方法"
                            onChange={(e) => props.setProcessType(e.target.value as 'roughing' | 'finishing')}
                        >
                            <MenuItem value="roughing">粗削り</MenuItem>
                            <MenuItem value="finishing">仕上げ</MenuItem>
                        </Select>
                    </FormControl>
                    {props.processType === 'roughing' && (
                        <NumberField
                            label="仕上げのために残す量 (mm)"
                            value={props.stockToLeave}
                            onChange={props.setStockToLeave}
                            min={0}
                            size="small"
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsToolSettingsOpen(false)} variant="contained">
                        閉じる
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={isSetZeroConfirmOpen}
                onClose={() => setIsSetZeroConfirmOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>原点(G54)設定の確認</DialogTitle>
                <DialogContent dividers>
                    <Typography>現在のワーク座標をすべて0に設定します。よろしいですか？</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsSetZeroConfirmOpen(false)}>
                        キャンセル
                    </Button>
                    <Button
                        onClick={() => {
                            props.handleSetZero();
                            setIsSetZeroConfirmOpen(false);
                        }}
                        variant="contained"
                        color="secondary"
                    >
                        実行
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={!!props.connectionError}
                onClose={props.clearConnectionError}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>エラー</DialogTitle>
                <DialogContent dividers>
                    <Typography>{props.connectionError}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={props.clearConnectionError} variant="contained">
                        閉じる
                    </Button>
                </DialogActions>
            </Dialog>
        </Grid>
    );
};

export default ControlPanel;
