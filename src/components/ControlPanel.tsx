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
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, Settings } from '@mui/icons-material';

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
    sliceHeight: number;
    setSliceHeight: (val: number) => void;
    handleGenerate3dPath: () => void;
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
                </Tabs>
            </Box>
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                <TabPanel value={activeTab} index={0}>
                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Typography variant="h6" gutterBottom>ツール設定</Typography>
                        <TextField label="工具径 (mm)" type="number" value={props.toolDiameter} onChange={(e) => props.setToolDiameter(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
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
                        <Typography variant="h6" gutterBottom>3D 加工 (STL)</Typography>
                        <Box sx={{ mb: 2 }}>
                            <Button variant="outlined" onClick={props.handleSelectStockStl} fullWidth>材料STLを選択</Button>
                            {props.stockStlFile && <Typography variant="caption" display="block" sx={{ mt: 1, textAlign: 'center' }}>{props.stockStlFile.split('\\').pop()}</Typography>}
                        </Box>
                        <Box sx={{ mb: 2 }}>
                            <Button variant="outlined" onClick={props.handleSelectTargetStl} fullWidth>加工後形状STLを選択</Button>
                            {props.targetStlFile && <Typography variant="caption" display="block" sx={{ mt: 1, textAlign: 'center' }}>{props.targetStlFile.split('\\').pop()}</Typography>}
                        </Box>
                        <TextField label="スライス厚 (mm)" type="number" value={props.sliceHeight} onChange={(e) => props.setSliceHeight(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                        <Button variant="contained" onClick={props.handleGenerate3dPath} fullWidth>3D荒加工パス生成</Button>
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
                        <TextField label="安全高さ (mm)" type="number" value={props.safeZ} onChange={(e) => props.setSafeZ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                        <TextField label="切り込み深さ (mm)" type="number" value={props.stepDown} onChange={(e) => props.setStepDown(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                        <TextField label="リトラクト高さ (mm)" type="number" value={props.retractZ} onChange={(e) => props.setRetractZ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                        <TextField label="ペック量 (Q)" type="number" value={props.peckQ} onChange={(e) => props.setPeckQ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                    </Paper>
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
            </Box>
        </Grid>
    );
};

export default ControlPanel;
