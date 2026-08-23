import React, { useState } from 'react';
import {
    Typography,
    Paper,
    Tabs,
    Tab,
    Box,
    TextField,
    Button,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    TextareaAutosize,
    LinearProgress,
    Grid,
    Checkbox,
    FormControlLabel,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Tooltip,
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, SkipNext, Settings } from '@mui/icons-material';
import { MachineSetting, ToolSetting, WorkOrigin } from '../types';

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
    serialPorts: any[];
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
    gcodeProgress: { sent: number; total: number };
    machinePosition: { wpos: { x: number; y: number; z: number }; mpos: { x: number; y: number; z: number }; status: string; homed: boolean };
    jogStep: number;
    setJogStep: (val: number) => void;
    handleJog: (axis: 'X' | 'Y' | 'Z', direction: number) => void;
    handleSetZero: () => void;
    enableMachineOriginReset: boolean;
    setEnableMachineOriginReset: (val: boolean) => void;
    handleResetMachineOrigin: () => void;
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
    showStock: boolean;
    setShowStock: (val: boolean) => void;
    showTarget: boolean;
    setShowTarget: (val: boolean) => void;
    showToolpaths: boolean;
    setShowToolpaths: (val: boolean) => void;
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

const TabPanel = (props: { children?: React.ReactNode; index: number; value: number; sx?: any }) => {
    const { children, value, index, sx, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            style={{
                height: '100%',
                display: value === index ? 'flex' : 'none',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...sx }}>
                    {children}
                </Box>
            )}
        </div>
    );
};

const LongPressButton = (props: {
    disabled?: boolean;
    onLongPress: () => void;
    holdDuration?: number;
    children: React.ReactNode;
    color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
    variant?: 'contained' | 'outlined' | 'text';
    fullWidth?: boolean;
    startIcon?: React.ReactNode;
}) => {
    const holdDuration = props.holdDuration || 1500;
    const [progress, setProgress] = useState(0);
    const [isHolding, setIsHolding] = useState(false);
    const timerRef = React.useRef<any>(null);
    const intervalRef = React.useRef<any>(null);
    const startTimeRef = React.useRef<number>(0);

    const cancelHold = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
        timerRef.current = null;
        intervalRef.current = null;
        setIsHolding(false);
        setProgress(0);
    };

    const startHold = (e: React.SyntheticEvent) => {
        if (props.disabled) return;
        e.preventDefault();
        cancelHold();

        setIsHolding(true);
        startTimeRef.current = Date.now();

        intervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTimeRef.current;
            const pct = Math.min(100, (elapsed / holdDuration) * 100);
            setProgress(pct);
        }, 50);

        timerRef.current = setTimeout(() => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsHolding(false);
            setProgress(100);
            props.onLongPress();
            setTimeout(() => setProgress(0), 500);
        }, holdDuration);
    };

    return (
        <Tooltip title={props.disabled ? "マシン設定で有効化が必要です" : "長押しで機械原点をリセット"}>
            <Box sx={{ position: 'relative', width: props.fullWidth ? '100%' : 'auto' }}>
                <Button
                    fullWidth={props.fullWidth}
                    variant={props.variant || 'contained'}
                    color={props.color || 'warning'}
                    disabled={props.disabled}
                    onMouseDown={startHold}
                    onMouseUp={cancelHold}
                    onMouseLeave={cancelHold}
                    onTouchStart={startHold}
                    onTouchEnd={cancelHold}
                    startIcon={props.startIcon}
                >
                    {isHolding ? `長押し中... (${Math.ceil((holdDuration - progress * holdDuration / 100) / 1000)}s)` : props.children}
                </Button>
                {isHolding && (
                    <LinearProgress
                        variant="determinate"
                        value={progress}
                        color={props.color || 'warning'}
                        sx={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: 4,
                            borderRadius: '0 0 4px 4px'
                        }}
                    />
                )}
            </Box>
        </Tooltip>
    );
};

