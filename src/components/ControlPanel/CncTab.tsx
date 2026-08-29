import React, { useMemo, useState } from 'react';
import {
    Typography,
    Paper,
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
    IconButton,
    Tooltip,
    Alert,
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, Settings, LockOpen, RestartAlt } from '@mui/icons-material';
import { MachineSetting, SerialPortInfo } from '../../types';
import { NumberField, ConfirmDialog } from './shared';

export interface CncTabProps {
    isConnected: boolean;
    selectedPort: string;
    setSelectedPort: (val: string) => void;
    serialPorts: SerialPortInfo[];
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
    handleResetGcodeState: () => void;
    gcodeProgress: { sent: number; total: number };
    machinePosition: { wpos: { x: number; y: number; z: number }; mpos: { x: number; y: number; z: number }; status: string; homed: boolean };
    jogStep: number;
    setJogStep: (val: number) => void;
    handleJog: (axis: 'X' | 'Y' | 'Z', direction: number) => void;
    enableMachineOriginReset: boolean;
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
    onOpenMachineSettings: () => void;
    onOpenSetZeroConfirm: () => void;
}

const GCODE_DISPLAY_LINE_LIMIT = 2000;

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

const CncTab = (props: CncTabProps) => {
    const [grblWriteConfirmOpen, setGrblWriteConfirmOpen] = useState(false);
    const isGrblValid = props.grblSettings.stepsX > 0 && props.grblSettings.stepsY > 0 && props.grblSettings.stepsZ > 0;

    // 3Dラフィング等から転送された巨大なG-code(数万行)をそのまま折り返し付きtextareaに
    // 流し込むと、ブラウザ側の行レイアウト計算が仮想化されず数秒〜数十秒単位で固まる。
    // 表示だけ先頭N行に切り詰め、送信自体は props.gcode の全文に対して行う。
    const { displayedGcode, isGcodeTruncated } = useMemo(() => {
        const lines = props.gcode.split('\n');
        if (lines.length <= GCODE_DISPLAY_LINE_LIMIT) {
            return { displayedGcode: props.gcode, isGcodeTruncated: false };
        }
        const preview = lines.slice(0, GCODE_DISPLAY_LINE_LIMIT).join('\n');
        return {
            displayedGcode: `${preview}\n... (残り${lines.length - GCODE_DISPLAY_LINE_LIMIT}行を省略して表示。送信/保存は全文に対して行われます)`,
            isGcodeTruncated: true,
        };
    }, [props.gcode]);

    return (
        <>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5, mb: 1 }}>
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="h6">マシン設定</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {!props.isConnected ? (
                                <Tooltip title="接続">
                                    <IconButton size="small" color="primary" onClick={props.handleConnect}>
                                        <Link />
                                    </IconButton>
                                </Tooltip>
                            ) : (
                                <Tooltip title="切断">
                                    <IconButton size="small" color="secondary" onClick={props.handleDisconnect}>
                                        <LinkOff />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Tooltip title="安全高さ・切込み深さなどの詳細設定">
                                <IconButton size="small" onClick={props.onOpenMachineSettings}>
                                    <Settings />
                                </IconButton>
                            </Tooltip>
                        </Box>
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
                            <Button variant="contained" size="small" onClick={() => setGrblWriteConfirmOpen(true)} disabled={!isGrblValid} fullWidth>
                                設定書き込み
                            </Button>
                        </Box>
                        <NumberField
                            label="X軸ステップ数 (step/mm)"
                            value={props.grblSettings.stepsX}
                            onChange={(val) => props.setGrblSettings(prev => ({ ...prev, stepsX: val }))}
                            min={0.0001}
                            margin="normal"
                        />
                        <NumberField
                            label="Y軸ステップ数 (step/mm)"
                            value={props.grblSettings.stepsY}
                            onChange={(val) => props.setGrblSettings(prev => ({ ...prev, stepsY: val }))}
                            min={0.0001}
                            margin="normal"
                        />
                        <NumberField
                            label="Z軸ステップ数 (step/mm)"
                            value={props.grblSettings.stepsZ}
                            onChange={(val) => props.setGrblSettings(prev => ({ ...prev, stepsZ: val }))}
                            min={0.0001}
                            margin="normal"
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
                    <NumberField
                        label="ボーレート"
                        value={props.baudRate}
                        onChange={props.setBaudRate}
                        min={1}
                        validate={(val) => (!Number.isInteger(val) ? '整数を入力してください' : undefined)}
                        margin="normal"
                        disabled={props.isConnected}
                    />
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
                    {isGcodeTruncated && (
                        <Alert severity="warning" sx={{ mb: 1 }}>
                            G-codeが大きいため先頭{GCODE_DISPLAY_LINE_LIMIT}行のみ表示し、編集はできません。送信・保存は全文に対して行われます。
                        </Alert>
                    )}
                    <TextField
                        multiline
                        rows={8}
                        fullWidth
                        variant="outlined"
                        value={displayedGcode}
                        onChange={(e) => { if (!isGcodeTruncated) props.setGcode(e.target.value); }}
                        placeholder="ここにG-codeを貼り付け..."
                        sx={{ mb: 1, fontFamily: 'monospace' }}
                        InputProps={{ readOnly: isGcodeTruncated }}
                    />
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                        <Tooltip title={props.gcodeStatus === 'paused' ? '再開' : '送信'}>
                            <span>
                                <IconButton
                                    color="primary"
                                    onClick={props.gcodeStatus === 'paused' ? props.handleResumeGcode : props.handleSendGcode}
                                    disabled={!props.isConnected || (props.gcodeStatus !== 'idle' && props.gcodeStatus !== 'paused')}
                                >
                                    <PlayArrow />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="一時停止">
                            <span>
                                <IconButton onClick={props.handlePauseGcode} disabled={props.gcodeStatus !== 'sending'}>
                                    <Pause />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="停止">
                            <span>
                                <IconButton color="secondary" onClick={props.handleStopGcode} disabled={props.gcodeStatus === 'idle'}>
                                    <Stop />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="リセット: 送信状態が固まって操作できない場合に、表示をidleへ強制的に戻します">
                            <IconButton color="warning" onClick={props.handleResetGcodeState}>
                                <RestartAlt />
                            </IconButton>
                        </Tooltip>
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
                    <Grid item xs={4}><Button fullWidth variant="contained" color="secondary" onClick={props.onOpenSetZeroConfirm} startIcon={<Settings />}>原点(G54)</Button></Grid>
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
                <Box sx={{ mt: 1 }}>
                    <Tooltip title="緊急停止後に機械が動かない場合、Grblのアラーム状態($X)を解除します。解除後は位置情報が未確定になるため、機械原点リセットを行ってください。">
                        <span>
                            <Button
                                fullWidth
                                variant={props.machinePosition.status === 'Alarm' ? 'contained' : 'outlined'}
                                color="error"
                                disabled={!props.isConnected}
                                onClick={props.handleUnlockAlarm}
                                startIcon={<LockOpen />}
                            >
                                アラーム解除 ($X){props.machinePosition.status === 'Alarm' ? '  ※Alarm状態' : ''}
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
                <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    <Typography variant="subtitle2" gutterBottom>スピンドル</Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <NumberField
                            label="回転数 (rpm)"
                            value={props.spindleSpeed}
                            onChange={props.setSpindleSpeed}
                            min={0}
                            fullWidth={false}
                            margin="none"
                        />
                        <Button
                            variant="contained"
                            color="success"
                            startIcon={<PlayArrow />}
                            onClick={props.handleSpindleOn}
                            disabled={!props.isConnected || props.spindleOn || props.spindleSpeed <= 0}
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
            <ConfirmDialog
                open={grblWriteConfirmOpen}
                title="Grbl設定書き込みの確認"
                message="加工機にステップ数・反転設定を書き込みます。値が誤っていると軸の動きが正しく動作しなくなる可能性があります。よろしいですか？"
                onConfirm={() => { props.handleSaveGrblSettings(); setGrblWriteConfirmOpen(false); }}
                onCancel={() => setGrblWriteConfirmOpen(false)}
            />
        </>
    );
};

export default CncTab;
