import React, { useEffect, useRef, useState } from 'react';
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
    Tooltip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Stepper,
    Step,
    StepLabel,
} from '@mui/material';
import { Settings, InfoOutlined, ExpandMore } from '@mui/icons-material';
import { MachineSetting, MaterialSetting, ToolSetting, WorkOrigin, Geometry, ToolpathSegment } from '../../types';
import { ToolpathStats } from '../../toolpathStats';
import { VisibilityToggles, NumberField, ConfirmDialog, formatDurationSec } from './shared';

function formatDistanceMm(mm: number): string {
    if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
    return `${mm.toFixed(1)} mm`;
}

export interface CamTabProps {
    machineSettings: MachineSetting[];
    selectedMachineId: number | '';
    setSelectedMachineId: (val: number) => void;
    toolSettings: ToolSetting[];
    selectedToolId: number | '';
    setSelectedToolId: (val: number) => void;
    materialSettings: MaterialSetting[];
    selectedMaterialId: number | '';
    setSelectedMaterialId: (val: number) => void;
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
    handleCenterTargetOnStock: () => void;
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
    rpm: number;
    setRpm: (val: number) => void;
    stepDown: number;
    setStepDown: (val: number) => void;
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
    pathStats: ToolpathStats | null;
}

type SectionKey = 'origin' | 'cam2d' | 'cam3d' | 'drill' | 'gcode' | 'objects';