const ControlPanel = (props: ControlPanelProps) => {
    const [activeTab, setActiveTab] = useState(0);
    const [isMachineSettingsOpen, setIsMachineSettingsOpen] = useState(false);
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
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5 }}>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>加工機・工具設定</Typography>
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
                                <TextField
                                    label="仕上げのために残す量 (mm)"
                                    type="number"
                                    value={props.stockToLeave}
                                    onChange={(e) => props.setStockToLeave(parseFloat(e.target.value) || 0)}
                                    fullWidth
                                    margin="normal"
                                    size="small"
                                />
                            )}
                        </Paper>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>加工開始原点 (ワーク原点 G54)</Typography>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                Gコード出力時の原点(0,0,0)位置を設定します。3Dビュー上の頂点を選択するか、プリセットから指定できます。
                            </Typography>
                            <Button
                                variant={props.pickOriginMode ? 'contained' : 'outlined'}
                                color={props.pickOriginMode ? 'secondary' : 'primary'}
                                onClick={() => props.setPickOriginMode(!props.pickOriginMode)}
                                fullWidth
                                size="small"
                                sx={{ mb: 1 }}
                            >
                                {props.pickOriginMode ? '3Dビューで頂点を選択中 (クリックで決定)' : '3Dビュー上で頂点を選択'}
                            </Button>
                            <FormControl fullWidth size="small" margin="dense">
                                <InputLabel>プリセット選択</InputLabel>
                                <Select
                                    value={props.workOrigin?.presetName || 'custom'}
                                    label="プリセット選択"
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val !== 'custom') {
                                            props.handleSelectOriginPreset(val as any);
                                        }
                                    }}
                                >
                                    <MenuItem value="custom">頂点指定 / カスタム</MenuItem>
                                    <MenuItem value="left-front-top">材料: 左前上角</MenuItem>
                                    <MenuItem value="left-front-bottom">材料: 左前下角</MenuItem>
                                    <MenuItem value="center-top">材料: 中央上面</MenuItem>
                                    <MenuItem value="center-bottom">材料: 中央下面</MenuItem>
                                    <MenuItem value="right-back-top">材料: 右後上角</MenuItem>
                                    <MenuItem value="table-origin">テーブル基準原点 (0,0,0)</MenuItem>
                                </Select>
                            </FormControl>
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" display="block">原点座標 (mm)</Typography>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <TextField
                                        label="X"
                                        type="number"
                                        size="small"
                                        value={props.workOrigin ? props.workOrigin.x : 0}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            props.setWorkOrigin({
                                                x: val,
                                                y: props.workOrigin?.y || 0,
                                                z: props.workOrigin?.z || 0,
                                                type: 'custom',
                                                presetName: 'custom',
                                            });
                                        }}
                                    />
                                    <TextField
                                        label="Y"
                                        type="number"
                                        size="small"
                                        value={props.workOrigin ? props.workOrigin.y : 0}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            props.setWorkOrigin({
                                                x: props.workOrigin?.x || 0,
                                                y: val,
                                                z: props.workOrigin?.z || 0,
                                                type: 'custom',
                                                presetName: 'custom',
                                            });
                                        }}
                                    />
                                    <TextField
                                        label="Z"
                                        type="number"
                                        size="small"
                                        value={props.workOrigin ? props.workOrigin.z : 0}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            props.setWorkOrigin({
                                                x: props.workOrigin?.x || 0,
                                                y: props.workOrigin?.y || 0,
                                                z: val,
                                                type: 'custom',
                                                presetName: 'custom',
                                            });
                                        }}
                                    />
                                    <Button
                                        size="small"
                                        onClick={() => props.setWorkOrigin(null)}
                                    >
                                        リセット
                                    </Button>
                                </Box>
                            </Box>
                        </Paper>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>2.5D 加工 (DXF/SVG)</Typography>
                            <TextField label="ステップオーバー (%)" type="number" value={props.stepover * 100} onChange={(e) => props.setStepover(parseFloat(e.target.value) / 100)} fullWidth margin="normal" size="small" />
                            <FormControl fullWidth margin="normal" size="small">
                                <InputLabel>輪郭方向</InputLabel>
                                <Select value={props.contourSide} label="輪郭方向" onChange={(e) => props.setContourSide(e.target.value as string)}>
                                    <MenuItem value="outer">外側</MenuItem>
                                    <MenuItem value="inner">内側</MenuItem>
                                </Select>
                            </FormControl>
                            <Button variant="contained" onClick={props.handleGenerateContour} sx={{ mr: 1 }}>輪郭パス生成</Button>
                            <Button variant="contained" onClick={props.handleGeneratePocket}>ポケットパス生成</Button>
                        </Paper>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="h6">3D 加工 (STL)</Typography>
                                {(props.previewMode || (props.stockStlFile && props.targetStlFile)) && (
                                    <Button
                                        variant={props.previewMode ? 'contained' : 'outlined'}
                                        color={props.previewMode ? 'secondary' : 'primary'}
                                        size="small"
                                        onClick={props.onTogglePreviewMode}
                                    >
                                        {props.previewMode ? 'プレビュー解除' : 'プレビューモード'}
                                    </Button>
                                )}
                            </Box>
                            {props.previewMode && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                    プレビューモード中は材料・加工後形状の位置を変更できません。パラメータ変更とパスの再生成は可能です。プレビューを解除すると生成済みのパスは削除されます。
                                </Typography>
                            )}
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', mb: 1 }}>
                                <FormControlLabel
                                    control={<Checkbox checked={props.showStock} onChange={(e) => props.setShowStock(e.target.checked)} />}
                                    label="材料を表示"
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={props.showTarget} onChange={(e) => props.setShowTarget(e.target.checked)} />}
                                    label="加工後形状を表示"
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={props.showToolpaths} onChange={(e) => props.setShowToolpaths(e.target.checked)} />}
                                    label="パスを表示"
                                />
                            </Box>
                            <Box sx={{ mb: 2 }}>
                                <Button variant="outlined" onClick={props.handleSelectStockStl} fullWidth>材料STLを選択</Button>
                                <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption" display="block">四角い材料を寸法入力で投入 (mm)</Typography>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <TextField label="幅 X" type="number" size="small" value={props.stockBoxSize.x}
                                            onChange={(e) => props.setStockBoxSize({ ...props.stockBoxSize, x: parseFloat(e.target.value) || 0 })} />
                                        <TextField label="奥行き Y" type="number" size="small" value={props.stockBoxSize.y}
                                            onChange={(e) => props.setStockBoxSize({ ...props.stockBoxSize, y: parseFloat(e.target.value) || 0 })} />
                                        <TextField label="高さ Z" type="number" size="small" value={props.stockBoxSize.z}
                                            onChange={(e) => props.setStockBoxSize({ ...props.stockBoxSize, z: parseFloat(e.target.value) || 0 })} />
                                    </Box>
                                    <Button variant="outlined" onClick={props.handleCreateBoxStock} fullWidth size="small" sx={{ mt: 1 }}>四角い材料を投入</Button>
                                </Box>
                                {props.stockStlFile && <Typography variant="caption" display="block" sx={{ mt: 1, textAlign: 'center' }}>{props.stockStlFile.split('\\').pop()}</Typography>}
                                {props.stockStlFile && (
                                    <Button
                                        variant={props.pickFaceMode === 'stock' ? 'contained' : 'outlined'}
                                        color={props.pickFaceMode === 'stock' ? 'secondary' : 'primary'}
                                        onClick={() => props.setPickFaceMode(props.pickFaceMode === 'stock' ? null : 'stock')}
                                        disabled={props.previewMode}
                                        fullWidth
                                        size="small"
                                        sx={{ mt: 1 }}
                                    >
                                        {props.pickFaceMode === 'stock' ? '3Dビューで底面をクリック(キャンセル)' : '底面となる面を選択'}
                                    </Button>
                                )}
                                {props.stockStlFile && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant="caption" display="block">位置調整 (mm)</Typography>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <TextField label="X" type="number" size="small" value={props.stockOffset.x} disabled={props.previewMode}
                                                onChange={(e) => props.setStockOffset({ ...props.stockOffset, x: parseFloat(e.target.value) || 0 })} />
                                            <TextField label="Y" type="number" size="small" value={props.stockOffset.y} disabled={props.previewMode}
                                                onChange={(e) => props.setStockOffset({ ...props.stockOffset, y: parseFloat(e.target.value) || 0 })} />
                                            <TextField label="Z" type="number" size="small" value={props.stockOffset.z} disabled={props.previewMode}
                                                onChange={(e) => props.setStockOffset({ ...props.stockOffset, z: parseFloat(e.target.value) || 0 })} />
                                            <Button size="small" disabled={props.previewMode} onClick={() => props.setStockOffset({ x: 0, y: 0, z: 0 })}>リセット</Button>
                                        </Box>
                                    </Box>
                                )}
                            </Box>
                            <Box sx={{ mb: 2 }}>
                                <Button variant="outlined" onClick={props.handleSelectTargetStl} fullWidth>加工後形状STLを選択</Button>
                                {props.targetStlFile && <Typography variant="caption" display="block" sx={{ mt: 1, textAlign: 'center' }}>{props.targetStlFile.split('\\').pop()}</Typography>}
                                {props.targetStlFile && (
                                    <Button
                                        variant={props.pickFaceMode === 'target' ? 'contained' : 'outlined'}
                                        color={props.pickFaceMode === 'target' ? 'secondary' : 'primary'}
                                        onClick={() => props.setPickFaceMode(props.pickFaceMode === 'target' ? null : 'target')}
                                        disabled={props.previewMode}
                                        fullWidth
                                        size="small"
                                        sx={{ mt: 1 }}
                                    >
                                        {props.pickFaceMode === 'target' ? '3Dビューで底面をクリック(キャンセル)' : '底面となる面を選択'}
                                    </Button>
                                )}
                                {props.targetStlFile && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant="caption" display="block">位置調整 (mm)</Typography>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <TextField label="X" type="number" size="small" value={props.targetOffset.x} disabled={props.previewMode}
                                                onChange={(e) => props.setTargetOffset({ ...props.targetOffset, x: parseFloat(e.target.value) || 0 })} />
                                            <TextField label="Y" type="number" size="small" value={props.targetOffset.y} disabled={props.previewMode}
                                                onChange={(e) => props.setTargetOffset({ ...props.targetOffset, y: parseFloat(e.target.value) || 0 })} />
                                            <TextField label="Z" type="number" size="small" value={props.targetOffset.z} disabled={props.previewMode}
                                                onChange={(e) => props.setTargetOffset({ ...props.targetOffset, z: parseFloat(e.target.value) || 0 })} />
                                            <Button size="small" disabled={props.previewMode} onClick={() => props.setTargetOffset({ x: 0, y: 0, z: 0 })}>リセット</Button>
                                        </Box>
                                    </Box>
                                )}
                            </Box>
                            <TextField label="スライス厚 (mm)" type="number" value={props.sliceHeight} onChange={(e) => props.setSliceHeight(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                            <Button variant="contained" onClick={props.handleGenerate3dPath} disabled={props.isGenerating3dPath} fullWidth>
                                {props.isGenerating3dPath ? '3Dパス生成中...' : '3D加工パス生成'}
                            </Button>
                            {props.isGenerating3dPath && (
                                <Box sx={{ mt: 1 }}>
                                    <LinearProgress
                                        variant={props.path3dProgress.total > 0 ? 'determinate' : 'indeterminate'}
                                        value={props.path3dProgress.total > 0 ? (props.path3dProgress.current / props.path3dProgress.total) * 100 : 0}
                                    />
                                    {props.path3dProgress.total > 0 && (
                                        <Typography variant="body2" align="right">{props.path3dProgress.current}/{props.path3dProgress.total}</Typography>
                                    )}
                                </Box>
                            )}
                        </Paper>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>ドリル加工</Typography>
                            <TextField label="リトラクト高さ (mm)" type="number" value={props.retractZ} onChange={(e) => props.setRetractZ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                            <TextField label="ペック量 (Q)" type="number" value={props.peckQ} onChange={(e) => props.setPeckQ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                            <Button variant="contained" onClick={props.handleGenerateDrillGcode}>ドリルGコード生成</Button>
                        </Paper>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>Gコード保存</Typography>
                            <TextField label="送り速度 (mm/min)" type="number" value={props.feedRate} onChange={(e) => props.setFeedRate(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button variant="contained" onClick={props.handleSaveGcode}>Gコード保存</Button>
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={async () => {
                                        const ok = await props.handleTransferGcodeToCnc();
                                        if (ok) setActiveTab(1);
                                    }}
                                >
                                    CNCへ転送
                                </Button>
                            </Box>
                        </Paper>
                    </Box>
                </TabPanel>
                <TabPanel value={activeTab} index={1}>
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5, mb: 1 }}>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="h6">マシン設定</Typography>
                                <Tooltip title="詳細設定">
                                    <IconButton size="small" onClick={() => setIsMachineSettingsOpen(true)}>
                                        <Settings />
                                    </IconButton>
                                </Tooltip>
                            </Box>
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
                        </Paper>
                        {props.isConnected && (
                            <Paper sx={{ p: 2, mb: 2 }}>
                                <Typography variant="h6" gutterBottom>加工機パラメータ (Grbl)</Typography>
                                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                    <Button variant="outlined" size="small" onClick={props.handleRequestGrblSettings} fullWidth>
                                        設定読み込み
                                    </Button>
                                    <Button variant="contained" size="small" onClick={props.handleSaveGrblSettings} fullWidth>
                                        設定書き込み
                                    </Button>
                                </Box>
                                <TextField
                                    label="X軸ステップ数 (step/mm)"
                                    type="number"
                                    value={props.grblSettings.stepsX}
                                    onChange={(e) => props.setGrblSettings(prev => ({ ...prev, stepsX: parseFloat(e.target.value) || 0 }))}
                                    fullWidth margin="normal" size="small"
                                />
                                <TextField
                                    label="Y軸ステップ数 (step/mm)"
                                    type="number"
                                    value={props.grblSettings.stepsY}
                                    onChange={(e) => props.setGrblSettings(prev => ({ ...prev, stepsY: parseFloat(e.target.value) || 0 }))}
                                    fullWidth margin="normal" size="small"
                                />
                                <TextField
                                    label="Z軸ステップ数 (step/mm)"
                                    type="number"
                                    value={props.grblSettings.stepsZ}
                                    onChange={(e) => props.setGrblSettings(prev => ({ ...prev, stepsZ: parseFloat(e.target.value) || 0 }))}
                                    fullWidth margin="normal" size="small"
                                />
                                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column' }}>
                                    <Typography variant="body2" sx={{ mb: 0.5 }}>移動方向の反転 (逆転)</Typography>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={props.grblSettings.invertX}
                                                onChange={(e) => props.setGrblSettings(prev => ({ ...prev, invertX: e.target.checked }))}
                                                size="small"
                                            />
                                        }
                                        label="X軸反転"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={props.grblSettings.invertY}
                                                onChange={(e) => props.setGrblSettings(prev => ({ ...prev, invertY: e.target.checked }))}
                                                size="small"
                                            />
                                        }
                                        label="Y軸反転"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={props.grblSettings.invertZ}
                                                onChange={(e) => props.setGrblSettings(prev => ({ ...prev, invertZ: e.target.checked }))}
                                                size="small"
                                            />
                                        }
                                        label="Z軸反転"
                                    />
                                </Box>
                            </Paper>
                        )}
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>CNC 接続</Typography>
                            <FormControl fullWidth margin="normal" size="small" disabled={props.isConnected}>
                                <InputLabel>ポート</InputLabel>
                                <Select value={props.selectedPort} label="ポート" onChange={(e) => props.setSelectedPort(e.target.value as string)}>
                                    {props.serialPorts.map(port => <MenuItem key={port.path} value={port.path}>{port.path}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField label="ボーレート" type="number" value={props.baudRate} onChange={(e) => props.setBaudRate(parseInt(e.target.value))} fullWidth margin="normal" size="small" disabled={props.isConnected} />
                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                <Button variant="outlined" onClick={props.handleRefreshPorts} disabled={props.isConnected} startIcon={<Refresh />}>更新</Button>
                                {!props.isConnected ? (
                                    <Button variant="contained" onClick={props.handleConnect} startIcon={<Link />}>接続</Button>
                                ) : (
                                    <Button variant="contained" color="secondary" onClick={props.handleDisconnect} startIcon={<LinkOff />}>切断</Button>
                                )}
                            </Box>
                            <TextareaAutosize
                                readOnly
                                minRows={5}
                                value={props.consoleLog.join('\n')}
                                style={{ width: '100%', marginTop: '1rem', backgroundColor: '#222', color: '#0f0', fontFamily: 'monospace', padding: '8px' }}
                            />
                        </Paper>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>Gコード送信</Typography>
                            <TextField
                                multiline
                                rows={8}
                                fullWidth
                                variant="outlined"
                                value={props.gcode}
                                onChange={(e) => props.setGcode(e.target.value)}
                                placeholder="ここにG-codeを貼り付け..."
                                sx={{ mb: 1, fontFamily: 'monospace' }}
                            />
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                                <Button variant="contained" onClick={props.handleSendGcode} disabled={!props.isConnected || props.gcodeStatus !== 'idle'} startIcon={<PlayArrow />}>送信</Button>
                                <Button variant="outlined" onClick={props.handlePauseGcode} disabled={props.gcodeStatus !== 'sending'} startIcon={<Pause />}>一時停止</Button>
                                <Button variant="outlined" onClick={props.handleResumeGcode} disabled={props.gcodeStatus !== 'paused'} startIcon={<PlayArrow />}>再開</Button>
                                <Button variant="outlined" color="secondary" onClick={props.handleStopGcode} disabled={props.gcodeStatus === 'idle'} startIcon={<Stop />}>停止</Button>
                            </Box>
                            <Box sx={{ width: '100%' }}>
                                <Typography variant="body2">状態: {{ 'idle': '待機中', 'sending': '送信中', 'paused': '一時停止中', 'finished': '完了', 'error': 'エラー' }[props.gcodeStatus] || props.gcodeStatus}</Typography>
                                <LinearProgress variant="determinate" value={(props.gcodeProgress.total > 0 ? (props.gcodeProgress.sent / props.gcodeProgress.total) * 100 : 0)} />
                                <Typography variant="body2" align="right">{props.gcodeProgress.sent}/{props.gcodeProgress.total}</Typography>
                            </Box>
                        </Paper>
                    </Box>
                    <Paper sx={{ p: 2, flexShrink: 0, mb: 0 }}>
                        <Typography variant="h6" gutterBottom>手動操作 (Jog)</Typography>
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2">マシン状態: {props.machinePosition.status}</Typography>
                            <Typography variant="body2">WPos: X:{props.machinePosition.wpos.x.toFixed(3)} Y:{props.machinePosition.wpos.y.toFixed(3)} Z:{props.machinePosition.wpos.z.toFixed(3)}</Typography>
                            <Typography variant="body2">MPos: X:{props.machinePosition.mpos.x.toFixed(3)} Y:{props.machinePosition.mpos.y.toFixed(3)} Z:{props.machinePosition.mpos.z.toFixed(3)}</Typography>
                            <Typography variant="caption" color={props.machinePosition.homed ? 'success.main' : 'text.secondary'}>
                                {props.machinePosition.homed ? '原点設定済み: MPos<0への移動を制限中' : '原点未設定: 移動制限なし'}
                            </Typography>
                        </Box>
                        <FormControl fullWidth margin="dense" size="small" sx={{ mb: 2 }}>
                            <InputLabel id="jog-step-select-label">移動量 (mm)</InputLabel>
                            <Select
                                labelId="jog-step-select-label"
                                value={props.jogStep}
                                label="移動量 (mm)"
                                onChange={(e) => props.setJogStep(Number(e.target.value))}
                            >
                                {[0.01, 0.1, 1, 10, 50, 100].map((step) => (
                                    <MenuItem key={step} value={step}>
                                        {step} mm
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Grid container spacing={1} alignItems="center" justifyContent="center">
                            <Grid item xs={4} />
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('Y', 1)}>Y+</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('Z', 1)}>Z+</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('X', -1)}>X-</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="contained" color="secondary" onClick={() => setIsSetZeroConfirmOpen(true)} startIcon={<Settings />}>原点(G54)</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('X', 1)}>X+</Button></Grid>
                            <Grid item xs={4} />
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('Y', -1)}>Y-</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('Z', -1)}>Z-</Button></Grid>
                        </Grid>
                        <Box sx={{ mt: 1.5 }}>
                            <LongPressButton
                                fullWidth
                                variant="contained"
                                color="warning"
                                disabled={!props.isConnected || !props.enableMachineOriginReset}
                                onLongPress={props.handleResetMachineOrigin}
                                startIcon={<Refresh />}
                            >
                                機械原点リセット (長押し)
                            </LongPressButton>
                        </Box>
                        <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                            <Typography variant="subtitle2" gutterBottom>スピンドル</Typography>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <TextField
                                    label="回転数 (rpm)"
                                    type="number"
                                    size="small"
                                    value={props.spindleSpeed}
                                    onChange={(e) => props.setSpindleSpeed(Number(e.target.value))}
                                    sx={{ width: 140 }}
                                />
                                <Button
                                    variant="contained"
                                    color="success"
                                    startIcon={<PlayArrow />}
                                    onClick={props.handleSpindleOn}
                                    disabled={!props.isConnected || props.spindleOn}
                                >
                                    ON
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="secondary"
                                    startIcon={<Stop />}
                                    onClick={props.handleSpindleOff}
                                    disabled={!props.isConnected || !props.spindleOn}
                                >
                                    OFF
                                </Button>
                            </Box>
                        </Box>
                    </Paper>
                </TabPanel>
                <TabPanel value={activeTab} index={2}>
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5 }}>
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>加工シミュレーション</Typography>
                            <FormControlLabel
                                control={<Checkbox checked={props.simEnabled} onChange={(e) => props.setSimEnabled(e.target.checked)} />}
                                label="シミュレーションを表示"
                            />
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', mb: 1 }}>
                                <FormControlLabel
                                    control={<Checkbox checked={props.showStock} onChange={(e) => props.setShowStock(e.target.checked)} />}
                                    label="材料を表示"
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={props.showTarget} onChange={(e) => props.setShowTarget(e.target.checked)} />}
                                    label="加工後形状を表示"
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={props.showToolpaths} onChange={(e) => props.setShowToolpaths(e.target.checked)} />}
                                    label="パスを表示"
                                />
                            </Box>
                            <TextField
                                label="素材マージン (mm)"
                                type="number"
                                value={props.stockMargin}
                                onChange={(e) => props.setStockMargin(parseFloat(e.target.value) || 0)}
                                fullWidth
                                margin="normal"
                                size="small"
                            />
                            <TextField
                                label="素材厚み (mm)"
                                type="number"
                                value={props.stockThickness}
                                onChange={(e) => props.setStockThickness(parseFloat(e.target.value) || 0)}
                                fullWidth
                                margin="normal"
                                size="small"
                            />
                            <FormControl fullWidth margin="normal" size="small">
                                <InputLabel>再生速度</InputLabel>
                                <Select
                                    value={props.simSpeed}
                                    label="再生速度"
                                    onChange={(e) => props.setSimSpeed(e.target.value as number)}
                                >
                                    <MenuItem value={0.5}>0.5x</MenuItem>
                                    <MenuItem value={1}>1x</MenuItem>
                                    <MenuItem value={2}>2x</MenuItem>
                                    <MenuItem value={5}>5x</MenuItem>
                                    <MenuItem value={10}>10x</MenuItem>
                                    <MenuItem value={50}>50x</MenuItem>
                                </Select>
                            </FormControl>
                            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                <Button
                                    variant="contained"
                                    startIcon={props.simPlaying ? <Pause /> : <PlayArrow />}
                                    disabled={!props.simEnabled}
                                    onClick={() => props.setSimPlaying((p) => !p)}
                                >
                                    {props.simPlaying ? '一時停止' : '再生'}
                                </Button>
                                <Button variant="outlined" startIcon={<Stop />} disabled={!props.simEnabled} onClick={props.handleResetSimulation}>リセット</Button>
                                <Button variant="outlined" startIcon={<SkipNext />} disabled={!props.simEnabled || props.simProgress >= 1} onClick={props.handleSkipSimulation}>最後まで飛ばす</Button>
                            </Box>
                            <Box sx={{ width: '100%' }}>
                                <LinearProgress variant="determinate" value={props.simProgress * 100} />
                                <Typography variant="body2" align="right">{Math.round(props.simProgress * 100)}%</Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                現在生成されているツールパスを、選択中の工具径・各点の切込み深さ(3D荒加工パスは層ごとの実際の深さ、2D輪郭/ポケットパスは選択中の切込み深さ設定)で材料除去をシミュレートします（工具はボールエンド/Vビット等の形状を区別せず円柱状の除去として近似しています）。
                            </Typography>
                        </Paper>
                    </Box>
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
                    <TextField
                        label="安全高さ (mm)"
                        type="number"
                        value={props.safeZ}
                        onChange={(e) => props.setSafeZ(parseFloat(e.target.value) || 0)}
                        fullWidth
                        margin="normal"
                        size="small"
                    />
                    <TextField
                        label="切り込み深さ (mm)"
                        type="number"
                        value={props.stepDown}
                        onChange={(e) => props.setStepDown(parseFloat(e.target.value) || 0)}
                        fullWidth
                        margin="normal"
                        size="small"
                    />
                    <TextField
                        label="リトラクト高さ (mm)"
                        type="number"
                        value={props.retractZ}
                        onChange={(e) => props.setRetractZ(parseFloat(e.target.value) || 0)}
                        fullWidth
                        margin="normal"
                        size="small"
                    />
                    <TextField
                        label="ペック量 (Q)"
                        type="number"
                        value={props.peckQ}
                        onChange={(e) => props.setPeckQ(parseFloat(e.target.value) || 0)}
                        fullWidth
                        margin="normal"
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
