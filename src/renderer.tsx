import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  AppBar,
  Toolbar,
  Typography,
  Grid,
  Paper,
  Tabs,
  Tab,
  Box,
  Button,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, Settings, Memory, Save, FolderOpen, ViewInAr, Layers, Route, Timeline, CenterFocusStrong, OpenWith, ThreeDRotation, Close } from '@mui/icons-material';

import { api } from './api';

import ThreeViewer from './components/ThreeViewer';
import ControlPanel from './components/ControlPanel';
import SettingsDialog from './components/SettingsDialog';
import { Geometry, ToolpathSegment, Toolpath, MachineSetting, ToolSetting, StlBaseTransform, WorkOrigin, MaterialSetting, StlPlacement } from './types';
import { useCncConnection } from './hooks/useCncConnection';
import { useStlAssets } from './hooks/useStlAssets';
import { useGcodeExport } from './hooks/useGcodeExport';
import { useToolpathGeneration } from './hooks/useToolpathGeneration';
import { computeToolpathStats } from './toolpathStats';
import { computeStlBounds } from './stlUtils';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

type PersistedSettings = {
  machineSettings?: MachineSetting[];
  selectedMachineId?: number;
  materialSettings?: MaterialSetting[];
  toolSettings?: ToolSetting[];
  selectedMaterialId?: number;
  selectedToolId?: number;
};

const PROJECT_FILE_VERSION = 1;

type ProjectData = {
  version: number;
  stock: StlPlacement;
  target: StlPlacement;
  geometry: Geometry | null;
  toolpaths: ToolpathSegment[] | null;
  workOrigin?: WorkOrigin | null;
  toolDiameter: number;
  stepover: number;
  sliceHeight: number;
  contourSide: string;
  feedRate: number;
  rpm?: number;
  processType: 'roughing' | 'finishing';
  stockToLeave: number;
  machineSettings: MachineSetting[];
  selectedMachineId?: number;
  materialSettings: MaterialSetting[];
  selectedMaterialId?: number;
  toolSettings: ToolSetting[];
  selectedToolId?: number;
};

const SIDE_PANEL_WIDTH = 360;

const DEFAULT_MACHINES: MachineSetting[] = [
  {
    id: 1,
    name: 'Standard CNC',
    safeZ: 5.0,
    retractZ: 2.0,
    stepDown: -2.0,
    peckQ: 1.0,
    gcodeHeader: 'G90 G21 G17',
    gcodeFooter: 'M30',
    workAreaX: 300,
    workAreaY: 300,
    workAreaZ: 100,
  }
];

const DEFAULT_MATERIALS: MaterialSetting[] = [
  { id: 1, name: 'MDF', feedRate: 800, plungeRate: 200, rpm: 12000, depthPerPass: 2 },
  { id: 2, name: 'Aluminum', feedRate: 400, plungeRate: 100, rpm: 18000, depthPerPass: 0.5 },
];

const DEFAULT_TOOLS: ToolSetting[] = [
  {
    id: 1,
    machineId: 1,
    name: '6mm Endmill (Rough/Finish)',
    diameter: 6.0,
    type: 'endmill',
    roughing: { depthPerPass: 2.0, feedRate: 800, plungeRate: 200, rpm: 12000 },
    finishing: { depthPerPass: 1.0, feedRate: 600, plungeRate: 150, rpm: 12000, stockToLeave: 0.1 }
  },
  {
    id: 2,
    machineId: 1,
    name: '3mm Endmill (Rough/Finish)',
    diameter: 3.0,
    type: 'endmill',
    roughing: { depthPerPass: 1.0, feedRate: 600, plungeRate: 150, rpm: 15000 },
    finishing: { depthPerPass: 0.5, feedRate: 400, plungeRate: 100, rpm: 15000, stockToLeave: 0.05 }
  }
];

