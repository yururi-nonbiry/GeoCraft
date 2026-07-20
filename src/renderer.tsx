import React, { useState, useEffect, useMemo } from 'react';
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
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextareaAutosize,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, Settings, Memory, Save, FolderOpen } from '@mui/icons-material';

import { api } from './api';

import ThreeViewer from './components/ThreeViewer';
import ControlPanel from './components/ControlPanel';
import { Geometry, ToolpathSegment, Toolpath, SerialPortInfo, MachineSetting, EditableMachineSetting, ToolSetting, EditableToolSetting } from './types';
import { createBoxStlData, translateStlData } from './stlUtils';

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

type MaterialSetting = {
  id: number;
  name: string;
  feedRate: number;
  plungeRate: number;
  rpm: number;
  depthPerPass: number;
};

type EditableMaterialSetting = Omit<MaterialSetting, 'id'> & { id: number | null };

type PersistedSettings = {
  machineSettings?: MachineSetting[];
  selectedMachineId?: number;
  materialSettings?: MaterialSetting[];
  toolSettings?: ToolSetting[];
  selectedMaterialId?: number;
  selectedToolId?: number;
};

type StlPlacement = {
  fileName: string | null;
  stlDataBase64: string | null;
  offset: { x: number; y: number; z: number };
  boxSize?: { x: number; y: number; z: number };
};

const PROJECT_FILE_VERSION = 1;

