import React from 'react';
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
    LinearProgress,
    Checkbox,
    FormControlLabel,
} from '@mui/material';
import { PlayArrow, Pause, Stop, SkipNext } from '@mui/icons-material';
import { VisibilityToggles } from './shared';

export interface SimTabProps {
    simEnabled: boolean;
    setSimEnabled: (val: boolean) => void;
    showStock: boolean;
    setShowStock: (val: boolean) => void;
    showTarget: boolean;
    setShowTarget: (val: boolean) => void;
    showToolpaths: boolean;
    setShowToolpaths: (val: boolean) => void;
    stockMargin: number;
    setStockMargin: (val: number) => void;
    stockThickness: number;
    setStockThickness: (val: number) => void;
    simSpeed: number;
    setSimSpeed: (val: number) => void;
    simPlaying: boolean;
    setSimPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    handleResetSimulation: () => void;
    simProgress: number;
    handleSkipSimulation: () => void;
}

const SimTab = (props: SimTabProps) => {
    return (
        <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5 }}>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6" gutterBottom>加工シミュレーション</Typography>
                <FormControlLabel
                    control={<Checkbox checked={props.simEnabled} onChange={(e) => props.setSimEnabled(e.target.checked)} />}
                    label="シミュレーションを表示"
                />
                <VisibilityToggles
                    items={[
                        { label: '材料を表示', checked: props.showStock, onChange: props.setShowStock },
                        { label: '加工後形状を表示', checked: props.showTarget, onChange: props.setShowTarget },
                        { label: 'パスを表示', checked: props.showToolpaths, onChange: props.setShowToolpaths },
                    ]}
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
    );
};

export default SimTab;
