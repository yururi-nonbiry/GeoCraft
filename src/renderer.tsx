import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

// Material-UI Imports
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
} from '@mui/material';
import { Refresh, Link, LinkOff, PlayArrow, Pause, Stop, Settings, Memory } from '@mui/icons-material';


// 型定義
type DxfSegment = { points: [[number, number, number], [number, number, number]]; color: string };
type DxfArc = { center: [number, number, number]; radius: number; start_angle: number; end_angle: number; };
type Geometry = { segments: DxfSegment[]; arcs: DxfArc[]; drill_points: DrillPoint[] };
type Toolpath = number[][];
type ToolpathSegment =
  | { type: 'line'; points: number[][] }
  | { type: 'arc'; start: number[]; end: number[]; center: number[]; direction: 'cw' | 'ccw' };
type DrillPoint = number[];

interface ThreeViewerProps {
  toolpaths: ToolpathSegment[] | null;
  geometry: Geometry | null;
  stockStlFile: string | null;
  targetStlFile: string | null;
}

const SIDE_PANEL_WIDTH = 360;

const ThreeViewer = ({ toolpaths, geometry, stockStlFile, targetStlFile }: ThreeViewerProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const stockModelRef = useRef<THREE.Object3D | null>(null);
  const targetModelRef = useRef<THREE.Object3D | null>(null);
  const toolpathGroupRef = useRef<THREE.Group | null>(null);
  const dxfObjectRef = useRef<THREE.Group | null>(null);
  const dxfArcsRef = useRef<THREE.Group | null>(null);
  const drillPointsRef = useRef<THREE.Points | null>(null);

  // 初期セットアップ
  useEffect(() => {
    if (!mountRef.current) return;
    const currentMount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f0f0f0'); // Slightly lighter background
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.set(10, 10, 15);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(renderer.domElement);

    // ライトを強化
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight1.position.set(5, 5, 10);
    scene.add(directionalLight1);
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-5, -5, -10);
    scene.add(directionalLight2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    const gridHelper = new THREE.GridHelper(20, 20);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      currentMount.removeChild(renderer.domElement);
    };
  }, []);

  // STL/OBJ 読み込み処理
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // 前のモデルを削除
    if (stockModelRef.current) scene.remove(stockModelRef.current);
    if (targetModelRef.current) scene.remove(targetModelRef.current);

    const fitCameraToObject = (object: THREE.Object3D) => {
        if (!cameraRef.current || !controlsRef.current) return;
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = cameraRef.current.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;
  
        // オブジェクトを原点中心に移動させるのではなく、全体のバウンディングボックスの中心にカメラを向ける
        // object.position.sub(center); 
  
        const camPos = new THREE.Vector3();
        camPos.copy(center);
        camPos.x -= cameraZ * 0.7;
        camPos.y -= cameraZ * 0.7;
        camPos.z += cameraZ * 0.7;
        cameraRef.current.position.copy(camPos);
        cameraRef.current.up.set(0, 0, 1);
  
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      };

    const loadStl = (filePath: string, material: THREE.Material, modelRef: React.MutableRefObject<THREE.Object3D | null>) => {
      const loader = new STLLoader();
      loader.load(filePath, (geometry) => {
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        modelRef.current = mesh;

        // 両方のモデルが読み込まれた後にカメラを調整
        const combinedBox = new THREE.Box3();
        if (stockModelRef.current) combinedBox.expandByObject(stockModelRef.current);
        if (targetModelRef.current) combinedBox.expandByObject(targetModelRef.current);
        if (!combinedBox.isEmpty()) {
            fitCameraToObject(stockModelRef.current ?? targetModelRef.current!);
        }
      });
    };

    // 材料STLの読み込み
    if (stockStlFile) {
      const stockMaterial = new THREE.MeshStandardMaterial({
        color: 0x1565c0, // Blue
        transparent: true,
        opacity: 0.3,
        wireframe: true,
      });
      loadStl(stockStlFile, stockMaterial, stockModelRef);
    }

    // 加工後形状STLの読み込み
    if (targetStlFile) {
      const targetMaterial = new THREE.MeshStandardMaterial({
        color: 0x999999, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide,
      });
      loadStl(targetStlFile, targetMaterial, targetModelRef);
    }

  }, [stockStlFile, targetStlFile]);

  // DXF/SVG描画処理
  useEffect(() => {
    if (dxfObjectRef.current && sceneRef.current) sceneRef.current.remove(dxfObjectRef.current);
    if (geometry && geometry.segments && sceneRef.current) {
      const group = new THREE.Group();
      for (const segment of geometry.segments) {
        const material = new THREE.LineBasicMaterial({ color: segment.color || 0x333333 });
        const points = segment.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        group.add(line);
      }
      sceneRef.current.add(group);
      dxfObjectRef.current = group;
    }
  }, [geometry]);

  // ドリル点描画処理
  useEffect(() => {
    if (drillPointsRef.current && sceneRef.current) sceneRef.current.remove(drillPointsRef.current);
    if (geometry && geometry.drill_points && sceneRef.current) {
      const pointsGeometry = new THREE.BufferGeometry();
      const vertices = new Float32Array(geometry.drill_points.flat());
      pointsGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      const material = new THREE.PointsMaterial({ color: 0x00ff00, size: 0.5, sizeAttenuation: false });
      const points = new THREE.Points(pointsGeometry, material);
      sceneRef.current.add(points);
      drillPointsRef.current = points;
    }
  }, [geometry]);

  // 円弧描画処理
  useEffect(() => {
    if (dxfArcsRef.current && sceneRef.current) sceneRef.current.remove(dxfArcsRef.current);
    if (geometry && geometry.arcs && sceneRef.current) {
      const group = new THREE.Group();
      const material = new THREE.LineBasicMaterial({ color: 0x3333cc }); // Arc color
      for (const arc of geometry.arcs) {
        const curve = new THREE.ArcCurve(
          arc.center[0],
          arc.center[1],
          arc.radius,
          arc.start_angle * (Math.PI / 180), // Convert to radians
          arc.end_angle * (Math.PI / 180),   // Convert to radians
          false // Clockwise
        );
        const points = curve.getPoints(50);
        const arcGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const arcLine = new THREE.Line(arcGeometry, material);
        // Arcs are usually on the XY plane, no rotation needed if Z is handled
        arcLine.position.z = arc.center[2];
        group.add(arcLine);
      }
      sceneRef.current.add(group);
      dxfArcsRef.current = group;
    }
  }, [geometry]);

  // ツールパス描画処理
  useEffect(() => {
    if (toolpathGroupRef.current && sceneRef.current) sceneRef.current.remove(toolpathGroupRef.current);
    if (toolpaths && sceneRef.current) {
      const group = new THREE.Group();
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
      const arcMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff }); // Use a different color for arcs to distinguish

      for (const segment of toolpaths) {
        if (segment.type === 'line') {
          const points = segment.points.map(p => new THREE.Vector3(p[0], p[1], p[2] || 0));
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, lineMaterial);
          group.add(line);
        } else if (segment.type === 'arc') {
          const { start, end, center, direction } = segment;
          // Note: ArcCurve needs 2D coordinates for its constructor.
          // The Z coordinate is applied to the resulting line's position.
          const curve = new THREE.ArcCurve(
            center[0],
            center[1],
            Math.hypot(start[0] - center[0], start[1] - center[1]), // radius
            Math.atan2(start[1] - center[1], start[0] - center[0]), // startAngle
            Math.atan2(end[1] - center[1], end[0] - center[0]),     // endAngle
            direction === 'cw'
          );
          const points = curve.getPoints(50);
          const arcGeometry = new THREE.BufferGeometry().setFromPoints(points);
          const arcLine = new THREE.Line(arcGeometry, arcMaterial);
          // Assuming arcs are on the XY plane, their Z is constant
          arcLine.position.z = start[2] || 0;
          group.add(arcLine);
        }
      }
      sceneRef.current.add(group);
      toolpathGroupRef.current = group;
    }
  }, [toolpaths]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
};

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

  const [activeTab, setActiveTab] = useState(0);

  const TabPanel = (props: { children?: React.ReactNode; index: number; value: number; }) => {
    const { children, value, index, ...other } = props;
    return (
      <div role="tabpanel" hidden={value !== index} {...other}>
        {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
      </div>
    );
  }

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
                  <Typography variant="h6" gutterBottom>Tool Settings</Typography>
                  <TextField label="Tool Diameter (mm)" type="number" value={toolDiameter} onChange={(e) => setToolDiameter(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>2.5D 加工 (DXF/SVG)</Typography>
                  <TextField label="ステップオーバー (%)" type="number" value={stepover * 100} onChange={(e) => setStepover(parseFloat(e.target.value) / 100)} fullWidth margin="normal" size="small" />
                  <FormControl fullWidth margin="normal" size="small">
                    <InputLabel>輪郭方向</InputLabel>
                    <Select value={contourSide} label="輪郭方向" onChange={(e) => setContourSide(e.target.value)}>
                      <MenuItem value="outer">外側</MenuItem>
                      <MenuItem value="inner">内側</MenuItem>
                    </Select>
                  </FormControl>
                  <Button variant="contained" onClick={handleGenerateContour} sx={{ mr: 1 }}>輪郭パス生成</Button>
                  <Button variant="contained" onClick={handleGeneratePocket}>ポケットパス生成</Button>
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>3D 加工 (STL)</Typography>
                  <Box sx={{ mb: 2 }}>
                    <Button variant="outlined" onClick={handleSelectStockStl} fullWidth>材料STLを選択</Button>
                    {stockStlFile && <Typography variant="caption" display="block" sx={{mt:1, textAlign: 'center'}}>{stockStlFile.split('\\').pop()}</Typography>}
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Button variant="outlined" onClick={handleSelectTargetStl} fullWidth>加工後形状STLを選択</Button>
                    {targetStlFile && <Typography variant="caption" display="block" sx={{mt:1, textAlign: 'center'}}>{targetStlFile.split('\\').pop()}</Typography>}
                  </Box>
                  <TextField label="スライス厚 (mm)" type="number" value={sliceHeight} onChange={(e) => setSliceHeight(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                  <Button variant="contained" onClick={handleGenerate3dPath} fullWidth>3D荒加工パス生成</Button>
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>ドリル加工</Typography>
                  <TextField label="R点 (切り込み開始高さ)" type="number" value={retractZ} onChange={(e) => setRetractZ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                  <TextField label="ペック量 (Q)" type="number" value={peckQ} onChange={(e) => setPeckQ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                  <Button variant="contained" onClick={handleGenerateDrillGcode}>ドリルGコード生成</Button>
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Gコード保存</Typography>
                  <TextField label="送り速度 (mm/min)" type="number" value={feedRate} onChange={(e) => setFeedRate(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                  <Button variant="contained" onClick={handleSaveGcode}>Gコード保存</Button>
                </Paper>
              </TabPanel>
              <TabPanel value={activeTab} index={1}>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Machine Settings</Typography>
                  <TextField label="Safe Z (mm)" type="number" value={safeZ} onChange={(e) => setSafeZ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                  <TextField label="Step Down (mm)" type="number" value={stepDown} onChange={(e) => setStepDown(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                  <TextField label="Retract Z (mm)" type="number" value={retractZ} onChange={(e) => setRetractZ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                  <TextField label="Peck Amount (Q)" type="number" value={peckQ} onChange={(e) => setPeckQ(parseFloat(e.target.value))} fullWidth margin="normal" size="small" />
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>CNC 接続</Typography>
                  <FormControl fullWidth margin="normal" size="small" disabled={isConnected}>
                    <InputLabel>ポート</InputLabel>
                    <Select value={selectedPort} label="ポート" onChange={(e) => setSelectedPort(e.target.value)}>
                      {serialPorts.map(port => <MenuItem key={port.path} value={port.path}>{port.path}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField label="ボーレート" type="number" value={baudRate} onChange={(e) => setBaudRate(parseInt(e.target.value))} fullWidth margin="normal" size="small" disabled={isConnected} />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={handleRefreshPorts} disabled={isConnected} startIcon={<Refresh />}>更新</Button>
                    {!isConnected ? (
                      <Button variant="contained" onClick={handleConnect} startIcon={<Link />}>接続</Button>
                    ) : (
                      <Button variant="contained" color="secondary" onClick={handleDisconnect} startIcon={<LinkOff />}>切断</Button>
                    )}
                  </Box>
                  <TextareaAutosize
                    readOnly
                    minRows={5}
                    value={consoleLog.join('\n')}
                    style={{ width: '100%', marginTop: '1rem', backgroundColor: '#222', color: '#0f0', fontFamily: 'monospace', padding: '8px' }}
                  />
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>G-Code 送信</Typography>
                  <TextField
                    multiline
                    rows={8}
                    fullWidth
                    variant="outlined"
                    value={gcode}
                    onChange={(e) => setGcode(e.target.value)}
                    placeholder="ここにG-codeを貼り付け..."
                    sx={{ mb: 1, fontFamily: 'monospace' }}
                  />
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                    <Button variant="contained" onClick={handleSendGcode} disabled={!isConnected || gcodeStatus !== 'idle'} startIcon={<PlayArrow />}>送信</Button>
                    <Button variant="outlined" onClick={handlePauseGcode} disabled={gcodeStatus !== 'sending'} startIcon={<Pause />}>一時停止</Button>
                    <Button variant="outlined" onClick={handleResumeGcode} disabled={gcodeStatus !== 'paused'} startIcon={<PlayArrow />}>再開</Button>
                    <Button variant="outlined" color="secondary" onClick={handleStopGcode} disabled={gcodeStatus === 'idle'} startIcon={<Stop />}>停止</Button>
                  </Box>
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="body2">状態: {gcodeStatus}</Typography>
                    <LinearProgress variant="determinate" value={(gcodeProgress.total > 0 ? (gcodeProgress.sent / gcodeProgress.total) * 100 : 0)} />
                    <Typography variant="body2" align="right">{gcodeProgress.sent}/{gcodeProgress.total}</Typography>
                  </Box>
                </Paper>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>手動操作 (Jog)</Typography>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2">マシン状態: {machinePosition.status}</Typography>
                    <Typography variant="body2">WPos: X:{machinePosition.wpos.x.toFixed(3)} Y:{machinePosition.wpos.y.toFixed(3)} Z:{machinePosition.wpos.z.toFixed(3)}</Typography>
                    <Typography variant="body2">MPos: X:{machinePosition.mpos.x.toFixed(3)} Y:{machinePosition.mpos.y.toFixed(3)} Z:{machinePosition.mpos.z.toFixed(3)}</Typography>
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography component="span" sx={{ mr: 1 }}>移動量(mm):</Typography>
                    {[0.1, 1, 10, 100].map(step => (
                      <Button key={step} size="small" variant={jogStep === step ? 'contained' : 'outlined'} onClick={() => setJogStep(step)} sx={{ mr: 1 }}>
                        {step}
                      </Button>
                    ))}
                  </Box>
                  <Grid container spacing={1} alignItems="center" justifyContent="center">
                    <Grid item xs={4} />
                    <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => handleJog('Y', 1)}>Y+</Button></Grid>
                    <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => handleJog('Z', 1)}>Z+</Button></Grid>
                    <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => handleJog('X', -1)}>X-</Button></Grid>
                    <Grid item xs={4}><Button fullWidth variant="contained" color="secondary" onClick={handleSetZero} startIcon={<Settings />}>原点</Button></Grid>
                    <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => handleJog('X', 1)}>X+</Button></Grid>
                    <Grid item xs={4} />
                    <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => handleJog('Y', -1)}>Y-</Button></Grid>
                    <Grid item xs={4}><Button fullWidth variant="outlined" onClick={() => handleJog('Z', -1)}>Z-</Button></Grid>
                  </Grid>
                </Paper>
              </TabPanel>
            </Box>
          </Grid>
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
