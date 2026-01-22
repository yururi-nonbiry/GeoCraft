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
  Box,
} from '@mui/material';
import { Memory } from '@mui/icons-material';

import ThreeViewer from './components/ThreeViewer';
import ControlPanel from './components/ControlPanel';
import { Geometry, ToolpathSegment, Toolpath } from './types';

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

const App = () => {
  // states
  const [toolDiameter, setToolDiameter] = useState(3.0);
  const [stepover, setStepover] = useState(0.5);
  const [sliceHeight, setSliceHeight] = useState(1.0);
  const [toolpaths, setToolpaths] = useState<ToolpathSegment[] | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [stockStlFile, setStockStlFile] = useState<string | null>(null);
  const [targetStlFile, setTargetStlFile] = useState<string | null>(null);
  const [feedRate, setFeedRate] = useState(100);
  const [safeZ, setSafeZ] = useState(5.0);
  const [stepDown, setStepDown] = useState(-2.0);
  const [retractZ, setRetractZ] = useState(2.0);
  const [peckQ, setPeckQ] = useState(1.0);
  const [contourSide, setContourSide] = useState('outer');

  // CNC Connection State
  const [serialPorts, setSerialPorts] = useState<any[]>([]);
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

  // --- CNC Connection Logic ---
  const handleRefreshPorts = () => {
    window.electronAPI.listSerialPorts().then(result => {
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
    const removeDataListener = window.electronAPI.onSerialData((data) => setConsoleLog(prev => [...prev, `> ${data}`]));
    const removeClosedListener = window.electronAPI.onSerialClosed(() => {
      setIsConnected(false);
      setConsoleLog(prev => [...prev, '--- 接続が切断されました ---']);
    });
    const removeGcodeProgressListener = window.electronAPI.onGcodeProgress(progress => {
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
    const removeStatusListener = window.electronAPI.onStatus(status => setMachinePosition(status));
    const removeFileOpenListener = window.electronAPI.onFileOpen((filePath) => {
      setToolpaths(null);
      setGeometry(null);
      setStockStlFile(null);
      setTargetStlFile(null);
      const extension = filePath.split('.').pop()?.toLowerCase();
      if (extension === 'dxf') {
        window.electronAPI.parseDxfFile(filePath).then(result => {
          if (result.status === 'success') setGeometry({ segments: result.segments, arcs: result.arcs, drill_points: result.drill_points });
          else alert(`DXF解析エラー: ${result.message}`);
        }).catch(error => alert(`DXF解析に失敗しました: ${error}`));
      } else if (extension === 'svg') {
        window.electronAPI.parseSvgFile(filePath).then(result => {
          if (result.status === 'success') setGeometry({ segments: result.segments, arcs: [], drill_points: result.drill_points });
          else alert(`SVG解析エラー: ${result.message}`);
        }).catch(error => alert(`SVG解析に失敗しました: ${error}`));
      }
    });

    return () => {
      removeDataListener();
      removeClosedListener();
      removeGcodeProgressListener();
      removeStatusListener();
      removeFileOpenListener();
    };
  }, []);

  const handleConnect = async () => {
    if (!selectedPort) return alert('ポートを選択してください。');
    const result = await window.electronAPI.connectSerial(selectedPort, baudRate);
    if (result.status === 'success') {
      setIsConnected(true);
      setConsoleLog(prev => [...prev, `--- ${selectedPort}に接続しました ---`]);
    } else {
      alert(`接続エラー: ${result.message}`);
    }
  };

  const handleDisconnect = async () => {
    const result = await window.electronAPI.disconnectSerial();
    if (result.status !== 'success') alert(`切断エラー: ${result.message}`);
  };

  const handleJog = (axis: 'X' | 'Y' | 'Z', direction: number) => {
    if (isConnected) window.electronAPI.jog(axis, direction, jogStep);
  };

  const handleSetZero = () => {
    if (isConnected && confirm('現在のワーク座標をすべて0に設定します。よろしいですか？')) {
      window.electronAPI.setZero();
    }
  };

  const handleSendGcode = () => {
    if (gcode.trim() === '') return alert('送信するG-codeがありません。');
    window.electronAPI.sendGcode(gcode);
    setGcodeStatus('sending');
  };

  const handlePauseGcode = () => window.electronAPI.pauseGcode();
  const handleResumeGcode = () => window.electronAPI.resumeGcode();
  const handleStopGcode = () => window.electronAPI.stopGcode();

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
      const linearResult = await window.electronAPI.generateContourPath(toolDiameter, vertices, contourSide);
      if (linearResult.status !== 'success') return alert(`初期パス生成エラー: ${linearResult.message}`);
      const fittedResult = await window.electronAPI.fitArcsToToolpath(linearResult.toolpath, geometry.arcs);
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
      const params = { geometry: vertices, toolDiameter, stepover: toolDiameter * stepover };
      const result = await window.electronAPI.generatePocketPath(params);
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
    const result = await window.electronAPI.openFile('stl');
    if (result.status === 'success') {
      setStockStlFile(result.filePath);
      setToolpaths(null); // 新しいモデルが読み込まれたらツールパスをクリア
    }
  };

  const handleSelectTargetStl = async () => {
    const result = await window.electronAPI.openFile('stl');
    if (result.status === 'success') {
      setTargetStlFile(result.filePath);
      setToolpaths(null); // 新しいモデルが読み込まれたらツールパスをクリア
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
      const result = await window.electronAPI.generate3dRoughingPath(params);
      if (result.status === 'success') setToolpaths(result.toolpaths);
      else alert(`3Dパス生成エラー: ${result.message}`);
    } catch (error) {
      alert(`3Dパス生成に失敗しました: ${error}`);
    }
  };

  const handleGenerateDrillGcode = async () => {
    if (!geometry || !geometry.drill_points || geometry.drill_points.length === 0) return alert('Gコードを生成するためのドリル点がありません。');
    try {
      const params = { drillPoints: geometry.drill_points, feedRate, safeZ, retractZ, stepDown, peckQ };
      const result = await window.electronAPI.generateDrillGcode(params);
      if (result.status === 'success') alert(`ドリルGコードを保存しました: ${result.filePath}`);
      else if (result.status !== 'canceled') alert(`Gコードの保存に失敗しました: ${result.message}`);
    } catch (error) {
      alert(`Gコードの保存に失敗しました: ${error}`);
    }
  };

  const handleSaveGcode = async () => {
    if (!toolpaths || toolpaths.length === 0) return alert('保存するツールパスがありません。');
    try {
      const params = { toolpaths: toolpaths, feedRate, safeZ, stepDown, retractZ };
      const result = await window.electronAPI.generateGcode(params);
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
            retractZ={retractZ}
            setRetractZ={setRetractZ}
            peckQ={peckQ}
            setPeckQ={setPeckQ}
            handleGenerateDrillGcode={handleGenerateDrillGcode}
            feedRate={feedRate}
            setFeedRate={setFeedRate}
            handleSaveGcode={handleSaveGcode}
            safeZ={safeZ}
            setSafeZ={setSafeZ}
            stepDown={stepDown}
            setStepDown={setStepDown}
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
          />
        </Grid>
      </Box>
    </ThemeProvider>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
