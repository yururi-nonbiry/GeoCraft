import React, { useEffect, useMemo, useState } from 'react';
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
    IconButton,
    Tooltip,
    Alert,
    ToggleButton,
    ToggleButtonGroup,
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, Settings, LockOpen, RestartAlt, VerticalAlignBottom } from '@mui/icons-material';
import { NumberField, formatDurationSec } from './shared';
import { estimateGcodeTime } from '../../gcodeTimeEstimate';

export interface CncTabProps {
    isConnected: boolean;
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
    probePlateThickness: number;
    setProbePlateThickness: (val: number) => void;
    probeStatus: 'idle' | 'probing' | 'success' | 'error';
    handleProbeZ: () => void;
    onOpenProbeConfirm: () => void;
    handleUnlockAlarm: () => void;
    spindleSpeed: number;
    setSpindleSpeed: (val: number) => void;
    spindleOn: boolean;
    handleSpindleOn: () => void;
    handleSpindleOff: () => void;
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
    const [mode, setMode] = useState<'auto' | 'manual'>('auto');

    // Gコード送信中/一時停止中に手動タブへ切り替わっていると、進捗表示が隠れて
    // 送信が続いていることに気づきにくい。送信が始まったら自動タブへ強制的に戻す。
    useEffect(() => {
        if (props.gcodeStatus === 'sending' || props.gcodeStatus === 'paused') {
            setMode('auto');
        }
    }, [props.gcodeStatus]);

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

    // 送信中/一時停止中に全加工時間の目安と残り時間を表示するための見積もり。G-code本文の
    // パース(移動距離とF値から算出)はテキストが変わったときだけ行い、進捗更新のたびの
    // 再計算は避ける。gcodeProgress.sent はバックエンド側で空行/コメント行も含めてカウント
    // されており(SendNextLineのスキップ処理)、cumulativeSecのインデックスもそれに合わせてある。
    const gcodeTimeEstimate = useMemo(() => estimateGcodeTime(props.gcode), [props.gcode]);
    const elapsedEstimateSec = props.gcodeProgress.sent > 0
        ? gcodeTimeEstimate.cumulativeSec[Math.min(props.gcodeProgress.sent, gcodeTimeEstimate.cumulativeSec.length) - 1] ?? gcodeTimeEstimate.totalSec
        : 0;
    const remainingEstimateSec = Math.max(0, gcodeTimeEstimate.totalSec - elapsedEstimateSec);

    return (
        <>
            <Box sx={{ flexShrink: 0, mb: 1 }}>
                <ToggleButtonGroup
                    value={mode}
                    exclusive
                    fullWidth
                    size="small"
                    onChange={(_, val) => { if (val) setMode(val); }}
                >
                    <ToggleButton value="auto">自動 (Gコード送信)</ToggleButton>
                    <ToggleButton
                        value="manual"
                        disabled={props.gcodeStatus === 'sending' || props.gcodeStatus === 'paused'}
                    >
                        手動 (Jog)
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5, mb: 1 }}>
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="h6">マシン設定</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Tooltip title="ポート一覧を更新">
                                <span>
                                    <IconButton size="small" onClick={props.handleRefreshPorts} disabled={props.isConnected}>
                                        <Refresh />
                                    </IconButton>
                                </span>
                            </Tooltip>
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
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>通信ログ</Typography>
                    <TextareaAutosize
                        readOnly
                        minRows={5}
                        value={props.consoleLog.join('\n')}
                        style={{ width: '100%', marginTop: '1rem', backgroundColor: '#222', color: '#0f0', fontFamily: 'monospace', padding: '8px' }}
                    />
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>マシン状態</Typography>
                    <Typography variant="body2">状態: {props.machinePosition.status}</Typography>
                    <Typography variant="body2">WPos: X:{props.machinePosition.wpos.x.toFixed(3)} Y:{props.machinePosition.wpos.y.toFixed(3)} Z:{props.machinePosition.wpos.z.toFixed(3)}</Typography>
                    <Typography variant="body2">MPos: X:{props.machinePosition.mpos.x.toFixed(3)} Y:{props.machinePosition.mpos.y.toFixed(3)} Z:{props.machinePosition.mpos.z.toFixed(3)}</Typography>
                    <Typography variant="caption" color={props.machinePosition.homed ? 'success.main' : 'text.secondary'}>
                        {props.machinePosition.homed ? '原点設定済み: MPos<0への移動を制限中' : '原点未設定: 移動制限なし'}
                    </Typography>
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
                </Paper>
                {mode === 'auto' && (
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
                        <Typography variant="body2" color="text.secondary">
                            全加工時間(目安): {formatDurationSec(gcodeTimeEstimate.totalSec)}
                            {(props.gcodeStatus === 'sending' || props.gcodeStatus === 'paused') && (
                                <>　／　残り時間(目安): {formatDurationSec(remainingEstimateSec)}</>
                            )}
                        </Typography>
                    </Box>
                </Paper>
                )}
            </Box>
            {mode === 'manual' && (
            <Paper sx={{ p: 2, flexShrink: 0, mb: 0 }}>
                <Typography variant="h6" gutterBottom>手動操作 (Jog)</Typography>
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
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                        <NumberField
                            label="プレート厚み (mm)"
                            value={props.probePlateThickness}
                            onChange={props.setProbePlateThickness}
                            min={0}
                            margin="none"
                            disabled={!props.isConnected}
                        />
                    </Box>
                    <Button
                        variant="contained"
                        color="secondary"
                        onClick={props.onOpenProbeConfirm}
                        disabled={!props.isConnected || props.probeStatus === 'probing'}
                        startIcon={<VerticalAlignBottom />}
                        sx={{ flexShrink: 0, height: 40 }}
                    >
                        {props.probeStatus === 'probing' ? 'プローブ中...' : 'Zプローブ'}
                    </Button>
                </Box>
                {props.probeStatus === 'success' && (
                    <Typography variant="caption" color="success.main">プローブ完了: Z軸原点を設定しました。</Typography>
                )}
                {props.probeStatus === 'error' && (
                    <Typography variant="caption" color="error.main">プローブ失敗: センサーに接触しませんでした。</Typography>
                )}
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
            )}
        </>
    );
};

export default CncTab;