type ProjectData = {
  version: number;
  stock: StlPlacement;
  target: StlPlacement;
  geometry: Geometry | null;
  toolpaths: ToolpathSegment[] | null;
  toolDiameter: number;
  stepover: number;
  sliceHeight: number;
  contourSide: string;
  feedRate: number;
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

const EMPTY_MACHINE: EditableMachineSetting = {
  id: null,
  name: '',
  safeZ: 5.0,
  retractZ: 2.0,
  stepDown: -2.0,
  peckQ: 1.0,
  gcodeHeader: 'G90 G21 G17',
  gcodeFooter: 'M30',
  workAreaX: 300,
  workAreaY: 300,
  workAreaZ: 100,
};

const EMPTY_MATERIAL: EditableMaterialSetting = {
  id: null,
  name: '',
  feedRate: 1000,
  plungeRate: 300,
  rpm: 15000,
  depthPerPass: 1,
};

const EMPTY_TOOL: EditableToolSetting = {
  id: null,
  machineId: 1,
  name: '',
  diameter: 3,
  type: 'endmill',
  roughing: { depthPerPass: 1.0, feedRate: 1000, plungeRate: 300, rpm: 15000 },
  finishing: { depthPerPass: 0.5, feedRate: 800, plungeRate: 200, rpm: 15000, stockToLeave: 0.0 }
};

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
  const [stockStlFile, setStockStlFile] = useState<string | null>(null);
  const [stockStlPath, setStockStlPath] = useState<string | null>(null);
  const [targetStlFile, setTargetStlFile] = useState<string | null>(null);
  const [stockStlData, setStockStlData] = useState<ArrayBuffer | null>(null);
  const [targetStlData, setTargetStlData] = useState<ArrayBuffer | null>(null);
  const [pickFaceMode, setPickFaceMode] = useState<'stock' | 'target' | null>(null);
  // 3Dパス生成後のプレビューモード。true の間は材料/加工後形状の位置調整を禁止する
  const [previewMode, setPreviewMode] = useState(false);
  const [stockOffset, setStockOffset] = useState({ x: 0, y: 0, z: 0 });
  const [targetOffset, setTargetOffset] = useState({ x: 0, y: 0, z: 0 });
  const [stockBoxSize, setStockBoxSize] = useState({ x: 100, y: 100, z: 20 });
  const [feedRate, setFeedRate] = useState<number>(DEFAULT_MATERIALS[0]?.feedRate ?? 100);
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
  const [showToolpaths, setShowToolpaths] = useState(true);

  // --- 加工シミュレーション state ---
  const [simEnabled, setSimEnabled] = useState(false);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simSpeed, setSimSpeed] = useState(1);
  const [stockMargin, setStockMargin] = useState(5);
  const [stockThickness, setStockThickness] = useState(10);
  const [simResetToken, setSimResetToken] = useState(0);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMachineDialogOpen, setIsMachineDialogOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<EditableMachineSetting>({ ...EMPTY_MACHINE });
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<EditableMaterialSetting>({ ...EMPTY_MATERIAL });
  const [isToolDialogOpen, setIsToolDialogOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<EditableToolSetting>({ ...EMPTY_TOOL });

  // CNC Connection State
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [consoleLog, setConsoleLog] = useState<string[]>([]);

  // G-code Sending State
  const [gcode, setGcode] = useState('');
  const [gcodeStatus, setGcodeStatus] = useState<'idle' | 'sending' | 'paused' | 'finished' | 'error'>('idle');
  const [gcodeProgress, setGcodeProgress] = useState({ sent: 0, total: 0 });

  // 3D Path Generation State
  const [isGenerating3dPath, setIsGenerating3dPath] = useState(false);
  const [path3dProgress, setPath3dProgress] = useState({ current: 0, total: 0 });

  // Jog & Status State
  const [jogStep, setJogStep] = useState(10);
  const [machinePosition, setMachinePosition] = useState({ wpos: { x: 0, y: 0, z: 0 }, mpos: { x: 0, y: 0, z: 0 }, status: 'Unknown' });
  const [grblSettings, setGrblSettings] = useState({
    stepsX: 250,
    stepsY: 250,
    stepsZ: 250,
    invertX: false,
    invertY: false,
    invertZ: false,
  });

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

  // --- CNC Connection Logic ---
  const handleRefreshPorts = () => {
    api.listSerialPorts().then(result => {
      if (result.status === 'success') {
        setSerialPorts(result.ports);
        if (result.ports.length > 0 && !selectedPort) {
          setSelectedPort(result.ports[0].path);
        }
      } else {
        alert(`ポートの取得に失敗しました: ${result.message}`);
      }
    });
  };

  useEffect(() => {
    handleRefreshPorts();
    const removeDataListener = api.onSerialData((data) => setConsoleLog(prev => [...prev, `> ${data}`]));
    const removeClosedListener = api.onSerialClosed(() => {
      setIsConnected(false);
      setConsoleLog(prev => [...prev, '--- 接続が切断されました ---']);
    });
    const removeGcodeProgressListener = api.onGcodeProgress(progress => {
      setGcodeProgress({ sent: progress.sent, total: progress.total });
      setGcodeStatus(progress.status);
      if (progress.status === 'finished') {
        setConsoleLog(prev => [...prev, '--- G-code送信完了 ---']);
        setGcodeStatus('idle');
      } else if (progress.status === 'error') {
        setConsoleLog(prev => [...prev, '--- G-code送信エラー ---']);
        setGcodeStatus('idle');
      }
    });
    const removeStatusListener = api.onStatus(status => setMachinePosition(status));
    const removeFileOpenListener = api.onFileOpen((filePath) => {
      setToolpaths(null);
      setGeometry(null);
      setStockStlFile(null);
      setStockStlPath(null);
      setTargetStlFile(null);
      setStockStlData(null);
      setTargetStlData(null);
      setPickFaceMode(null);
      setPreviewMode(false);
      setStockOffset({ x: 0, y: 0, z: 0 });
      setTargetOffset({ x: 0, y: 0, z: 0 });
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
    const removePathProgressListener = api.onPathProgress((progress) => {
      setPath3dProgress({ current: progress.current, total: progress.total });
    });
    const removeGrblSettingListener = api.onGrblSetting((setting) => {
      setGrblSettings(prev => {
        const next = { ...prev };
        if (setting.id === 100) next.stepsX = setting.value;
        if (setting.id === 101) next.stepsY = setting.value;
        if (setting.id === 102) next.stepsZ = setting.value;
        if (setting.id === 3) {
          const val = Math.round(setting.value);
          next.invertX = (val & 1) !== 0;
          next.invertY = (val & 2) !== 0;
          next.invertZ = (val & 4) !== 0;
        }
        return next;
      });
    });

    return () => {
      removeDataListener();
      removeClosedListener();
      removeGcodeProgressListener();
      removeStatusListener();
      removeFileOpenListener();
      removePathProgressListener();
      removeGrblSettingListener();
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
        setStockToLeave(0.0);
      }
      return;
    }

    setToolDiameter(selectedTool.diameter);

    const cutSettings = processType === 'roughing' ? selectedTool.roughing : selectedTool.finishing;
    if (cutSettings) {
      setFeedRate(cutSettings.feedRate);
      updateMachineSetting('stepDown', -Math.abs(cutSettings.depthPerPass));
      if (processType === 'roughing') {
        setStockToLeave(selectedTool.finishing.stockToLeave ?? 0.0);
      } else {
        setStockToLeave(0.0);
      }
    }
  }, [selectedToolId, selectedMachineId, toolSettings, processType]);

  useEffect(() => {
    const selectedMaterial = materialSettings.find((material) => material.id === selectedMaterialId);
    if (!selectedMaterial && materialSettings.length > 0 && selectedMaterialId !== materialSettings[0].id) {
      setSelectedMaterialId(materialSettings[0].id);
    }
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

  const handleConnect = async () => {
    if (!selectedPort) return alert('ポートを選択してください。');
    const result = await api.connectSerial(selectedPort, baudRate);
    if (result.status === 'success') {
      setIsConnected(true);
      setConsoleLog(prev => [...prev, `--- ${selectedPort}に接続しました ---`]);
      setTimeout(() => {
        api.requestGrblSettings();
      }, 500);
    } else {
      alert(`接続エラー: ${result.message}`);
    }
  };

  const handleDisconnect = async () => {
    const result = await api.disconnectSerial();
    if (result.status !== 'success') alert(`切断エラー: ${result.message}`);
  };

  const handleJog = (axis: 'X' | 'Y' | 'Z', direction: number) => {
    if (isConnected) api.jog(axis, direction, jogStep);
  };

  const handleSetZero = () => {
    if (isConnected && confirm('現在のワーク座標をすべて0に設定します。よろしいですか？')) {
      api.setZero();
    }
  };

  const handleRequestGrblSettings = () => {
    if (isConnected) {
      api.requestGrblSettings();
    }
  };

  const handleSaveGrblSettings = () => {
    if (isConnected) {
      api.saveGrblSettings(
        grblSettings.stepsX,
        grblSettings.stepsY,
        grblSettings.stepsZ,
        grblSettings.invertX,
        grblSettings.invertY,
        grblSettings.invertZ
      );
      alert('設定書き込みコマンドを送信しました。');
    }
  };

  const handleSendGcode = () => {
    if (gcode.trim() === '') return alert('送信するG-codeがありません。');
    api.sendGcode(gcode);
    setGcodeStatus('sending');
  };

  const handlePauseGcode = () => api.pauseGcode();
  const handleResumeGcode = () => api.resumeGcode();
  const handleStopGcode = () => api.stopGcode();

  // 完全な円（DXFのCIRCLEエンティティ等）はセグメントを持たずarcsのみに格納されるため、
  // 他の形状と線分共有していない（＝隣接していない）円は別途ループとして追加する
  const arcToPolygon = (arc: { center: number[]; radius: number }, segmentCount = 64): Array<[number, number, number]> => {
    const [cx, cy, cz] = arc.center;
    const points: Array<[number, number, number]> = [];
    for (let i = 0; i < segmentCount; i++) {
      const angle = (i / segmentCount) * 2 * Math.PI;
      points.push([cx + arc.radius * Math.cos(angle), cy + arc.radius * Math.sin(angle), cz]);
    }
    return points;
  };

  const getConnectedGeometries = () => {
    const hasSegments = !!geometry && !!geometry.segments && geometry.segments.length > 0;
    const hasArcs = !!geometry && !!geometry.arcs && geometry.arcs.length > 0;
    if (!hasSegments && !hasArcs) return [];
    const geometries: Array<Array<[number, number, number]>> = [];
    if (geometry?.arcs) {
      for (const arc of geometry.arcs) {
        const span = Math.abs(arc.end_angle - arc.start_angle);
        if (Math.abs(span - 360) < 1e-6) {
          geometries.push(arcToPolygon(arc));
        }
      }
    }
    if (!hasSegments) return geometries;
    const pointToKey = (p: [number, number, number]) => p.map(v => v.toFixed(4)).join(',');
    const remaining = new Set(geometry!.segments);
    while (remaining.size > 0) {
      const path: Array<[number, number, number]> = [];
      const startSeg = remaining.values().next().value;
      if (!startSeg) continue;
      remaining.delete(startSeg);
      path.push(...startSeg.points);
      let firstPointKey = pointToKey(path[0]);
      let lastPointKey = pointToKey(path[path.length - 1]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const seg of remaining) {
          const p1Key = pointToKey(seg.points[0]);
          const p2Key = pointToKey(seg.points[1]);
          if (p1Key === lastPointKey) {
            path.push(seg.points[1]);
            lastPointKey = p2Key;
            remaining.delete(seg);
            changed = true;
            break;
          }
          if (p2Key === lastPointKey) {
            path.push(seg.points[0]);
            lastPointKey = p1Key;
            remaining.delete(seg);
            changed = true;
            break;
          }
          if (p2Key === firstPointKey) {
            path.unshift(seg.points[0]);
            firstPointKey = p1Key;
            remaining.delete(seg);
            changed = true;
            break;
          }
          if (p1Key === firstPointKey) {
            path.unshift(seg.points[1]);
            firstPointKey = p2Key;
            remaining.delete(seg);
            changed = true;
            break;
          }
        }
      }
      geometries.push(path);
    }
    return geometries;
  };

  // 面積の絶対値が最大のループを外側輪郭とみなし、それ以外（内側の穴）は逆側にオフセットする
  const polygonSignedArea = (vertices: Array<[number, number, number]>): number => {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const [x1, y1] = vertices[i];
      const [x2, y2] = vertices[(i + 1) % vertices.length];
      area += x1 * y2 - x2 * y1;
    }
    return area / 2;
  };
  const oppositeSide = (side: string) => (side === 'outer' ? 'inner' : 'outer');

  const handleGenerateContour = async () => {
    const geometries = getConnectedGeometries();
    if (geometries.length === 0 || !geometry || !geometry.arcs) return alert('ツールパスを生成するための図形が読み込まれていません。');
    const outerIndex = geometries.reduce(
      (maxIdx, verts, idx, arr) => (Math.abs(polygonSignedArea(verts)) > Math.abs(polygonSignedArea(arr[maxIdx])) ? idx : maxIdx),
      0
    );
    try {
      const allSegments: ToolpathSegment[] = [];
      let fitArcError: string | null = null;
      let linearErrorCount = 0;
      let lastLinearError: string | null = null;
      for (let i = 0; i < geometries.length; i++) {
        const vertices = geometries[i];
        const side = i === outerIndex ? contourSide : oppositeSide(contourSide);
        const linearResult = await api.generateContourPath(toolDiameter, vertices, side, processType === 'roughing' ? stockToLeave : 0.0);
        if (linearResult.status !== 'success') {
          linearErrorCount++;
          lastLinearError = linearResult.message;
          continue;
        }
        // オフセットでくびれが切れて形状が分裂した場合、切削可能な断片が複数返ってくることがあるため全て処理する
        const toolpathPieces: number[][][] = linearResult.toolpaths ?? [linearResult.toolpath];
        for (const piece of toolpathPieces) {
          const fittedResult = await api.fitArcsToToolpath(piece, geometry.arcs);
          if (fittedResult.status === 'success') {
            allSegments.push(...fittedResult.toolpath_segments);
          } else {
            fitArcError = fitArcError ?? fittedResult.message;
            allSegments.push({ type: 'line', points: piece });
          }
        }
      }
      if (linearErrorCount > 0) {
        alert(linearErrorCount === 1 ? `初期パス生成エラー: ${lastLinearError}` : `初期パス生成エラー: ${linearErrorCount}件の形状でパスを生成できませんでした（${lastLinearError}）`);
      }
      if (fitArcError) alert(`円弧フィットエラー: ${fitArcError}`);
      if (allSegments.length > 0) setToolpaths(allSegments);
      resetSimulation();
    } catch (error) {
      alert(`パス生成に失敗しました: ${error}`);
    }
  };

  const handleGeneratePocket = async () => {
    const geometries = getConnectedGeometries();
    if (geometries.length === 0) return alert('ツールパスを生成するための図形が読み込まれていません。');
    // 最大面積のループを外形、それ以外は内側の穴（島）とみなし、
    // 外形から穴を差し引いた領域をまとめて1回でオフセットする（穴を無視すると格子状の内部形状が正しく削れないため）
    const outerIndex = geometries.reduce(
      (maxIdx, verts, idx, arr) => (Math.abs(polygonSignedArea(verts)) > Math.abs(polygonSignedArea(arr[maxIdx])) ? idx : maxIdx),
      0
    );
    try {
      const shell = geometries[outerIndex].map(([x, y]) => [x, y]);
      const holes = geometries.filter((_, idx) => idx !== outerIndex).map(verts => verts.map(([x, y]) => [x, y]));
      const params = {
        geometry: shell,
        toolDiameter,
        stepover: toolDiameter * stepover,
        stockToLeave: processType === 'roughing' ? stockToLeave : 0.0,
        holes,
      };
      const result = await api.generatePocketPath(params);
      if (result.status === 'success') {
        setToolpaths(result.toolpaths.map((path: number[][]) => ({ type: 'line' as const, points: path })));
      } else {
        alert(`パス生成エラー: ${result.message}`);
      }
      resetSimulation();
    } catch (error) {
      alert(`パス生成に失敗しました: ${error}`);
    }
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const loadStlData = async (filePath: string): Promise<ArrayBuffer | null> => {
    const result = await api.readFileAsBase64(filePath);
    if (result.status !== 'success') {
      alert(`STLファイルの読み込みに失敗しました: ${result.message}`);
      return null;
    }
    return base64ToArrayBuffer(result.data);
  };

  const handleSelectStockStl = async () => {
    const result = await api.openFile('stl');
    if (result.status === 'success') {
      setStockStlFile(result.filePath);
      setStockStlPath(result.filePath);
      setStockStlData(await loadStlData(result.filePath));
      setPickFaceMode(null);
      setPreviewMode(false);
      setStockOffset({ x: 0, y: 0, z: 0 });
      setToolpaths(null);
    }
  };

  const handleCreateBoxStock = async () => {
    const { x, y, z } = stockBoxSize;
    if (x <= 0 || y <= 0 || z <= 0) return alert('材料の幅・奥行き・高さには0より大きい値を入力してください。');
    const stlData = createBoxStlData(x, y, z);
    const result = await api.writeTempStlFile(arrayBufferToBase64(stlData));
    if (result.status !== 'success') return alert(`材料STLの生成に失敗しました: ${result.message}`);
    setStockStlFile(`矩形材料 ${x}×${y}×${z}mm`);
    setStockStlPath(result.filePath);
    setStockStlData(stlData);
    setPickFaceMode(null);
    setPreviewMode(false);
    setStockOffset({ x: 0, y: 0, z: 0 });
    setToolpaths(null);
  };

  const handleSelectTargetStl = async () => {
    const result = await api.openFile('stl');
    if (result.status === 'success') {
      setTargetStlFile(result.filePath);
      setTargetStlData(await loadStlData(result.filePath));
      setPickFaceMode(null);
      setPreviewMode(false);
      setTargetOffset({ x: 0, y: 0, z: 0 });
      setToolpaths(null);
    }
  };

  // ビューア上のオフセット(stockOffset/targetOffset)は表示位置の調整用だが、
  // パス生成はSTLファイルの実座標を元に行われるため、オフセットが設定されている場合は
  // 頂点座標にオフセットを焼き込んだ一時STLを生成してからパスを生成する。
  const resolveOffsetStlPath = async (
    originalPath: string,
    data: ArrayBuffer | null,
    offset: { x: number; y: number; z: number }
  ): Promise<string> => {
    if (!data || (offset.x === 0 && offset.y === 0 && offset.z === 0)) return originalPath;
    const translated = translateStlData(data, offset);
    const result = await api.writeTempStlFile(arrayBufferToBase64(translated));
    if (result.status !== 'success') throw new Error(result.message ?? '一時STLファイルの書き込みに失敗しました。');
    return result.filePath;
  };

  const handleGenerate3dPath = async () => {
    if (!stockStlPath || !targetStlFile) return alert('3D加工パスを生成するには、材料と加工後形状の両方のSTLファイルを開いてください。');
    setPath3dProgress({ current: 0, total: 0 });
    setIsGenerating3dPath(true);
    try {
      const stockPath = await resolveOffsetStlPath(stockStlPath, stockStlData, stockOffset);
      const targetPath = await resolveOffsetStlPath(targetStlFile, targetStlData, targetOffset);
      const params = {
        stockPath,
        targetPath,
        sliceHeight,
        toolDiameter,
        stepoverRatio: stepover
      };
      const result = await api.generate3dRoughingPath(params);
      if (result.status === 'success') {
        setToolpaths(result.toolpaths);
        // 3Dパス生成後は誤って材料/加工後形状を動かさないようプレビューモードに入る
        setPreviewMode(true);
      } else {
        alert(`3Dパス生成エラー: ${result.message}`);
      }
    } catch (error) {
      alert(`3Dパス生成に失敗しました: ${error}`);
    } finally {
      setIsGenerating3dPath(false);
    }
  };

  const handleGenerateDrillGcode = async () => {
    if (!geometry || !geometry.drill_points || geometry.drill_points.length === 0) return alert('Gコードを生成するためのドリル点がありません。');
    try {
      const params = {
        drillPoints: geometry.drill_points,
        feedRate,
        safeZ: currentMachine.safeZ,
        retractZ: currentMachine.retractZ,
        stepDown: currentMachine.stepDown,
        peckQ: currentMachine.peckQ,
      };
      const result = await api.generateDrillGcode(params);
      if (result.status === 'success') alert(`ドリルGコードを保存しました: ${result.filePath}`);
      else if (result.status !== 'canceled') alert(`Gコードの保存に失敗しました: ${result.message}`);
    } catch (error) {
      alert(`Gコードの保存に失敗しました: ${error}`);
    }
  };

  const handleSaveGcode = async () => {
    if (!toolpaths || toolpaths.length === 0) return alert('保存するツールパスがありません。');
    try {
      const params = {
        toolpaths: toolpaths,
        feedRate,
        safeZ: currentMachine.safeZ,
        stepDown: currentMachine.stepDown,
        retractZ: currentMachine.retractZ,
      };
      const result = await api.generateGcode(params);
      if (result.status === 'success') alert(`Gコードを保存しました: ${result.filePath}`);
      else if (result.status !== 'canceled') alert(`Gコードの保存に失敗しました: ${result.message}`);
    } catch (error) {
      alert(`Gコードの保存に失敗しました: ${error}`);
    }
  };

  const handleSaveProject = async () => {
    try {
      const project: ProjectData = {
        version: PROJECT_FILE_VERSION,
        stock: {
          fileName: stockStlFile,
          stlDataBase64: stockStlData ? arrayBufferToBase64(stockStlData) : null,
          offset: stockOffset,
          boxSize: stockBoxSize,
        },
        target: {
          fileName: targetStlFile,
          stlDataBase64: targetStlData ? arrayBufferToBase64(targetStlData) : null,
          offset: targetOffset,
        },
        geometry,
        toolpaths,
        toolDiameter,
        stepover,
        sliceHeight,
        contourSide,
        feedRate,
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
      if (result.status === 'success') alert(`プロジェクトを保存しました: ${result.filePath}`);
      else if (result.status !== 'canceled') alert(`プロジェクトの保存に失敗しました: ${result.message}`);
    } catch (error) {
      alert(`プロジェクトの保存に失敗しました: ${error}`);
    }
  };

  const restorePlacement = async (
    placement: StlPlacement | undefined,
    setFile: (v: string | null) => void,
    setData: (v: ArrayBuffer | null) => void,
    setOffset: (v: { x: number; y: number; z: number }) => void,
    setPath?: (v: string | null) => void
  ) => {
    if (!placement || !placement.stlDataBase64) {
      setFile(null);
      setData(null);
      setOffset({ x: 0, y: 0, z: 0 });
      if (setPath) setPath(null);
      return;
    }
    const data = base64ToArrayBuffer(placement.stlDataBase64);
    setFile(placement.fileName ?? null);
    setData(data);
    setOffset(placement.offset ?? { x: 0, y: 0, z: 0 });
    if (setPath) {
      // 復元されたSTLは元のファイルパスが存在しない可能性があるため、
      // ツールパス生成に使える一時ファイルとして書き出し直す。
      const written = await api.writeTempStlFile(placement.stlDataBase64);
      setPath(written.status === 'success' ? written.filePath : null);
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
    await restorePlacement(project.stock, setStockStlFile, setStockStlData, setStockOffset, setStockStlPath);
    await restorePlacement(project.target, setTargetStlFile, setTargetStlData, setTargetOffset);
    if (project.stock?.boxSize) setStockBoxSize(project.stock.boxSize);

    setGeometry(project.geometry ?? null);
    setToolpaths(project.toolpaths ?? null);
    if (typeof project.toolDiameter === 'number') setToolDiameter(project.toolDiameter);
    if (typeof project.stepover === 'number') setStepover(project.stepover);
    if (typeof project.sliceHeight === 'number') setSliceHeight(project.sliceHeight);
    if (project.contourSide) setContourSide(project.contourSide);
    if (typeof project.feedRate === 'number') setFeedRate(project.feedRate);
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
    alert(`プロジェクトを読み込みました: ${result.filePath}`);
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
          <Grid item sx={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
            <ThreeViewer
              toolpaths={toolpaths}
              displayToolpaths={displayToolpaths}
              geometry={geometry}
              stockStlData={stockStlData}
              targetStlData={targetStlData}
              pickFaceMode={pickFaceMode}
              onFacePicked={(mode) => {
                setPickFaceMode(null);
                if (mode === 'stock') setStockOffset({ x: 0, y: 0, z: 0 });
                else setTargetOffset({ x: 0, y: 0, z: 0 });
              }}
              machineWorkArea={{ x: currentMachine.workAreaX, y: currentMachine.workAreaY, z: currentMachine.workAreaZ }}
              stockOffset={stockOffset}
              targetOffset={targetOffset}
              onStockOffsetChange={setStockOffset}
              onTargetOffsetChange={setTargetOffset}
              previewMode={previewMode}
              showStock={showStock}
              showTarget={showTarget}
              showToolpaths={showToolpaths}
              simulation={{
                enabled: simEnabled,
                toolRadius: toolDiameter / 2,
                cutZ: currentMachine.stepDown,
                stockMargin,
                stockThickness,
                playing: simPlaying,
                speed: simSpeed,
                resetToken: simResetToken,
                onProgress: setSimProgress,
                onFinished: () => setSimPlaying(false),
              }}
            />
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
            handleSaveGcode={handleSaveGcode}
            safeZ={currentMachine.safeZ}
            setSafeZ={(val) => updateMachineSetting('safeZ', val)}
            stepDown={currentMachine.stepDown}
            setStepDown={(val) => updateMachineSetting('stepDown', val)}
            isConnected={isConnected}
            selectedPort={selectedPort}
            setSelectedPort={setSelectedPort}
            serialPorts={serialPorts}
            baudRate={baudRate}
            setBaudRate={setBaudRate}
            handleRefreshPorts={handleRefreshPorts}
            handleConnect={handleConnect}
            handleDisconnect={handleDisconnect}
            consoleLog={consoleLog}
            gcode={gcode}
            setGcode={setGcode}
            handleSendGcode={handleSendGcode}
            gcodeStatus={gcodeStatus}
            handlePauseGcode={handlePauseGcode}
            handleResumeGcode={handleResumeGcode}
            handleStopGcode={handleStopGcode}
            gcodeProgress={gcodeProgress}
            machinePosition={machinePosition}
            jogStep={jogStep}
            setJogStep={setJogStep}
            handleJog={handleJog}
            handleSetZero={handleSetZero}
            machineSettings={machineSettings}
            selectedMachineId={selectedMachineId}
            setSelectedMachineId={setSelectedMachineId}
            grblSettings={grblSettings}
            setGrblSettings={setGrblSettings}
            handleRequestGrblSettings={handleRequestGrblSettings}
            handleSaveGrblSettings={handleSaveGrblSettings}
            toolSettings={toolSettings}
            selectedToolId={selectedToolId}
            setSelectedToolId={setSelectedToolId}
            processType={processType}
            setProcessType={setProcessType}
            stockToLeave={stockToLeave}
            setStockToLeave={setStockToLeave}
            showStock={showStock}
            setShowStock={setShowStock}
            showTarget={showTarget}
            setShowTarget={setShowTarget}
            showToolpaths={showToolpaths}
            setShowToolpaths={setShowToolpaths}
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
          />
        </Grid>
      </Box>

      <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>設定</DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>加工機設定</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button variant="contained" size="small" onClick={() => { setEditingMachine({ ...EMPTY_MACHINE }); setIsMachineDialogOpen(true); }}>加工機を追加</Button>
          </Box>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell align="right">安全高さ (Z)</TableCell>
                  <TableCell align="right">切込み深さ (Z)</TableCell>
                  <TableCell align="right">R点 (退避Z)</TableCell>
                  <TableCell align="right">ペック量 (Q)</TableCell>
                  <TableCell align="right">加工範囲 X×Y×Z (mm)</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {machineSettings.map((machine) => (
                  <TableRow key={machine.id} hover selected={machine.id === selectedMachineId}>
                    <TableCell>{machine.name}</TableCell>
                    <TableCell align="right">{machine.safeZ}</TableCell>
                    <TableCell align="right">{machine.stepDown}</TableCell>
                    <TableCell align="right">{machine.retractZ}</TableCell>
                    <TableCell align="right">{machine.peckQ}</TableCell>
                    <TableCell align="right">{machine.workAreaX}×{machine.workAreaY}×{machine.workAreaZ}</TableCell>
                    <TableCell align="center">
                      <Button size="small" onClick={() => { setEditingMachine({ ...machine }); setIsMachineDialogOpen(true); }} sx={{ mr: 1 }}>編集</Button>
                      <Button size="small" color="secondary" onClick={() => {
                        if (confirm('この加工機を削除しますか？')) {
                          setMachineSettings((prev) => {
                            const updated = prev.filter((m) => m.id !== machine.id);
                            if (machine.id === selectedMachineId) {
                              setSelectedMachineId(updated.length ? updated[0].id : '');
                            }
                            return updated;
                          });
                        }
                      }}>削除</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>材料設定</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button variant="contained" size="small" onClick={() => { setEditingMaterial({ ...EMPTY_MATERIAL }); setIsMaterialDialogOpen(true); }}>材料を追加</Button>
          </Box>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell align="right">送り (mm/min)</TableCell>
                  <TableCell align="right">突っ込み (mm/min)</TableCell>
                  <TableCell align="right">RPM</TableCell>
                  <TableCell align="right">切込み深さ (mm)</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materialSettings.map((material) => (
                  <TableRow key={material.id} hover selected={material.id === selectedMaterialId}>
                    <TableCell>{material.name}</TableCell>
                    <TableCell align="right">{material.feedRate}</TableCell>
                    <TableCell align="right">{material.plungeRate}</TableCell>
                    <TableCell align="right">{material.rpm}</TableCell>
                    <TableCell align="right">{material.depthPerPass}</TableCell>
                    <TableCell align="center">
                      <Button size="small" onClick={() => { setEditingMaterial({ ...material }); setIsMaterialDialogOpen(true); }} sx={{ mr: 1 }}>編集</Button>
                      <Button size="small" color="secondary" onClick={() => {
                        if (confirm('この材料を削除しますか？')) {
                          setMaterialSettings((prev) => {
                            const updated = prev.filter((m) => m.id !== material.id);
                            if (material.id === selectedMaterialId) {
                              setSelectedMaterialId(updated.length ? updated[0].id : '');
                            }
                            return updated;
                          });
                        }
                      }}>削除</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>工具設定 (選択中の加工機向け)</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button variant="contained" size="small" onClick={() => { setEditingTool({ ...EMPTY_TOOL, machineId: typeof selectedMachineId === 'number' ? selectedMachineId : 1 }); setIsToolDialogOpen(true); }}>工具を追加</Button>
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell align="right">径 (mm)</TableCell>
                  <TableCell>種類</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {toolSettings.filter(t => t.machineId === selectedMachineId).map((tool) => (
                  <TableRow key={tool.id} hover selected={tool.id === selectedToolId}>
                    <TableCell>{tool.name}</TableCell>
                    <TableCell align="right">{tool.diameter}</TableCell>
                    <TableCell>{tool.type}</TableCell>
                    <TableCell align="center">
                      <Button size="small" onClick={() => { setEditingTool({ ...tool }); setIsToolDialogOpen(true); }} sx={{ mr: 1 }}>編集</Button>
                      <Button size="small" color="secondary" onClick={() => {
                        if (confirm('この工具を削除しますか？')) {
                          setToolSettings((prev) => {
                            const updated = prev.filter((t) => t.id !== tool.id);
                            if (tool.id === selectedToolId) {
                              setSelectedToolId(updated.length ? updated[0].id : '');
                            }
                            return updated;
                          });
                        }
                      }}>削除</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsSettingsOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                await window.electronAPI.saveSettings({
                  machineSettings,
                  selectedMachineId: typeof selectedMachineId === 'number' ? selectedMachineId : undefined,
                  materialSettings,
                  toolSettings,
                  selectedMaterialId: typeof selectedMaterialId === 'number' ? selectedMaterialId : undefined,
                  selectedToolId: typeof selectedToolId === 'number' ? selectedToolId : undefined,
                });
                setIsSettingsOpen(false);
              } catch (error) {
                console.error('Failed to save settings', error);
                alert('設定の保存に失敗しました。');
              }
            }}
          >保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isMachineDialogOpen} onClose={() => setIsMachineDialogOpen(false)}>
        <DialogTitle>{editingMachine.id ? '加工機を編集' : '加工機を追加'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="名称"
            value={editingMachine.name}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="安全高さ (Z)"
            type="number"
            value={editingMachine.safeZ}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, safeZ: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="切込み深さ (Z)"
            type="number"
            value={editingMachine.stepDown}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, stepDown: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="R点 (切込み開始高さ)"
            type="number"
            value={editingMachine.retractZ}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, retractZ: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="ペック量 (Q)"
            type="number"
            value={editingMachine.peckQ}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, peckQ: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="加工範囲 X (幅, mm)"
            type="number"
            value={editingMachine.workAreaX}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, workAreaX: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
            helperText="原点(0)からテーブル奥までのX方向可動範囲"
          />
          <TextField
            label="加工範囲 Y (奥行き, mm)"
            type="number"
            value={editingMachine.workAreaY}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, workAreaY: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
            helperText="原点(0)からテーブル奥までのY方向可動範囲"
          />
          <TextField
            label="加工範囲 Z (高さ, mm)"
            type="number"
            value={editingMachine.workAreaZ}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, workAreaZ: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
            helperText="原点(Z=0)から下方向への可動範囲"
          />
          <TextField
            label="G-code ヘッダー"
            value={editingMachine.gcodeHeader}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, gcodeHeader: e.target.value }))}
            fullWidth
            margin="dense"
            multiline
            minRows={2}
          />
          <TextField
            label="G-code フッター"
            value={editingMachine.gcodeFooter}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, gcodeFooter: e.target.value }))}
            fullWidth
            margin="dense"
            multiline
            minRows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsMachineDialogOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!editingMachine.name.trim()) {
                alert('加工機名を入力してください。');
                return;
              }
              if (editingMachine.id !== null) {
                setMachineSettings((prev) => prev.map((machine) => (machine.id === editingMachine.id ? { ...editingMachine, id: editingMachine.id } : machine)));
              } else {
                const newMachine: MachineSetting = { ...editingMachine, id: Date.now() };
                setMachineSettings((prev) => [...prev, newMachine]);
                setSelectedMachineId(newMachine.id);
              }
              setIsMachineDialogOpen(false);
            }}
          >保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isMaterialDialogOpen} onClose={() => setIsMaterialDialogOpen(false)}>
        <DialogTitle>{editingMaterial.id ? '材料を編集' : '材料を追加'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="名称"
            value={editingMaterial.name}
            onChange={(e) => setEditingMaterial((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="送り速度 (mm/min)"
            type="number"
            value={editingMaterial.feedRate}
            onChange={(e) => setEditingMaterial((prev) => ({ ...prev, feedRate: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="突っ込み速度 (mm/min)"
            type="number"
            value={editingMaterial.plungeRate}
            onChange={(e) => setEditingMaterial((prev) => ({ ...prev, plungeRate: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="主軸回転数 (RPM)"
            type="number"
            value={editingMaterial.rpm}
            onChange={(e) => setEditingMaterial((prev) => ({ ...prev, rpm: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
          />
          <TextField
            label="切込み深さ (mm)"
            type="number"
            value={editingMaterial.depthPerPass}
            onChange={(e) => setEditingMaterial((prev) => ({ ...prev, depthPerPass: Number(e.target.value) || 0 }))}
            fullWidth
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsMaterialDialogOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!editingMaterial.name.trim()) {
                alert('材料名を入力してください。');
                return;
              }
              if (editingMaterial.id !== null) {
                setMaterialSettings((prev) => prev.map((material) => (material.id === editingMaterial.id ? { ...editingMaterial, id: editingMaterial.id } : material)));
              } else {
                const newMaterial: MaterialSetting = { ...editingMaterial, id: Date.now() };
                setMaterialSettings((prev) => [...prev, newMaterial]);
                setSelectedMaterialId(newMaterial.id);
              }
              setIsMaterialDialogOpen(false);
            }}
          >保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isToolDialogOpen} onClose={() => setIsToolDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingTool.id ? '工具を編集' : '工具を追加'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {/* 基本設定 */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>基本情報</Typography>
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="名称"
                value={editingTool.name || ''}
                onChange={(e) => setEditingTool((prev) => ({ ...prev, name: e.target.value }))}
                fullWidth
                margin="dense"
                size="small"
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                label="径 (mm)"
                type="number"
                value={editingTool.diameter || 0}
                onChange={(e) => setEditingTool((prev) => ({ ...prev, diameter: Number(e.target.value) || 0 }))}
                fullWidth
                margin="dense"
                size="small"
              />
            </Grid>
            <Grid item xs={3}>
              <FormControl fullWidth margin="dense" size="small">
                <InputLabel>種類</InputLabel>
                <Select
                  value={editingTool.type || 'endmill'}
                  label="種類"
                  onChange={(e) => setEditingTool((prev) => ({ ...prev, type: e.target.value }))}
                >
                  <MenuItem value="endmill">エンドミル</MenuItem>
                  <MenuItem value="ballend">ボールエンドミル</MenuItem>
                  <MenuItem value="drill">ドリル</MenuItem>
                  <MenuItem value="vbit">Vビット</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* 粗削り加工条件 */}
            <Grid item xs={6}>
              <Typography variant="subtitle2" color="primary" sx={{ mt: 2 }} gutterBottom>粗削り加工条件</Typography>
              <TextField
                label="切込み量 (mm)"
                type="number"
                value={editingTool.roughing?.depthPerPass ?? 1.0}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  roughing: { ...prev.roughing!, depthPerPass: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
              <TextField
                label="送り速度 (mm/min)"
                type="number"
                value={editingTool.roughing?.feedRate ?? 1000}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  roughing: { ...prev.roughing!, feedRate: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
              <TextField
                label="突っ込み速度 (mm/min)"
                type="number"
                value={editingTool.roughing?.plungeRate ?? 300}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  roughing: { ...prev.roughing!, plungeRate: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
              <TextField
                label="主軸回転数 (RPM)"
                type="number"
                value={editingTool.roughing?.rpm ?? 15000}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  roughing: { ...prev.roughing!, rpm: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
            </Grid>

            {/* 仕上げ加工条件 */}
            <Grid item xs={6}>
              <Typography variant="subtitle2" color="primary" sx={{ mt: 2 }} gutterBottom>仕上げ加工条件</Typography>
              <TextField
                label="切込み量 (mm)"
                type="number"
                value={editingTool.finishing?.depthPerPass ?? 0.5}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, depthPerPass: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
              <TextField
                label="送り速度 (mm/min)"
                type="number"
                value={editingTool.finishing?.feedRate ?? 800}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, feedRate: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
              <TextField
                label="突っ込み速度 (mm/min)"
                type="number"
                value={editingTool.finishing?.plungeRate ?? 200}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, plungeRate: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
              <TextField
                label="主軸回転数 (RPM)"
                type="number"
                value={editingTool.finishing?.rpm ?? 15000}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, rpm: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
              <TextField
                label="仕上げで残す量 (mm)"
                type="number"
                value={editingTool.finishing?.stockToLeave ?? 0.0}
                onChange={(e) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, stockToLeave: Number(e.target.value) || 0 }
                }))}
                fullWidth
                margin="dense"
                size="small"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsToolDialogOpen(false)}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!editingTool.name || !editingTool.name.trim()) {
                alert('工具名を入力してください。');
                return;
              }
              if (editingTool.id !== null) {
                setToolSettings((prev) => prev.map((tool) => (tool.id === editingTool.id ? { ...editingTool, id: editingTool.id } as ToolSetting : tool)));
              } else {
                const newTool: ToolSetting = { ...editingTool, id: Date.now() } as ToolSetting;
                setToolSettings((prev) => [...prev, newTool]);
                setSelectedToolId(newTool.id);
              }
              setIsToolDialogOpen(false);
            }}
          >保存</Button>
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
