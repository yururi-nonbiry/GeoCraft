import React, { useState } from 'react';
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
    IconButton,
    Tooltip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material';
import { Settings, InfoOutlined } from '@mui/icons-material';
import { MachineSetting, ToolSetting, WorkOrigin, Geometry, ToolpathSegment } from '../../types';
import { VisibilityToggles } from './shared';

export interface CamTabProps {
    machineSettings: MachineSetting[];
    selectedMachineId: number | '';
    setSelectedMachineId: (val: number) => void;
    toolSettings: ToolSetting[];
    selectedToolId: number | '';
    setSelectedToolId: (val: number) => void;
    toolDiameter: number;
    processType: 'roughing' | 'finishing';
    workOrigin: WorkOrigin | null;
    setWorkOrigin: (val: WorkOrigin | null) => void;
    pickOriginMode: boolean;
    setPickOriginMode: (val: boolean) => void;
    handleSelectOriginPreset: (preset: 'left-front-top' | 'left-front-bottom' | 'center-top' | 'center-bottom' | 'right-back-top' | 'table-origin') => void;
    showStock: boolean;
    setShowStock: (val: boolean) => void;
    showTarget: boolean;
    setShowTarget: (val: boolean) => void;
    showGeometry: boolean;
    setShowGeometry: (val: boolean) => void;
    showToolpaths: boolean;
    setShowToolpaths: (val: boolean) => void;
    stepover: number;
    setStepover: (val: number) => void;
    contourSide: string;
    setContourSide: (val: string) => void;
    handleGenerateContour: () => void;
    handleGeneratePocket: () => void;
    previewMode: boolean;
    onTogglePreviewMode: () => void;
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
    onGcodeTransferred: () => void;
    geometry: Geometry | null;
    toolpaths: ToolpathSegment[] | null;
    handleDeleteStock: () => void;
    handleDeleteTarget: () => void;
    handleDeleteGeometry: () => void;
    handleDeleteToolpaths: () => void;
    onOpenToolSettings: () => void;
}

const CamTab = (props: CamTabProps) => {
    // CAMに投入されている(読み込み/生成済みの)オブジェクト一覧。「オブジェクト」タブの表示/非表示・削除操作の元になる。
    const objectRows: Array<{
        key: string;
        label: string;
        detail: string;
        loaded: boolean;
        visible: boolean;
        onToggleVisible: (val: boolean) => void;
        onDelete: () => void;
        confirmMessage: string;
    }> = [
        {
            key: 'stock',
            label: '材料 (Stock)',
            detail: props.stockStlFile ? props.stockStlFile.split('\\').pop()! : '未読み込み',
            loaded: !!props.stockStlFile,
            visible: props.showStock,
            onToggleVisible: props.setShowStock,
            onDelete: props.handleDeleteStock,
            confirmMessage: '材料形状を削除しますか？',
        },
        {
            key: 'target',
            label: '加工後形状 (Target)',
            detail: props.targetStlFile ? props.targetStlFile.split('\\').pop()! : '未読み込み',
            loaded: !!props.targetStlFile,
            visible: props.showTarget,
            onToggleVisible: props.setShowTarget,
            onDelete: props.handleDeleteTarget,
            confirmMessage: '加工後形状を削除しますか？',
        },
        {
            key: 'geometry',
            label: '図形 (DXF/SVG)',
            detail: props.geometry
                ? `線分${props.geometry.segments.length} / 円弧${props.geometry.arcs.length} / ドリル点${props.geometry.drill_points.length}`
                : '未読み込み',
            loaded: !!props.geometry,
            visible: props.showGeometry,
            onToggleVisible: props.setShowGeometry,
            onDelete: props.handleDeleteGeometry,
            confirmMessage: '読み込んだ図形(線分・円弧・ドリル点)を削除しますか？',
        },
        {
            key: 'toolpaths',
            label: 'ツールパス',
            detail: props.toolpaths && props.toolpaths.length > 0 ? `${props.toolpaths.length} セグメント` : '未生成',
            loaded: !!props.toolpaths && props.toolpaths.length > 0,
            visible: props.showToolpaths,
            onToggleVisible: props.setShowToolpaths,
            onDelete: props.handleDeleteToolpaths,
            confirmMessage: '生成済みのツールパスを削除しますか？',
        },
    ];

    return (
        <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5 }}>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">加工機・工具設定</Typography>
                    <Tooltip title="加工機・工具の詳細設定">
                        <IconButton size="small" onClick={props.onOpenToolSettings}>
                            <Settings />
                        </IconButton>
                    </Tooltip>
                </Box>
                <Typography variant="body2" color="text.secondary">
                    {(props.machineSettings.find(m => m.id === props.selectedMachineId)?.name) || '未選択'}
                    {' / '}
                    {(props.toolSettings.find(t => t.id === props.selectedToolId)?.name) || '未選択'}
                    {' (Φ'}{props.toolDiameter}{'mm) / '}
                    {props.processType === 'roughing' ? '粗削り' : '仕上げ'}
                </Typography>
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
                <VisibilityToggles
                    items={[
                        { label: '材料形状STLを表示', checked: props.showStock, onChange: props.setShowStock },
                        { label: '加工後形状STLを表示', checked: props.showTarget, onChange: props.setShowTarget },
                    ]}
                />
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
                <VisibilityToggles
                    items={[
                        { label: '材料を表示', checked: props.showStock, onChange: props.setShowStock },
                        { label: '加工後形状を表示', checked: props.showTarget, onChange: props.setShowTarget },
                        { label: 'パスを表示', checked: props.showToolpaths, onChange: props.setShowToolpaths },
                    ]}
                />
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
                    {props.isGenerating3dPath
                        ? (props.path3dProgress.total > 0 && props.path3dProgress.current >= props.path3dProgress.total
                            ? '結果を集計中...'
                            : '3Dパス生成中...')
                        : '3D加工パス生成'}
                </Button>
                {props.isGenerating3dPath && (
                    <Box sx={{ mt: 1 }}>
                        <LinearProgress
                            variant={props.path3dProgress.total > 0 && props.path3dProgress.current < props.path3dProgress.total ? 'determinate' : 'indeterminate'}
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
                            if (ok) props.onGcodeTransferred();
                        }}
                    >
                        CNCへ転送
                    </Button>
                </Box>
            </Paper>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <Typography variant="h6">投入済みオブジェクト</Typography>
                    <Tooltip title="現在CAMに読み込まれている材料・加工後形状・図形・ツールパスの表示/非表示切り替えや削除ができます。">
                        <InfoOutlined fontSize="small" sx={{ color: 'text.secondary', cursor: 'help' }} />
                    </Tooltip>
                </Box>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small" sx={{ tableLayout: 'fixed' }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>ファイル名</TableCell>
                                <TableCell align="center" sx={{ width: 64 }}>表示</TableCell>
                                <TableCell align="center" sx={{ width: 72 }}>操作</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {objectRows.map((row) => {
                                const fullText = `${row.label}: ${row.detail}`;
                                return (
                                    <TableRow key={row.key} hover>
                                        <TableCell
                                            sx={{
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: 0,
                                            }}
                                        >
                                            <Tooltip title={fullText}>
                                                <span>{fullText}</span>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Checkbox
                                                size="small"
                                                checked={row.visible}
                                                onChange={(e) => row.onToggleVisible(e.target.checked)}
                                                disabled={!row.loaded}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Button
                                                size="small"
                                                color="secondary"
                                                disabled={!row.loaded}
                                                onClick={() => {
                                                    if (confirm(row.confirmMessage)) row.onDelete();
                                                }}
                                            >
                                                削除
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
};

export default CamTab;