const CamTab = (props: CamTabProps) => {
    const [pendingDelete, setPendingDelete] = useState<{ message: string; onDelete: () => void } | null>(null);
    const [previewOffConfirmOpen, setPreviewOffConfirmOpen] = useState(false);
    // Gコード生成直前に加工条件(送り速度・回転数・切り込み深さ等)を最終確認・微調整させるためのモーダル。
    // 対象操作の種類だけ保持し、実際の値はprops経由(feedRate等)でモーダル内から直接編集させる。
    const [gcodeConfirm, setGcodeConfirm] = useState<'drill' | 'save' | 'transfer' | null>(null);
    // 2.5D加工と3D加工は同時に使わないことが多いため、STL読み込み状況に応じてどちらかを初期展開する。
    // それ以外の区分は折りたたんでおき、縦に長くなりがちな画面を見渡しやすくする。
    const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>(() => {
        const hasStl = !!(props.stockStlFile || props.targetStlFile);
        return {
            origin: false,
            cam2d: !hasStl,
            cam3d: hasStl,
            drill: false,
            gcode: true,
            objects: false,
        };
    });
    const toggleSection = (key: SectionKey) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

    // ステップ進行ガイド: 原点設定 → パス生成 → Gコード出力 の大まかな流れを示すためのインジケーター。
    // 完了判定は既存の値(toolpaths等)から導出し、原点設定・Gコード出力だけは完了を示す値が
    // 存在しないため、ユーザー操作(アコーディオンを閉じる/保存ボタン押下)を軽く記録する。
    // あくまで案内であり、他のセクションを自由に開閉する操作を妨げない。
    const [originVisited, setOriginVisited] = useState(false);
    const [gcodeSaved, setGcodeSaved] = useState(false);
    const hasToolpaths = !!props.toolpaths && props.toolpaths.length > 0;
    // STLが投入されていれば3D加工、なければ2.5D加工がその時点でのメインの導線とみなす。
    const primaryPathSection: 'cam2d' | 'cam3d' = (props.stockStlFile || props.targetStlFile) ? 'cam3d' : 'cam2d';

    const handleOriginAccordionChange = () => {
        const wasOpen = expanded.origin;
        toggleSection('origin');
        if (wasOpen) setOriginVisited(true);
    };

    // 各ステップの完了を検知した最初のタイミングでのみ次のセクションを自動展開する。
    // ユーザーが後から手動で前のセクションを開き直しても、勝手に閉じたりはしない。
    const originAdvancedRef = useRef(false);
    useEffect(() => {
        if (originVisited && !originAdvancedRef.current) {
            originAdvancedRef.current = true;
            setExpanded((prev) => ({ ...prev, [primaryPathSection]: true }));
        }
    }, [originVisited, primaryPathSection]);

    const pathAdvancedRef = useRef(false);
    useEffect(() => {
        if (hasToolpaths && !pathAdvancedRef.current) {
            pathAdvancedRef.current = true;
            setExpanded((prev) => ({ ...prev, [primaryPathSection]: false, drill: false, gcode: true }));
        }
    }, [hasToolpaths, primaryPathSection]);

    // 新しいパスが生成されたら、前のGコード出力結果は古くなるため完了表示をリセットする。
    useEffect(() => {
        setGcodeSaved(false);
    }, [props.toolpaths]);

    const stepCompleted = [originVisited, hasToolpaths, gcodeSaved];
    const activeStep = gcodeSaved ? 3 : hasToolpaths ? 2 : originVisited ? 1 : 0;

    const handleTogglePreviewModeClick = () => {
        const willDeleteToolpaths = props.previewMode && props.toolpaths && props.toolpaths.length > 0;
        if (willDeleteToolpaths) {
            setPreviewOffConfirmOpen(true);
        } else {
            props.onTogglePreviewMode();
        }
    };

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
                        <Button size="small" variant="outlined" startIcon={<Settings />} onClick={props.onOpenToolSettings}>
                            詳細設定
                        </Button>
                    </Tooltip>
                </Box>
                <Typography variant="body2" color="text.secondary">
                    {(props.machineSettings.find(m => m.id === props.selectedMachineId)?.name) || '未選択'}
                    {' / '}
                    {(props.toolSettings.find(t => t.id === props.selectedToolId)?.name) || '未選択'}
                    {' (Φ'}{props.toolDiameter}{'mm) / '}
                    {props.processType === 'roughing' ? '粗削り' : '仕上げ'}
                    {' / 材料: '}
                    {(props.materialSettings.find(m => m.id === props.selectedMaterialId)?.name) || '未選択'}
                </Typography>
            </Paper>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stepper activeStep={activeStep} alternativeLabel>
                    {['原点設定', 'パス生成', 'Gコード出力'].map((label, idx) => (
                        <Step key={label} completed={stepCompleted[idx]}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>
            </Paper>
            <Accordion expanded={expanded.origin} onChange={handleOriginAccordionChange} disableGutters sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="h6">加工開始原点 (ワーク原点 G54)</Typography>
            </AccordionSummary>
            <AccordionDetails>
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
            </AccordionDetails>
            </Accordion>
            <Accordion expanded={expanded.cam2d} onChange={() => toggleSection('cam2d')} disableGutters sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="h6">2.5D 加工 (DXF/SVG)</Typography>
            </AccordionSummary>
            <AccordionDetails>
                <NumberField
                    label="ステップオーバー (%)"
                    value={props.stepover * 100}
                    onChange={(val) => props.setStepover(val / 100)}
                    validate={(v) => (v <= 0 || v > 100 ? '1〜100の範囲で入力してください' : undefined)}
                />
                <FormControl fullWidth margin="normal" size="small">
                    <InputLabel>輪郭方向</InputLabel>
                    <Select value={props.contourSide} label="輪郭方向" onChange={(e) => props.setContourSide(e.target.value as string)}>
                        <MenuItem value="outer">外側</MenuItem>
                        <MenuItem value="inner">内側</MenuItem>
                    </Select>
                </FormControl>
                <Button variant="contained" onClick={props.handleGenerateContour} sx={{ mr: 1 }}>輪郭パス生成</Button>
                <Button variant="contained" onClick={props.handleGeneratePocket}>ポケットパス生成</Button>
            </AccordionDetails>
            </Accordion>
            <Accordion expanded={expanded.cam3d} onChange={() => toggleSection('cam3d')} disableGutters sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="h6">3D 加工 (STL)</Typography>
            </AccordionSummary>
            <AccordionDetails>
                {(props.previewMode || (props.stockStlFile && props.targetStlFile)) && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                        <Button
                            variant={props.previewMode ? 'contained' : 'outlined'}
                            color={props.previewMode ? 'secondary' : 'primary'}
                            size="small"
                            onClick={handleTogglePreviewModeClick}
                        >
                            {props.previewMode ? 'プレビュー解除' : 'プレビューモード'}
                        </Button>
                    </Box>
                )}
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
                            <NumberField label="幅 X" fullWidth={false} value={props.stockBoxSize.x}
                                onChange={(val) => props.setStockBoxSize({ ...props.stockBoxSize, x: val })}
                                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)} margin="none" />
                            <NumberField label="奥行き Y" fullWidth={false} value={props.stockBoxSize.y}
                                onChange={(val) => props.setStockBoxSize({ ...props.stockBoxSize, y: val })}
                                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)} margin="none" />
                            <NumberField label="高さ Z" fullWidth={false} value={props.stockBoxSize.z}
                                onChange={(val) => props.setStockBoxSize({ ...props.stockBoxSize, z: val })}
                                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)} margin="none" />
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
                    {props.targetStlFile && props.stockStlFile && (
                        <Tooltip title="加工後形状が材料からはみ出さないよう、材料の中心に寄せます(概算配置。正確な位置は位置調整欄で微調整してください)">
                            <span>
                                <Button
                                    variant="outlined"
                                    disabled={props.previewMode}
                                    onClick={props.handleCenterTargetOnStock}
                                    fullWidth
                                    size="small"
                                    sx={{ mt: 1 }}
                                >
                                    材料の中心に配置
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                </Box>
                <NumberField
                    label="スライス厚 (mm)"
                    value={props.sliceHeight}
                    onChange={props.setSliceHeight}
                    validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
                />
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
            </AccordionDetails>
            </Accordion>
            <Accordion expanded={expanded.drill} onChange={() => toggleSection('drill')} disableGutters sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="h6">ドリル加工</Typography>
            </AccordionSummary>
            <AccordionDetails>
                <NumberField label="リトラクト高さ (mm)" value={props.retractZ} onChange={props.setRetractZ} forceSign="positive" />
                <NumberField
                    label="ペック量 (Q)"
                    value={props.peckQ}
                    onChange={props.setPeckQ}
                    validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
                />
                <Button variant="contained" onClick={() => setGcodeConfirm('drill')}>ドリルGコード生成</Button>
            </AccordionDetails>
            </Accordion>
            <Accordion expanded={expanded.gcode} onChange={() => toggleSection('gcode')} disableGutters sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="h6">Gコード保存</Typography>
            </AccordionSummary>
            <AccordionDetails>
                <NumberField
                    label="送り速度 (mm/min)"
                    value={props.feedRate}
                    onChange={props.setFeedRate}
                    validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
                />
                <NumberField
                    label="主軸回転数 (RPM)"
                    value={props.rpm}
                    onChange={props.setRpm}
                    validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
                />
                <NumberField
                    label="切り込み深さ (mm)"
                    value={props.stepDown}
                    onChange={props.setStepDown}
                    forceSign="negative"
                />
                {props.pathStats ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        移動距離: {formatDistanceMm(props.pathStats.totalDistanceMm)}　／　加工時間(概算): {formatDurationSec(props.pathStats.timeSec)}
                    </Typography>
                ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        ツールパスを生成すると移動距離・加工時間が表示されます
                    </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={() => setGcodeConfirm('save')}>Gコード保存</Button>
                    <Button variant="contained" color="secondary" onClick={() => setGcodeConfirm('transfer')}>
                        CNCへ転送
                    </Button>
                </Box>
            </AccordionDetails>
            </Accordion>
            <Accordion expanded={expanded.objects} onChange={() => toggleSection('objects')} disableGutters sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="h6">投入済みオブジェクト</Typography>
                    <Tooltip title="現在CAMに読み込まれている材料・加工後形状・図形・ツールパスの表示/非表示切り替えや削除ができます。">
                        <InfoOutlined fontSize="small" sx={{ color: 'text.secondary', cursor: 'help' }} />
                    </Tooltip>
                </Box>
            </AccordionSummary>
            <AccordionDetails>
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
                                                onClick={() => setPendingDelete({ message: row.confirmMessage, onDelete: row.onDelete })}
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
            </AccordionDetails>
            </Accordion>
            <ConfirmDialog
                open={!!pendingDelete}
                title="削除の確認"
                message={pendingDelete?.message || ''}
                onConfirm={() => {
                    pendingDelete?.onDelete();
                    setPendingDelete(null);
                }}
                onCancel={() => setPendingDelete(null)}
            />
            <ConfirmDialog
                open={previewOffConfirmOpen}
                title="プレビュー解除の確認"
                message="プレビューを解除すると、生成済みの3D加工パスは削除されます。よろしいですか？"
                onConfirm={() => {
                    props.onTogglePreviewMode();
                    setPreviewOffConfirmOpen(false);
                }}
                onCancel={() => setPreviewOffConfirmOpen(false)}
            />
            <ConfirmDialog
                open={!!gcodeConfirm}
                title="加工条件の確認"
                confirmLabel={gcodeConfirm === 'transfer' ? 'CNCへ転送' : 'Gコード生成'}
                message={
                    <Box>
                        <NumberField
                            label="送り速度 (mm/min)"
                            value={props.feedRate}
                            onChange={props.setFeedRate}
                            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
                        />
                        <NumberField
                            label="主軸回転数 (RPM)"
                            value={props.rpm}
                            onChange={props.setRpm}
                            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
                        />
                        <NumberField
                            label="切り込み深さ (mm)"
                            value={props.stepDown}
                            onChange={props.setStepDown}
                            forceSign="negative"
                        />
                        <NumberField label="リトラクト高さ (mm)" value={props.retractZ} onChange={props.setRetractZ} forceSign="positive" />
                        {gcodeConfirm === 'drill' && (
                            <NumberField
                                label="ペック量 (Q)"
                                value={props.peckQ}
                                onChange={props.setPeckQ}
                                validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
                            />
                        )}
                        {gcodeConfirm !== 'drill' && props.pathStats && (
                            <Typography variant="body2" color="text.secondary">
                                移動距離: {formatDistanceMm(props.pathStats.totalDistanceMm)}　／　加工時間(概算): {formatDurationSec(props.pathStats.timeSec)}
                            </Typography>
                        )}
                    </Box>
                }
                onConfirm={() => {
                    const kind = gcodeConfirm;
                    setGcodeConfirm(null);
                    if (kind === 'drill') {
                        props.handleGenerateDrillGcode();
                    } else if (kind === 'save') {
                        props.handleSaveGcode();
                        setGcodeSaved(true);
                    } else if (kind === 'transfer') {
                        (async () => {
                            const ok = await props.handleTransferGcodeToCnc();
                            if (ok) {
                                props.onGcodeTransferred();
                                setGcodeSaved(true);
                            }
                        })();
                    }
                }}
                onCancel={() => setGcodeConfirm(null)}
            />
        </Box>
    );
};

export default CamTab;
