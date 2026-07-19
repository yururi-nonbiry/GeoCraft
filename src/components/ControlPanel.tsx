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
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, Settings } from '@mui/icons-material';
import { MachineSetting, ToolSetting } from '../types';

interface ControlPanelProps {
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
    consoleLog: string[];
    gcode: string;
    setGcode: (val: string) => void;
    handleSendGcode: () => void;
    gcodeStatus: 'idle' | 'sending' | 'paused' | 'finished' | 'error';
    handlePauseGcode: () => void;
    handleResumeGcode: () => void;
    handleStopGcode: () => void;
    gcodeProgress: { sent: number; total: number };
    machinePosition: { wpos: { x: number; y: number; z: number }; mpos: { x: number; y: number; z: number }; status: string };
    jogStep: number;
    setJogStep: (val: number) => void;
    handleJog: (axis: 'X' | 'Y' | 'Z', direction: number) => void;
    handleSetZero: () => void;
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
}

const SIDE_PANEL_WIDTH = 360;

const TabPanel = (props: { children?: React.ReactNode; index: number; value: number; }) => {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
        </div>
    );
}

const ControlPanel = (props: ControlPanelProps) => {
    const [activeTab, setActiveTab] = useState(0);

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
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                <TabPanel value={activeTab} index={0}>
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
                                プレビューモード中は材料・加工後形状の位置を変更できません。パラメータ変更とパスの再生成は可能です。
                            </Typography>
                        )}
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
                        <Button variant="contained" onClick={props.handleSaveGcode}>Gコード保存</Button>
                    </Paper>
                </TabPanel>
                <TabPanel value={activeTab} index={1}>
                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Typography variant="h6" gutterBottom>マシン設定</Typography>
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
                        <TextField label="安全高さ (mm)" type="number" value={props.safeZ} onChange={(e) => props.setSafeZ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                        <TextField label="切り込み深さ (mm)" type="number" value={props.stepDown} onChange={(e) => props.setStepDown(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                        <TextField label="リトラクト高さ (mm)" type="number" value={props.retractZ} onChange={(e) => props.setRetractZ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                        <TextField label="ペック量 (Q)" type="number" value={props.peckQ} onChange={(e) => props.setPeckQ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
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
                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Typography variant="h6" gutterBottom>手動操作 (Jog)</Typography>
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2">マシン状態: {props.machinePosition.status}</Typography>
                            <Typography variant="body2">WPos: X:{props.machinePosition.wpos.x.toFixed(3)} Y:{props.machinePosition.wpos.y.toFixed(3)} Z:{props.machinePosition.wpos.z.toFixed(3)}</Typography>
                            <Typography variant="body2">MPos: X:{props.machinePosition.mpos.x.toFixed(3)} Y:{props.machinePosition.mpos.y.toFixed(3)} Z:{props.machinePosition.mpos.z.toFixed(3)}</Typography>
                        </Box>
                        <Box sx={{ mb: 2 }}>
                            <Typography component="span" sx={{ mr: 1 }}>移動量(mm):</Typography>
                            {[0.1, 1, 10, 100].map(step => (
                                <Button key={step} size="small" variant={props.jogStep === step ? 'contained' : 'outlined'} onClick={() => props.setJogStep(step)} sx={{ mr: 1 }}>
                                    {step}
                                </Button>
                            ))}
                        </Box>
                        <Grid container spacing={1} alignItems="center" justifyContent="center">
                            <Grid item xs={4} />
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('Y', 1)}>Y+</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('Z', 1)}>Z+</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('X', -1)}>X-</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="contained" color="secondary" onClick={props.handleSetZero} startIcon={<Settings />}>原点</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('X', 1)}>X+</Button></Grid>
                            <Grid item xs={4} />
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('Y', -1)}>Y-</Button></Grid>
                            <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => props.handleJog('Z', -1)}>Z-</Button></Grid>
                        </Grid>
                    </Paper>
                </TabPanel>
                <TabPanel value={activeTab} index={2}>
                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Typography variant="h6" gutterBottom>加工シミュレーション</Typography>
                        <FormControlLabel
                            control={<Checkbox checked={props.simEnabled} onChange={(e) => props.setSimEnabled(e.target.checked)} />}
                            label="シミュレーションを表示"
                        />
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
                        </Box>
                        <Box sx={{ width: '100%' }}>
                            <LinearProgress variant="determinate" value={props.simProgress * 100} />
                            <Typography variant="body2" align="right">{Math.round(props.simProgress * 100)}%</Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            現在生成されているツールパスを、選択中の工具径・切込み深さで単一パス加工した場合の材料除去をシミュレートします（工具形状は区別せず円柱状の除去として近似、複数段の深さ加工には対応していません）。
                        </Typography>
                    </Paper>
                </TabPanel>
            </Box>
        </Grid>
    );
};

export default ControlPanel;