const App = () => {
  // states
  const [machineSettings, setMachineSettings] = useState<MachineSetting[]>(DEFAULT_MACHINES);
  const [selectedMachineId, setSelectedMachineId] = useState<number | ''>(DEFAULT_MACHINES[0]?.id ?? '');
  const [toolDiameter, setToolDiameter] = useState(3.0);
  const [stepover, setStepover] = useState(0.5);
  const [sliceHeight, setSliceHeight] = useState(1.0);
  const [toolpaths, setToolpaths] = useState<ToolpathSegment[] | null>(null);
  // --- ツールパス表示(層送り)state ---
  const [showAllLayers, setShowAllLayers] = useState(true);
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const [layerPointCursor, setLayerPointCursor] = useState(0);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  // --- 加工開始原点 (ワーク原点 G54) state ---
  const [workOrigin, setWorkOrigin] = useState<WorkOrigin | null>(null);
  const [pickOriginMode, setPickOriginMode] = useState<boolean>(false);

  const handleOriginPicked = (origin: { x: number; y: number; z: number }) => {
    setWorkOrigin({
      x: origin.x,
      y: origin.y,
      z: origin.z,
      type: 'vertex',
      presetName: 'custom',
    });
    setPickOriginMode(false);
  };

  const handleSelectOriginPreset = (preset: 'left-front-top' | 'left-front-bottom' | 'center-top' | 'center-bottom' | 'right-back-top' | 'table-origin') => {
    setPickOriginMode(false);
    if (preset === 'table-origin') {
      setWorkOrigin({ x: 0, y: 0, z: 0, type: 'preset', presetName: 'table-origin' });
      return;
    }

    let bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 20 };
    if (stockStlData) {
      const basePos = stockBaseTransform?.position ?? { x: 0, y: 0, z: 0 };
      const totalX = basePos.x + stockOffset.x;
      const totalY = basePos.y + stockOffset.y;
      const totalZ = basePos.z + stockOffset.z;

      const view = new DataView(stockStlData);
      const numTriangles = view.getUint32(80, true);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZVal = Infinity, maxZVal = -Infinity;
      let offset = 84;
      for (let i = 0; i < numTriangles; i++) {
        offset += 12; // skip normal
        for (let v = 0; v < 3; v++) {
          const vx = view.getFloat32(offset, true) + totalX;
          const vy = view.getFloat32(offset + 4, true) + totalY;
          const vz = view.getFloat32(offset + 8, true) + totalZ;
          if (vx < minX) minX = vx;
          if (vx > maxX) maxX = vx;
          if (vy < minY) minY = vy;
          if (vy > maxY) maxY = vy;
          if (vz < minZVal) minZVal = vz;
          if (vz > maxZVal) maxZVal = vz;
          offset += 12;
        }
        offset += 2;
      }
      if (minX !== Infinity) {
        bounds = { minX, maxX, minY, maxY, minZ: minZVal, maxZ: maxZVal };
      }
    }

    let newOrigin = { x: 0, y: 0, z: 0 };
    if (preset === 'left-front-top') {
      newOrigin = { x: bounds.minX, y: bounds.minY, z: bounds.maxZ };
    } else if (preset === 'left-front-bottom') {
      newOrigin = { x: bounds.minX, y: bounds.minY, z: bounds.minZ };
    } else if (preset === 'center-top') {
      newOrigin = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, z: bounds.maxZ };
    } else if (preset === 'center-bottom') {
      newOrigin = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, z: bounds.minZ };
    } else if (preset === 'right-back-top') {
      newOrigin = { x: bounds.maxX, y: bounds.maxY, z: bounds.maxZ };
    }

    setWorkOrigin({
      x: Math.round(newOrigin.x * 1000) / 1000,
      y: Math.round(newOrigin.y * 1000) / 1000,
      z: Math.round(newOrigin.z * 1000) / 1000,
      type: 'preset',
      presetName: preset,
    });
  };

  const getEffectiveToolpaths = (paths: ToolpathSegment[] | null): ToolpathSegment[] | null => {
    if (!paths) return null;
    if (!workOrigin || (workOrigin.x === 0 && workOrigin.y === 0 && workOrigin.z === 0)) {
      return paths;
    }
    const ox = workOrigin.x;
    const oy = workOrigin.y;
    const oz = workOrigin.z;

    return paths.map((seg) => {
      if (seg.type === 'line') {
        return {
          type: 'line',
          points: seg.points.map((pt) => [
            pt[0] - ox,
            pt[1] - oy,
            pt.length > 2 ? pt[2] - oz : pt[2],
          ]),
        };
      } else {
        return {
          type: 'arc',
          start: [seg.start[0] - ox, seg.start[1] - oy, seg.start.length > 2 ? seg.start[2] - oz : seg.start[2]],
          end: [seg.end[0] - ox, seg.end[1] - oy, seg.end.length > 2 ? seg.end[2] - oz : seg.end[2]],
          center: [seg.center[0] - ox, seg.center[1] - oy, seg.center.length > 2 ? seg.center[2] - oz : seg.center[2]],
          direction: seg.direction,
        };
      }
    });
  };

  // 3Dパス生成後のプレビューモード。true の間は材料/加工後形状の位置調整を禁止する
  const [previewMode, setPreviewMode] = useState(false);
  // 材料(stock)・加工後形状(target)STLの読み込み・配置・ドラッグ&ドロップ・保存/復元
  const {
    stockStlFile,
    stockStlPath,
    targetStlFile,
    stockStlData,
    targetStlData,
    pickFaceMode,
    setPickFaceMode,
    pendingStlDrop,
    setPendingStlDrop,
    isDragOverViewer,
    stockOffset,
    setStockOffset,
    targetOffset,
    setTargetOffset,
    stockBaseTransform,
    setStockBaseTransform,
    targetBaseTransform,
    setTargetBaseTransform,
    stockBoxSize,
    setStockBoxSize,
    handleSelectStockStl,
    handleSelectTargetStl,
    handleCreateBoxStock,
    handleCenterTargetOnStock,
    clearStockAndTarget,
    handleDeleteStock,
    handleDeleteTarget,
    handleViewerDragOver,
    handleViewerDragLeave,
    handleViewerDrop,
    handlePendingStlRoleSelect,
    resolveOffsetStlPath,
    getStockPlacement,
    getTargetPlacement,
    restoreStockPlacement,
    restoreTargetPlacement,
  } = useStlAssets(() => {
    setToolpaths(null);
    setPreviewMode(false);
  });
  const [feedRate, setFeedRate] = useState<number>(DEFAULT_MATERIALS[0]?.feedRate ?? 100);
  const [rpm, setRpm] = useState<number>(DEFAULT_MATERIALS[0]?.rpm ?? 15000);
  const [contourSide, setContourSide] = useState('outer');
  const [materialSettings, setMaterialSettings] = useState<MaterialSetting[]>(DEFAULT_MATERIALS);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | ''>(DEFAULT_MATERIALS[0]?.id ?? '');
  const [toolSettings, setToolSettings] = useState<ToolSetting[]>(DEFAULT_TOOLS);
  const [selectedToolId, setSelectedToolId] = useState<number | ''>(DEFAULT_TOOLS[0]?.id ?? '');
  const [processType, setProcessType] = useState<'roughing' | 'finishing'>('roughing');
  const [stockToLeave, setStockToLeave] = useState<number>(0.0);

  // --- 3Dビューの表示・非表示 state ---
  const [showStock, setShowStock] = useState(true);
  const [showTarget, setShowTarget] = useState(true);
  const [showGeometry, setShowGeometry] = useState(true);
  const [showToolpaths, setShowToolpaths] = useState(true);
  const [viewFitToken, setViewFitToken] = useState(0);
  // 3Dビューでクリック選択中の材料/加工後形状と、表示する移動・回転ツール
  const [selectedModel, setSelectedModel] = useState<'stock' | 'target' | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');
  // 回転スナップ角度(度)。0 は自由回転
  const [rotationSnapDeg, setRotationSnapDeg] = useState<number>(0);

  // --- 加工シミュレーション state ---
  const [simEnabled, setSimEnabled] = useState(false);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simSpeed, setSimSpeed] = useState(1);
  const [stockMargin, setStockMargin] = useState(5);
  const [stockThickness, setStockThickness] = useState(10);
  // 切り込み深さの安全チェックには、シミュレーション用に手入力されたstockThicknessではなく
  // 実際に読み込まれた材料STLの実寸(高さ)を使う。手入力値との乖離により、実寸的には
  // 問題ない加工が誤って警告されたり、逆に検出漏れが起きたりするのを防ぐため。
  const actualStockThickness = useMemo(() => {
    if (!stockStlData) return stockThickness;
    const bounds = computeStlBounds(stockStlData, stockBaseTransform?.rotation);
    return bounds.max.z - bounds.min.z;
  }, [stockStlData, stockBaseTransform, stockThickness]);
  const [simResetToken, setSimResetToken] = useState(0);
  const [simSkipToken, setSimSkipToken] = useState(0);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [projectLoadedPath, setProjectLoadedPath] = useState<string | null>(null);
  const [projectSavedPath, setProjectSavedPath] = useState<string | null>(null);
  const [isNoTransferToolpathDialogOpen, setIsNoTransferToolpathDialogOpen] = useState(false);
  const [depthWarning, setDepthWarning] = useState<{ depth: number; stockThickness: number; resolve: (proceed: boolean) => void } | null>(null);

  // 切り込み深さが材料厚みを超える場合にモーダルで警告し、ユーザーの選択をPromiseで返す。
  const confirmDepthExceedsStock = (depth: number, thickness: number): Promise<boolean> =>
    new Promise((resolve) => setDepthWarning({ depth, stockThickness: thickness, resolve }));

  const resolveDepthWarning = (proceed: boolean) => {
    depthWarning?.resolve(proceed);
    setDepthWarning(null);
  };

  // シリアル接続/ジョグ/主軸/Grbl設定/G-code送信制御など、CNC機械との通信に関するstateとhandlerはここに集約
  const cnc = useCncConnection();

  const currentMachine = machineSettings.find((m) => m.id === selectedMachineId) || machineSettings[0] || DEFAULT_MACHINES[0];

  // --- ツールパスをZ高さ(層)ごとにグループ化する ---
  // 3D荒加工パスは各点にZ座標を持つ(1スライス=1層)。2D輪郭/ポケットパスはZ座標を持たないため、
  // 全体で1つの層として扱う。
  const segmentZ = (segment: ToolpathSegment): number =>
    segment.type === 'line' ? (segment.points[0]?.[2] ?? 0) : (segment.start[2] ?? 0);
  const segmentPointCount = (segment: ToolpathSegment): number =>
    segment.type === 'line' ? segment.points.length : 1;

  const layers = useMemo(() => {
    if (!toolpaths || toolpaths.length === 0) return [];
    const groups = new Map<number, ToolpathSegment[]>();
    for (const segment of toolpaths) {
      const z = Math.round(segmentZ(segment) * 1000) / 1000;
      const group = groups.get(z);
      if (group) group.push(segment);
      else groups.set(z, [segment]);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0]) // Z降順(上の層から)
      .map(([z, segments]) => ({
        z,
        segments,
        pointCount: segments.reduce((sum, s) => sum + segmentPointCount(s), 0),
      }));
  }, [toolpaths]);

  // 移動距離・加工時間の見積もり(GcodeService.cs の実際のGコード生成ロジックと同じ移動シーケンスを辿る)
  const pathStats = useMemo(() => {
    if (!toolpaths || toolpaths.length === 0) return null;
    return computeToolpathStats(toolpaths, {
      feedRate,
      safeZ: currentMachine.safeZ,
      retractZ: currentMachine.retractZ,
      stepDown: currentMachine.stepDown,
    });
  }, [toolpaths, feedRate, currentMachine.safeZ, currentMachine.retractZ, currentMachine.stepDown]);

  // 新しいツールパスが生成されたら層送り状態をリセットする
  useEffect(() => {
    setCurrentLayerIndex(0);
    setShowAllLayers(true);
  }, [toolpaths]);

  // 選択中の層が変わったら、その層内送り位置を末尾(層全体を表示)にリセットする
  useEffect(() => {
    setLayerPointCursor(layers[currentLayerIndex]?.pointCount ?? 0);
  }, [layers, currentLayerIndex]);

  // 表示用ツールパス: 「全体表示」時はそのまま、「対象の層のみ表示」時は選択中の層を層内送り位置まで描画する
  const displayToolpaths = useMemo<ToolpathSegment[] | null>(() => {
    if (!toolpaths) return null;
    if (showAllLayers || layers.length === 0) return toolpaths;
    const layer = layers[currentLayerIndex];
    if (!layer) return toolpaths;

    let remaining = layerPointCursor;
    const clipped: ToolpathSegment[] = [];
    for (const segment of layer.segments) {
      if (remaining <= 0) break;
      const count = segmentPointCount(segment);
      if (segment.type === 'arc' || count <= remaining) {
        clipped.push(segment);
        remaining -= count;
      } else {
        clipped.push({ type: 'line', points: segment.points.slice(0, Math.max(2, remaining)) });
        remaining = 0;
      }
    }
    return clipped;
  }, [toolpaths, layers, showAllLayers, currentLayerIndex, layerPointCursor]);

  // 実機のCNCが報告するWPosは加工開始原点(G54=workOrigin)基準の座標。3Dビューのモデル座標系
  // (ツールパスがworkOriginで補正される前の座標系、原点ギズモと同じ空間)に戻すにはworkOriginを
  // 加算する(getEffectiveToolpathsでworkOriginを引いている操作の逆)。
  const toolScenePosition = useMemo(() => {
    if (!cnc.isConnected) return null;
    const ox = workOrigin?.x ?? 0;
    const oy = workOrigin?.y ?? 0;
    const oz = workOrigin?.z ?? 0;
    return {
      x: cnc.machinePosition.wpos.x + ox,
      y: cnc.machinePosition.wpos.y + oy,
      z: cnc.machinePosition.wpos.z + oz,
    };
  }, [cnc.isConnected, cnc.machinePosition.wpos.x, cnc.machinePosition.wpos.y, cnc.machinePosition.wpos.z, workOrigin?.x, workOrigin?.y, workOrigin?.z]);

  // 新しい加工を開始する(idle等からsendingに遷移する)たびにインクリメントし、3Dビューの
  // ツール軌跡(トレイル)表示を前回のジョブ分から引き継がずリセットさせる。
  const [toolTrailResetToken, setToolTrailResetToken] = useState(0);
  const prevGcodeStatusForTrailRef = useRef(cnc.gcodeStatus);
  useEffect(() => {
    if (cnc.gcodeStatus === 'sending' && prevGcodeStatusForTrailRef.current !== 'sending') {
      setToolTrailResetToken((t) => t + 1);
    }
    prevGcodeStatusForTrailRef.current = cnc.gcodeStatus;
  }, [cnc.gcodeStatus]);

  const updateMachineSetting = <K extends keyof Omit<MachineSetting, 'id'>>(key: K, value: MachineSetting[K]) => {
    setMachineSettings((prev) =>
      prev.map((m) => (m.id === selectedMachineId ? { ...m, [key]: value } : m))
    );
  };

  const resetSimulation = () => {
    setSimPlaying(false);
    setSimProgress(0);
    setSimResetToken((c) => c + 1);
  };

  const handleSkipSimulation = () => {
    setSimSkipToken((c) => c + 1);
  };

  const handleTogglePreviewMode = () => {
    setPickFaceMode(null);
    setPreviewMode((prev) => {
      const next = !prev;
      if (!next) {
        // プレビュー解除時は、そのプレビュー対象だった3Dパスを破棄する
        setToolpaths(null);
        resetSimulation();
      }
      return next;
    });
  };

  useEffect(() => {
    const removeFileOpenListener = api.onFileOpen((filePath) => {
      setToolpaths(null);
      setGeometry(null);
      clearStockAndTarget();
      setPickFaceMode(null);
      setPreviewMode(false);
      const extension = filePath.split('.').pop()?.toLowerCase();
      if (extension === 'dxf') {
        api.parseDxfFile(filePath).then(result => {
          if (result.status === 'success') setGeometry({ segments: result.segments, arcs: result.arcs, drill_points: result.drill_points });
          else alert(`DXF解析エラー: ${result.message}`);
        }).catch(error => alert(`DXF解析に失敗しました: ${error}`));
      } else if (extension === 'svg') {
        api.parseSvgFile(filePath).then(result => {
          if (result.status === 'success') setGeometry({ segments: result.segments, arcs: [], drill_points: result.drill_points });
          else alert(`SVG解析エラー: ${result.message}`);
        }).catch(error => alert(`SVG解析に失敗しました: ${error}`));
      }
    });
    return () => {
      removeFileOpenListener();
    };
  }, []);

  useEffect(() => {
    const filteredTools = toolSettings.filter(t => t.machineId === selectedMachineId);
    const selectedTool = filteredTools.find((tool) => tool.id === selectedToolId);
    if (!selectedTool) {
      if (filteredTools.length > 0) {
        setSelectedToolId(filteredTools[0].id);
      } else {
        setSelectedToolId('');
        setToolDiameter(0);
        setFeedRate(0);
        setRpm(0);
        setStockToLeave(0.0);
      }
      return;
    }

    setToolDiameter(selectedTool.diameter);

    const cutSettings = processType === 'roughing' ? selectedTool.roughing : selectedTool.finishing;
    if (cutSettings) {
      setFeedRate(cutSettings.feedRate);
      setRpm(cutSettings.rpm);
      updateMachineSetting('stepDown', -Math.abs(cutSettings.depthPerPass));
      if (processType === 'roughing') {
        setStockToLeave(selectedTool.finishing.stockToLeave ?? 0.0);
      } else {
        setStockToLeave(0.0);
      }
    }
  }, [selectedToolId, selectedMachineId, toolSettings, processType]);

  // 材料選択時は工具の加工条件を上書きしないよう、主軸回転数のみ材料側の推奨値を適用する
  // (送り速度・切り込み量は工具・加工工程(粗/仕上げ)ごとに大きく変わるため工具側を優先する)。
  useEffect(() => {
    const selectedMaterial = materialSettings.find((material) => material.id === selectedMaterialId);
    if (!selectedMaterial) {
      if (materialSettings.length > 0 && selectedMaterialId !== materialSettings[0].id) {
        setSelectedMaterialId(materialSettings[0].id);
      }
      return;
    }
    setRpm(selectedMaterial.rpm);
  }, [selectedMaterialId, materialSettings]);

  useEffect(() => {
    const selectedMachine = machineSettings.find((m) => m.id === selectedMachineId);
    if (!selectedMachine && machineSettings.length > 0 && selectedMachineId !== machineSettings[0].id) {
      setSelectedMachineId(machineSettings[0].id);
    }
  }, [selectedMachineId, machineSettings]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored: PersistedSettings = await window.electronAPI.getSettings();

        if (stored.materialSettings && stored.materialSettings.length > 0) {
          setMaterialSettings(stored.materialSettings);
          if (stored.selectedMaterialId && stored.materialSettings.some((m) => m.id === stored.selectedMaterialId)) {
            setSelectedMaterialId(stored.selectedMaterialId);
          } else {
            setSelectedMaterialId(stored.materialSettings[0].id);
          }
        }

        if (stored.toolSettings && stored.toolSettings.length > 0) {
          setToolSettings(stored.toolSettings);
          if (stored.selectedToolId && stored.toolSettings.some((t) => t.id === stored.selectedToolId)) {
            setSelectedToolId(stored.selectedToolId);
          } else {
            setSelectedToolId(stored.toolSettings[0].id);
          }
        }

        if (stored.machineSettings && stored.machineSettings.length > 0) {
          setMachineSettings(stored.machineSettings);
          if (stored.selectedMachineId && stored.machineSettings.some((m) => m.id === stored.selectedMachineId)) {
            setSelectedMachineId(stored.selectedMachineId);
          } else {
            setSelectedMachineId(stored.machineSettings[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to load settings', error);
      }
    };

    loadSettings();
  }, []);

  const handleDeleteGeometry = () => {
    setGeometry(null);
  };

  const handleDeleteToolpaths = () => {
    setToolpaths(null);
    resetSimulation();
  };

  const { handleGenerateDrillGcode, handleSaveGcode, handleTransferGcodeToCnc } = useGcodeExport({
    geometry,
    toolpaths,
    getEffectiveToolpaths,
    feedRate,
    rpm,
    machine: currentMachine,
    stockThickness: actualStockThickness,
    confirmDepthExceedsStock,
    onNoTransferToolpaths: () => setIsNoTransferToolpathDialogOpen(true),
    setGcode: cnc.setGcode,
    setGcodeStatus: cnc.setGcodeStatus,
  });

  const {
    handleGenerateContour,
    handleGeneratePocket,
    handleGenerate3dPath,
    isGenerating3dPath,
    path3dProgress,
  } = useToolpathGeneration({
    geometry,
    toolDiameter,
    stepover,
    contourSide,
    processType,
    stockToLeave,
    sliceHeight,
    placement: {
      stockStlPath,
      stockStlData,
      stockOffset,
      stockBaseTransform,
      targetStlFile,
      targetStlData,
      targetOffset,
      targetBaseTransform,
      resolveOffsetStlPath,
    },
    setToolpaths,
    setPreviewMode,
    resetSimulation,
    saveGcode: handleSaveGcode,
  });

  const handleSaveProject = async () => {
    try {
      const project: ProjectData = {
        version: PROJECT_FILE_VERSION,
        stock: getStockPlacement(),
        target: getTargetPlacement(),
        geometry,
        toolpaths,
        workOrigin,
        toolDiameter,
        stepover,
        sliceHeight,
        contourSide,
        feedRate,
        rpm,
        processType,
        stockToLeave,
        machineSettings,
        selectedMachineId: typeof selectedMachineId === 'number' ? selectedMachineId : undefined,
        materialSettings,
        selectedMaterialId: typeof selectedMaterialId === 'number' ? selectedMaterialId : undefined,
        toolSettings,
        selectedToolId: typeof selectedToolId === 'number' ? selectedToolId : undefined,
      };
      const result = await api.saveProject(JSON.stringify(project));
      if (result.status === 'success') setProjectSavedPath(result.filePath);
      else if (result.status !== 'canceled') alert(`プロジェクトの保存に失敗しました: ${result.message}`);
    } catch (error) {
      alert(`プロジェクトの保存に失敗しました: ${error}`);
    }
  };

  const handleOpenProject = async () => {
    const result = await api.openProject();
    if (result.status === 'canceled') return;
    if (result.status !== 'success') return alert(`プロジェクトの読み込みに失敗しました: ${result.message}`);

    let project: ProjectData;
    try {
      project = JSON.parse(result.data);
    } catch (error) {
      return alert(`プロジェクトファイルの解析に失敗しました: ${error}`);
    }

    setPickFaceMode(null);
    setPreviewMode(false);
    setPickOriginMode(false);
    await restoreStockPlacement(project.stock);
    await restoreTargetPlacement(project.target);
    if (project.stock?.boxSize) setStockBoxSize(project.stock.boxSize);

    setGeometry(project.geometry ?? null);
    setToolpaths(project.toolpaths ?? null);
    setWorkOrigin(project.workOrigin ?? null);
    if (typeof project.toolDiameter === 'number') setToolDiameter(project.toolDiameter);
    if (typeof project.stepover === 'number') setStepover(project.stepover);
    if (typeof project.sliceHeight === 'number') setSliceHeight(project.sliceHeight);
    if (project.contourSide) setContourSide(project.contourSide);
    if (typeof project.feedRate === 'number') setFeedRate(project.feedRate);
    if (typeof project.rpm === 'number') setRpm(project.rpm);
    if (project.processType) setProcessType(project.processType);
    if (typeof project.stockToLeave === 'number') setStockToLeave(project.stockToLeave);

    if (project.machineSettings && project.machineSettings.length > 0) {
      setMachineSettings(project.machineSettings);
      setSelectedMachineId(
        project.selectedMachineId && project.machineSettings.some((m) => m.id === project.selectedMachineId)
          ? project.selectedMachineId
          : project.machineSettings[0].id
      );
    }
    if (project.materialSettings && project.materialSettings.length > 0) {
      setMaterialSettings(project.materialSettings);
      setSelectedMaterialId(
        project.selectedMaterialId && project.materialSettings.some((m) => m.id === project.selectedMaterialId)
          ? project.selectedMaterialId
          : project.materialSettings[0].id
      );
    }
    if (project.toolSettings && project.toolSettings.length > 0) {
      setToolSettings(project.toolSettings);
      setSelectedToolId(
        project.selectedToolId && project.toolSettings.some((t) => t.id === project.selectedToolId)
          ? project.selectedToolId
          : project.toolSettings[0].id
      );
    }

    resetSimulation();
    setProjectLoadedPath(result.filePath);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar position="static">
          <Toolbar>
            <Memory sx={{ mr: 2 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              GeoCraft
            </Typography>
            <Button
              variant="contained"
              color="error"
              startIcon={<Stop />}
              onClick={cnc.handleEmergencyStop}
              disabled={!cnc.isConnected}
              title="機械の動作を即座に停止します"
              sx={{ mr: 2, fontWeight: 'bold' }}
            >
              緊急停止 (Esc)
            </Button>
            <IconButton color="inherit" onClick={handleOpenProject} aria-label="open project" title="プロジェクトを開く">
              <FolderOpen />
            </IconButton>
            <IconButton color="inherit" onClick={handleSaveProject} aria-label="save project" title="プロジェクトを保存">
              <Save />
            </IconButton>
            <IconButton color="inherit" onClick={() => setIsSettingsOpen(true)} aria-label="open settings">
              <Settings />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Grid container sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <Grid
            item
            sx={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}
            onDragOver={handleViewerDragOver}
            onDragLeave={handleViewerDragLeave}
            onDrop={handleViewerDrop}
          >
            {isDragOverViewer && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(25, 118, 210, 0.15)',
                  border: '3px dashed',
                  borderColor: 'primary.main',
                  pointerEvents: 'none',
                }}
              >
                <Typography variant="h6" color="primary.main">STLファイルをドロップして読み込み</Typography>
              </Box>
            )}
            <ThreeViewer
              toolpaths={toolpaths}
              displayToolpaths={displayToolpaths}
              geometry={geometry}
              stockStlData={stockStlData}
              targetStlData={targetStlData}
              pickFaceMode={pickFaceMode}
              onFacePicked={(mode, baseTransform) => {
                setPickFaceMode(null);
                if (mode === 'stock') {
                  setStockOffset({ x: 0, y: 0, z: 0 });
                  setStockBaseTransform(baseTransform);
                } else {
                  setTargetOffset({ x: 0, y: 0, z: 0 });
                  setTargetBaseTransform(baseTransform);
                }
              }}
              workOrigin={workOrigin}
              pickOriginMode={pickOriginMode}
              onOriginPicked={handleOriginPicked}
              machineWorkArea={{ x: currentMachine.workAreaX, y: currentMachine.workAreaY, z: currentMachine.workAreaZ }}
              stockOffset={stockOffset}
              targetOffset={targetOffset}
              onStockOffsetChange={setStockOffset}
              onTargetOffsetChange={setTargetOffset}
              stockBaseTransform={stockBaseTransform}
              targetBaseTransform={targetBaseTransform}
              previewMode={previewMode}
              showStock={showStock}
              showTarget={showTarget}
              showGeometry={showGeometry}
              showToolpaths={showToolpaths}
              toolPosition={toolScenePosition}
              toolTrailResetToken={toolTrailResetToken}
              viewFitToken={viewFitToken}
              selectedModel={selectedModel}
              onSelectedModelChange={setSelectedModel}
              transformMode={transformMode}
              rotationSnapDeg={rotationSnapDeg}
              onRotationCommitted={(which, rotation) => {
                if (which === 'stock') {
                  setStockBaseTransform((prev) => ({ position: prev?.position ?? { x: 0, y: 0, z: 0 }, rotation }));
                } else {
                  setTargetBaseTransform((prev) => ({ position: prev?.position ?? { x: 0, y: 0, z: 0 }, rotation }));
                }
              }}
              simulation={{
                enabled: simEnabled,
                toolRadius: toolDiameter / 2,
                cutZ: currentMachine.stepDown,
                stockMargin,
                stockThickness,
                playing: simPlaying,
                speed: simSpeed,
                resetToken: simResetToken,
                skipToken: simSkipToken,
                onProgress: setSimProgress,
                onFinished: () => setSimPlaying(false),
              }}
            />
            {/* 3Dビュー表示切り替え・視点リセット(フローティングアイコン) */}
            <Box
              sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                display: 'flex',
                gap: 0.5,
                bgcolor: 'background.paper',
                borderRadius: 1,
                boxShadow: 1,
                p: 0.25,
              }}
            >
              <Tooltip title={showStock ? '材料形状を非表示' : '材料形状を表示'}>
                <IconButton size="small" color={showStock ? 'primary' : 'default'} onClick={() => setShowStock(!showStock)}>
                  <ViewInAr fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={showTarget ? '加工後形状を非表示' : '加工後形状を表示'}>
                <IconButton size="small" color={showTarget ? 'primary' : 'default'} onClick={() => setShowTarget(!showTarget)}>
                  <Layers fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={showToolpaths ? 'パスを非表示' : 'パスを表示'}>
                <IconButton size="small" color={showToolpaths ? 'primary' : 'default'} onClick={() => setShowToolpaths(!showToolpaths)}>
                  <Route fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={showGeometry ? '図形を非表示' : '図形を表示'}>
                <IconButton size="small" color={showGeometry ? 'primary' : 'default'} onClick={() => setShowGeometry(!showGeometry)}>
                  <Timeline fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="視点をリセット">
                <IconButton size="small" onClick={() => setViewFitToken((t) => t + 1)}>
                  <CenterFocusStrong fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            {selectedModel && (
              // 材料/加工後形状をクリックして選択中: 移動・回転ツールの切り替えパネル
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  boxShadow: 1,
                  p: 0.5,
                }}
              >
                <Typography variant="caption" sx={{ pl: 0.5 }}>
                  {selectedModel === 'stock' ? '材料形状' : '加工後形状'}を選択中
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={transformMode}
                  onChange={(_, value) => { if (value) setTransformMode(value); }}
                >
                  <ToggleButton value="translate" aria-label="移動(XY平面)">
                    <Tooltip title="移動(XY平面)"><OpenWith fontSize="small" /></Tooltip>
                  </ToggleButton>
                  <ToggleButton value="rotate" aria-label="回転(鉛直軸)">
                    <Tooltip title="回転(鉛直軸)"><ThreeDRotation fontSize="small" /></Tooltip>
                  </ToggleButton>
                </ToggleButtonGroup>
                {transformMode === 'rotate' && (
                  <>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={rotationSnapDeg}
                      onChange={(_, value) => { if (value !== null) setRotationSnapDeg(value); }}
                    >
                      <ToggleButton value={0}>自由</ToggleButton>
                      <ToggleButton value={30}>30°</ToggleButton>
                      <ToggleButton value={45}>45°</ToggleButton>
                    </ToggleButtonGroup>
                    <Tooltip title="回転をリセット">
                      <IconButton
                        size="small"
                        aria-label="回転をリセット"
                        onClick={() => {
                          const identity = { x: 0, y: 0, z: 0, w: 1 };
                          if (selectedModel === 'stock') {
                            setStockBaseTransform((prev) => (prev ? { ...prev, rotation: identity } : prev));
                          } else {
                            setTargetBaseTransform((prev) => (prev ? { ...prev, rotation: identity } : prev));
                          }
                        }}
                      >
                        <Refresh fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <Tooltip title="選択解除">
                  <IconButton size="small" aria-label="選択解除" onClick={() => setSelectedModel(null)}>
                    <Close fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
            {layers.length > 0 && (
              <>
                {/* 全体表示 / 対象の層のみ表示 切り替え */}
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={showAllLayers ? 'all' : 'layer'}
                  onChange={(_, value) => {
                    if (value) setShowAllLayers(value === 'all');
                  }}
                  sx={{ position: 'absolute', top: 12, right: 76, bgcolor: 'background.paper', boxShadow: 1 }}
                >
                  <ToggleButton value="all">全体表示</ToggleButton>
                  <ToggleButton value="layer">対象の層のみ</ToggleButton>
                </ToggleButtonGroup>

                {/* 層ごとの送りバー(右側・縦) */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 64,
                    right: 20,
                    bottom: 96,
                    width: 56,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    boxShadow: 1,
                    py: 2,
                  }}
                >
                  <Typography variant="caption">
                    {currentLayerIndex + 1}/{layers.length}
                  </Typography>
                  <Slider
                    orientation="vertical"
                    min={0}
                    max={Math.max(layers.length - 1, 0)}
                    step={1}
                    value={currentLayerIndex}
                    onChange={(_, value) => setCurrentLayerIndex(value as number)}
                    disabled={layers.length <= 1}
                    sx={{ flexGrow: 1, my: 1 }}
                  />
                  <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                    Z{layers[currentLayerIndex]?.z.toFixed(2)}
                  </Typography>
                </Box>

                {/* 層内の送りバー(下側・横) */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 16,
                    right: 92,
                    bottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 2,
                    py: 1,
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    boxShadow: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                    層内送り
                  </Typography>
                  <Slider
                    min={0}
                    max={Math.max(layers[currentLayerIndex]?.pointCount ?? 0, 0)}
                    step={1}
                    value={layerPointCursor}
                    onChange={(_, value) => setLayerPointCursor(value as number)}
                    disabled={showAllLayers || (layers[currentLayerIndex]?.pointCount ?? 0) <= 1}
                    sx={{ flexGrow: 1 }}
                  />
                  <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                    {layerPointCursor}/{layers[currentLayerIndex]?.pointCount ?? 0}
                  </Typography>
                </Box>
              </>
            )}
          </Grid>
          <ControlPanel
            workOrigin={workOrigin}
            setWorkOrigin={setWorkOrigin}
            pickOriginMode={pickOriginMode}
            setPickOriginMode={setPickOriginMode}
            handleSelectOriginPreset={handleSelectOriginPreset}
            toolDiameter={toolDiameter}
            setToolDiameter={setToolDiameter}
            stepover={stepover}
            setStepover={setStepover}
            contourSide={contourSide}
            setContourSide={setContourSide}
            handleGenerateContour={handleGenerateContour}
            handleGeneratePocket={handleGeneratePocket}
            stockStlFile={stockStlFile}
            stockBoxSize={stockBoxSize}
            setStockBoxSize={setStockBoxSize}
            handleCreateBoxStock={handleCreateBoxStock}
            handleCenterTargetOnStock={handleCenterTargetOnStock}
            targetStlFile={targetStlFile}
            handleSelectStockStl={handleSelectStockStl}
            handleSelectTargetStl={handleSelectTargetStl}
            pickFaceMode={pickFaceMode}
            setPickFaceMode={setPickFaceMode}
            stockOffset={stockOffset}
            setStockOffset={setStockOffset}
            targetOffset={targetOffset}
            setTargetOffset={setTargetOffset}
            previewMode={previewMode}
            onTogglePreviewMode={handleTogglePreviewMode}
            sliceHeight={sliceHeight}
            setSliceHeight={setSliceHeight}
            handleGenerate3dPath={handleGenerate3dPath}
            isGenerating3dPath={isGenerating3dPath}
            path3dProgress={path3dProgress}
            retractZ={currentMachine.retractZ}
            setRetractZ={(val) => updateMachineSetting('retractZ', val)}
            peckQ={currentMachine.peckQ}
            setPeckQ={(val) => updateMachineSetting('peckQ', val)}
            handleGenerateDrillGcode={handleGenerateDrillGcode}
            feedRate={feedRate}
            setFeedRate={setFeedRate}
            rpm={rpm}
            setRpm={setRpm}
            handleSaveGcode={handleSaveGcode}
            handleTransferGcodeToCnc={handleTransferGcodeToCnc}
            safeZ={currentMachine.safeZ}
            setSafeZ={(val) => updateMachineSetting('safeZ', val)}
            stepDown={currentMachine.stepDown}
            setStepDown={(val) => updateMachineSetting('stepDown', val)}
            {...cnc}
            machineSettings={machineSettings}
            selectedMachineId={selectedMachineId}
            setSelectedMachineId={setSelectedMachineId}
            toolSettings={toolSettings}
            selectedToolId={selectedToolId}
            setSelectedToolId={setSelectedToolId}
            materialSettings={materialSettings}
            selectedMaterialId={selectedMaterialId}
            setSelectedMaterialId={setSelectedMaterialId}
            processType={processType}
            setProcessType={setProcessType}
            stockToLeave={stockToLeave}
            setStockToLeave={setStockToLeave}
            geometry={geometry}
            toolpaths={toolpaths}
            showStock={showStock}
            setShowStock={setShowStock}
            showTarget={showTarget}
            setShowTarget={setShowTarget}
            showGeometry={showGeometry}
            setShowGeometry={setShowGeometry}
            showToolpaths={showToolpaths}
            setShowToolpaths={setShowToolpaths}
            handleDeleteStock={handleDeleteStock}
            handleDeleteTarget={handleDeleteTarget}
            handleDeleteGeometry={handleDeleteGeometry}
            handleDeleteToolpaths={handleDeleteToolpaths}
            simEnabled={simEnabled}
            setSimEnabled={setSimEnabled}
            simPlaying={simPlaying}
            setSimPlaying={setSimPlaying}
            simProgress={simProgress}
            simSpeed={simSpeed}
            setSimSpeed={setSimSpeed}
            stockMargin={stockMargin}
            setStockMargin={setStockMargin}
            stockThickness={stockThickness}
            setStockThickness={setStockThickness}
            handleResetSimulation={resetSimulation}
            handleSkipSimulation={handleSkipSimulation}
            pathStats={pathStats}
          />
        </Grid>
      </Box>

      <SettingsDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        machineSettings={machineSettings}
        setMachineSettings={setMachineSettings}
        selectedMachineId={selectedMachineId}
        setSelectedMachineId={setSelectedMachineId}
        materialSettings={materialSettings}
        setMaterialSettings={setMaterialSettings}
        selectedMaterialId={selectedMaterialId}
        setSelectedMaterialId={setSelectedMaterialId}
        toolSettings={toolSettings}
        setToolSettings={setToolSettings}
        selectedToolId={selectedToolId}
        setSelectedToolId={setSelectedToolId}
      />

      <Dialog open={projectLoadedPath !== null} onClose={() => setProjectLoadedPath(null)}>
        <DialogTitle>プロジェクトを読み込みました</DialogTitle>
        <DialogContent dividers>
          <Typography>{projectLoadedPath}</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setProjectLoadedPath(null)}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={projectSavedPath !== null} onClose={() => setProjectSavedPath(null)}>
        <DialogTitle>プロジェクトを保存しました</DialogTitle>
        <DialogContent dividers>
          <Typography>{projectSavedPath}</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setProjectSavedPath(null)}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isNoTransferToolpathDialogOpen} onClose={() => setIsNoTransferToolpathDialogOpen(false)}>
        <DialogTitle>転送するツールパスがありません</DialogTitle>
        <DialogContent dividers>
          <Typography>転送するツールパスがありません。</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setIsNoTransferToolpathDialogOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={depthWarning !== null} onClose={() => resolveDepthWarning(false)}>
        <DialogTitle>切り込み深さが材料厚みを超えています</DialogTitle>
        <DialogContent dividers>
          <Typography>
            切り込み深さ({depthWarning?.depth.toFixed(2)}mm)が材料厚み({depthWarning?.stockThickness.toFixed(2)}mm)を超えています。テーブルや治具に接触する恐れがあります。続行しますか？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => resolveDepthWarning(false)}>キャンセル</Button>
          <Button variant="contained" color="warning" onClick={() => resolveDepthWarning(true)}>続行</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pendingStlDrop !== null} onClose={() => setPendingStlDrop(null)}>
        <DialogTitle>STLファイルの種類を選択</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 1 }}>
            「{pendingStlDrop?.fileLabel}」をどちらとして読み込みますか?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            材料: 加工前の素材形状 / 加工後形状: 目標とする完成形状
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingStlDrop(null)}>キャンセル</Button>
          <Button variant="outlined" onClick={() => handlePendingStlRoleSelect('target')}>加工後形状として読み込む</Button>
          <Button variant="contained" onClick={() => handlePendingStlRoleSelect('stock')}>材料として読み込む</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
};

console.log('Renderer script executing...');
const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
