import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, Settings, Memory } from '@mui/icons-material';

import { api } from './api';

import ThreeViewer from './components/ThreeViewer';
import ControlPanel from './components/ControlPanel';
import { Geometry, ToolpathSegment, Toolpath, SerialPortInfo, MachineSetting, EditableMachineSetting, ToolSetting, EditableToolSetting } from './types';

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
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [stockStlFile, setStockStlFile] = useState<string | null>(null);
  const [targetStlFile, setTargetStlFile] = useState<string | null>(null);
  const [feedRate, setFeedRate] = useState<number>(DEFAULT_MATERIALS[0]?.feedRate ?? 100);
  const [contourSide, setContourSide] = useState('outer');
  const [materialSettings, setMaterialSettings] = useState<MaterialSetting[]>(DEFAULT_MATERIALS);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | ''>(DEFAULT_MATERIALS[0]?.id ?? '');
  const [toolSettings, setToolSettings] = useState<ToolSetting[]>(DEFAULT_TOOLS);
  const [selectedToolId, setSelectedToolId] = useState<number | ''>(DEFAULT_TOOLS[0]?.id ?? '');
  const [processType, setProcessType] = useState<'roughing' | 'finishing'>('roughing');
  const [stockToLeave, setStockToLeave] = useState<number>(0.0);
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

  const updateMachineSetting = <K extends keyof Omit<MachineSetting, 'id'>>(key: K, value: MachineSetting[K]) => {
    setMachineSettings((prev) =>
      prev.map((m) => (m.id === selectedMachineId ? { ...m, [key]: value } : m))
    );
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
      setTargetStlFile(null);
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

  const getConnectedGeometries = () => {
    if (!geometry || !geometry.segments || geometry.segments.length === 0) return [];
    const pointToKey = (p: [number, number, number]) => p.map(v => v.toFixed(4)).join(',');
    const remaining = new Set(geometry.segments);
    const geometries: Array<Array<[number, number, number]>> = [];
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

  const handleGenerateContour = async () => {
    const geometries = getConnectedGeometries();
    if (geometries.length === 0 || !geometry || !geometry.arcs) return alert('ツールパスを生成するための図形が読み込まれていません。');
    const vertices = geometries[0];
    try {
      const linearResult = await api.generateContourPath(toolDiameter, vertices, contourSide, processType === 'roughing' ? stockToLeave : 0.0);
      if (linearResult.status !== 'success') return alert(`初期パス生成エラー: ${linearResult.message}`);
      const fittedResult = await api.fitArcsToToolpath(linearResult.toolpath, geometry.arcs);
      if (fittedResult.status === 'success') {
        setToolpaths(fittedResult.toolpath_segments);
      } else {
        alert(`円弧フィットエラー: ${fittedResult.message}`);
        setToolpaths([{ type: 'line', points: linearResult.toolpath }]);
      }
    } catch (error) {
      alert(`パス生成に失敗しました: ${error}`);
    }
  };

  const handleGeneratePocket = async () => {
    const geometries = getConnectedGeometries();
    if (geometries.length === 0) return alert('ツールパスを生成するための図形が読み込まれていません。');
    const vertices = geometries[0];
    try {
      const params = { geometry: vertices, toolDiameter, stepover: toolDiameter * stepover, stockToLeave: processType === 'roughing' ? stockToLeave : 0.0 };
      const result = await api.generatePocketPath(params);
      if (result.status === 'success') {
        const segments: ToolpathSegment[] = result.toolpaths.map((path: number[][]) => ({ type: 'line', points: path }));
        setToolpaths(segments);
      } else {
        alert(`パス生成エラー: ${result.message}`);
      }
    } catch (error) {
      alert(`パス生成に失敗しました: ${error}`);
    }
  };

  const handleSelectStockStl = async () => {
    const result = await api.openFile('stl');
    if (result.status === 'success') {
      setStockStlFile(result.filePath);
      setToolpaths(null);
    }
  };

  const handleSelectTargetStl = async () => {
    const result = await api.openFile('stl');
    if (result.status === 'success') {
      setTargetStlFile(result.filePath);
      setToolpaths(null);
    }
  };

  const handleGenerate3dPath = async () => {
    if (!stockStlFile || !targetStlFile) return alert('3D加工パスを生成するには、材料と加工後形状の両方のSTLファイルを開いてください。');
    try {
      const params = {
        stockPath: stockStlFile,
        targetPath: targetStlFile,
        sliceHeight,
        toolDiameter,
        stepoverRatio: stepover
      };
      const result = await api.generate3dRoughingPath(params);
      if (result.status === 'success') setToolpaths(result.toolpaths);
      else alert(`3Dパス生成エラー: ${result.message}`);
    } catch (error) {
      alert(`3Dパス生成に失敗しました: ${error}`);
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
            <IconButton color="inherit" onClick={() => setIsSettingsOpen(true)} aria-label="open settings">
              <Settings />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Grid container sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <Grid item sx={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
            <ThreeViewer toolpaths={toolpaths} geometry={geometry} stockStlFile={stockStlFile} targetStlFile={targetStlFile} />
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
            targetStlFile={targetStlFile}
            handleSelectStockStl={handleSelectStockStl}
            handleSelectTargetStl={handleSelectTargetStl}
            sliceHeight={sliceHeight}
            setSliceHeight={setSliceHeight}
            handleGenerate3dPath={handleGenerate3dPath}
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
