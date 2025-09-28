import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

// Preloadスクリプト経由で公開されたAPIの型定義
declare global {
  interface Window {
    electronAPI: {
      onFileOpen: (callback: (filePath: string) => void) => () => void;
      generateContourPath: (toolDiameter: number, geometry: any) => Promise<any>;
      parseDxfFile: (filePath: string) => Promise<any>;
      parseSvgFile: (filePath: string) => Promise<any>;
      generateGcode: (params: any) => Promise<any>;
      generatePocketPath: (params: any) => Promise<any>;
      generateDrillGcode: (params: any) => Promise<any>;
      generate3dPath: (params: any) => Promise<any>;
    };
  }
}

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
  fileToLoad: string | null;
}

const ThreeViewer = ({ toolpaths, geometry, fileToLoad }: ThreeViewerProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const toolpathGroupRef = useRef<THREE.Group | null>(null);
  const dxfObjectRef = useRef<THREE.Group | null>(null);
  const dxfArcsRef = useRef<THREE.Group | null>(null);
  const drillPointsRef = useRef<THREE.Points | null>(null);

  // 初期セットアップ
  useEffect(() => {
    if (!mountRef.current) return;
    const currentMount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e0e0e0');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.set(10, 10, 15);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(renderer.domElement);

    // ライトを強化
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight1.position.set(5, 5, 10);
    scene.add(directionalLight1);
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
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

  // ファイル読み込み/クリア処理
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    if (modelRef.current) scene.remove(modelRef.current);
    if (toolpathGroupRef.current) scene.remove(toolpathGroupRef.current);
    if (dxfObjectRef.current) scene.remove(dxfObjectRef.current);
    if (drillPointsRef.current) scene.remove(drillPointsRef.current);

    const fitCameraToObject = (object: THREE.Object3D) => {
      if (!cameraRef.current || !controlsRef.current) return;
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = cameraRef.current.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5;

      object.position.sub(center);
      scene.add(object);
      modelRef.current = object;

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

    if (fileToLoad && fileToLoad.toLowerCase().endsWith('.stl')) {
      const loader = new STLLoader();
      loader.load(fileToLoad, (geometry) => {
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
          color: 0x999999, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        fitCameraToObject(mesh);
      });
    } else if (fileToLoad && fileToLoad.toLowerCase().endsWith('.obj')) {
      const loader = new OBJLoader();
      loader.load(fileToLoad, (group) => {
        const defaultMaterial = new THREE.MeshStandardMaterial({
          color: 0x999999, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide,
        });
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const geometry = child.geometry;
            if (geometry instanceof THREE.BufferGeometry) {
              geometry.computeVertexNormals();
            }
            child.material = defaultMaterial;
          }
        });
        group.rotation.x = -Math.PI / 2;
        fitCameraToObject(group);
      });
    }
  }, [fileToLoad]);

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

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

const App = () => {
  // states
  const [toolDiameter, setToolDiameter] = useState(3.0);
  const [stepover, setStepover] = useState(0.5);
  const [sliceHeight, setSliceHeight] = useState(1.0);
  const [toolpaths, setToolpaths] = useState<ToolpathSegment[] | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [fileToLoad, setFileToLoad] = useState<string | null>(null);
  const [feedRate, setFeedRate] = useState(100);
  const [safeZ, setSafeZ] = useState(5.0);
  const [stepDown, setStepDown] = useState(-2.0);
  const [retractZ, setRetractZ] = useState(2.0);
  const [peckQ, setPeckQ] = useState(1.0);

  const [contourSide, setContourSide] = useState('outer'); // 'outer' or 'inner'

  // File open listener
  useEffect(() => {
    const removeListener = window.electronAPI.onFileOpen((filePath) => {
      setToolpaths(null);
      setGeometry(null);
      setFileToLoad(filePath); // ファイルパスを先にセット

      const extension = filePath.split('.').pop()?.toLowerCase();
      if (extension === 'dxf') {
        window.electronAPI.parseDxfFile(filePath).then(result => {
          if (result.status === 'success') {
            setGeometry({ segments: result.segments, arcs: result.arcs, drill_points: result.drill_points });
          } else {
            alert(`DXF解析エラー: ${result.message}`);
          }
        }).catch(error => {
          alert(`DXF解析に失敗しました: ${error}`);
        });
      } else if (extension === 'svg') {
        window.electronAPI.parseSvgFile(filePath).then(result => {
          if (result.status === 'success') {
            // SVG parser currently only returns segments
            setGeometry({ segments: result.segments, arcs: [], drill_points: result.drill_points });
          } else {
            alert(`SVG解析エラー: ${result.message}`);
          }
        }).catch(error => {
          alert(`SVG解析に失敗しました: ${error}`);
        });
      }
    });
    return () => { removeListener(); };
  }, []);

  // Handlers
  const getConnectedGeometries = () => {
    if (!geometry || !geometry.segments || geometry.segments.length === 0) return [];

    const pointToKey = (p: [number, number, number]) => p.map(v => v.toFixed(4)).join(',');
    const remaining = new Set(geometry.segments);
    const geometries: Array<Array<[number, number, number]>> = [];

    while (remaining.size > 0) {
        const path: Array<[number, number, number]> = [];
        const startSeg = remaining.values().next().value;
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

                // --- Forward connection ---
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
                // --- Backward connection ---
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
    if (geometries.length === 0 || !geometry || !geometry.arcs) {
      alert('ツールパスを生成するための図形が読み込まれていません。DXF/SVGファイルを開いてください。');
      return;
    }
    const vertices = geometries[0];
    try {
      // Step 1: Generate the linear toolpath
      const linearResult = await window.electronAPI.generateContourPath(toolDiameter, vertices, contourSide);
      if (linearResult.status !== 'success') {
        alert(`初期パス生成エラー: ${linearResult.message}`);
        return;
      }

      // Step 2: Fit arcs to the linear toolpath
      const fittedResult = await window.electronAPI.fitArcsToToolpath(linearResult.toolpath, geometry.arcs);
      if (fittedResult.status === 'success') {
        setToolpaths(fittedResult.toolpath_segments);
      } else {
        alert(`円弧フィットエラー: ${fittedResult.message}`);
        // As a fallback, show the linear path
        setToolpaths([{ type: 'line', points: linearResult.toolpath }]);
      }
    } catch (error) {
      alert(`パス生成に失敗しました: ${error}`);
    }
  };

  const handleGeneratePocket = async () => {
    const geometries = getConnectedGeometries();
    if (geometries.length === 0) {
      alert('ツールパスを生成するための図形が読み込まれていません。DXF/SVGファイルを開いてください。');
      return;
    }
    const vertices = geometries[0];
    try {
      const params = { geometry: vertices, toolDiameter, stepover: toolDiameter * stepover };
      const result = await window.electronAPI.generatePocketPath(params);
      if (result.status === 'success') {
        // For now, wrap pocket paths as simple line segments
        const segments: ToolpathSegment[] = result.toolpaths.map((path: number[][]) => ({ type: 'line', points: path }));
        setToolpaths(segments);
      } else {
        alert(`パス生成エラー: ${result.message}`);
      }
    } catch (error) {
      alert(`パス生成に失敗しました: ${error}`);
    }
  };

  const handleGenerate3dPath = async () => {
    if (!fileToLoad || !fileToLoad.toLowerCase().endsWith('.stl')) {
      alert('3D加工パスを生成するには、STLファイルを開いてください。');
      return;
    }
    try {
      const params = { filePath: fileToLoad, sliceHeight, toolDiameter, stepoverRatio: stepover };
      const result = await window.electronAPI.generate3dPath(params);
      if (result.status === 'success') {
        setToolpaths(result.toolpaths);
      } else {
        alert(`3Dパス生成エラー: ${result.message}`);
      }
    } catch (error) {
      alert(`3Dパス生成に失敗しました: ${error}`);
    }
  };

  const handleGenerateDrillGcode = async () => {
    if (!geometry || !geometry.drill_points || geometry.drill_points.length === 0) {
      alert('Gコードを生成するためのドリル点がありません。');
      return;
    }
    try {
      const params = { drillPoints: geometry.drill_points, safeZ, retractZ, stepDown, peckQ };
      const result = await window.electronAPI.generateDrillGcode(params);
      if (result.status === 'success') {
        alert(`ドリルGコードを保存しました: ${result.filePath}`);
      } else if (result.status !== 'canceled') {
        alert(`Gコードの保存に失敗しました: ${result.message}`);
      }
    } catch (error) {
      alert(`Gコードの保存に失敗しました: ${error}`);
    }
  };

  const handleSaveGcode = async () => {
    if (!toolpaths || toolpaths.length === 0) {
      alert('保存するツールパスがありません。');
      return;
    }
    try {
      // Convert old toolpath format to new ToolpathSegment format
      const segments: ToolpathSegment[] = toolpaths.map(path => ({ type: 'line', points: path }));
      const params = { toolpaths: segments, feedRate, safeZ, stepDown };
      const result = await window.electronAPI.generateGcode(params);
      if (result.status === 'success') {
        alert(`Gコードを保存しました: ${result.filePath}`);
      } else if (result.status !== 'canceled') {
        alert(`Gコードの保存に失敗しました: ${result.message}`);
      }
    } catch (error) {
      alert(`Gコードの保存に失敗しました: ${error}`);
    }
  };

  const handleArcTest = async () => {
    // Create a dummy toolpath: a square with rounded corners
    const r = 5; // radius
    const testPath: ToolpathSegment[] = [
      { type: 'line', points: [[r, 0, 0], [50 - r, 0, 0]] },
      { type: 'arc', start: [50 - r, 0, 0], end: [50, r, 0], center: [50 - r, r, 0], direction: 'ccw' },
      { type: 'line', points: [[50, r, 0], [50, 50 - r, 0]] },
      { type: 'arc', start: [50, 50 - r, 0], end: [50 - r, 50, 0], center: [50 - r, 50 - r, 0], direction: 'ccw' },
      { type: 'line', points: [[50 - r, 50, 0], [r, 50, 0]] },
      { type: 'arc', start: [r, 50, 0], end: [0, 50 - r, 0], center: [r, 50 - r, 0], direction: 'ccw' },
      { type: 'line', points: [[0, 50 - r, 0], [0, r, 0]] },
      { type: 'arc', start: [0, r, 0], end: [r, 0, 0], center: [r, r, 0], direction: 'ccw' },
    ];
    try {
      const params = { toolpaths: testPath, feedRate, safeZ, stepDown };
      const result = await window.electronAPI.generateGcode(params);
      if (result.status === 'success') {
        alert(`テストGコードを保存しました: ${result.filePath}`);
      } else if (result.status !== 'canceled') {
        alert(`Gコードの保存に失敗しました: ${result.message}`);
      }
    } catch (error) {
      alert(`Gコードの保存に失敗しました: ${error}`);
    }
  }

  // Styles
  const mainStyle: React.CSSProperties = { display: 'flex', height: '100vh', fontFamily: 'sans-serif' };
  const viewerStyle: React.CSSProperties = { flex: 3, borderRight: '1px solid #ccc' };
  const panelStyle: React.CSSProperties = { flex: 1, padding: '1rem', overflowY: 'auto' };
  const inputGroupStyle: React.CSSProperties = { marginBottom: '1rem' };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.25rem' };

  return (
    <div style={mainStyle}>
      <div style={viewerStyle}>
        <ThreeViewer toolpaths={toolpaths} geometry={geometry} fileToLoad={fileToLoad} />
      </div>
      <div style={panelStyle}>
        <h2>設定パネル</h2>
        <div style={inputGroupStyle}>
          <h3>加工設定</h3>
          <label style={labelStyle}>工具径 (mm)</label>
          <input type="number" value={toolDiameter} onChange={(e) => setToolDiameter(parseFloat(e.target.value))} step="0.1"/>
          <label style={labelStyle}>安全高さ (Z)</label>
          <input type="number" value={safeZ} onChange={(e) => setSafeZ(parseFloat(e.target.value))} step="0.1" />
          <label style={labelStyle}>切り込み深さ (Z)</label>
          <input type="number" value={stepDown} onChange={(e) => setStepDown(parseFloat(e.target.value))} step="0.1" />
        </div>
        <hr />
        <div style={inputGroupStyle}>
          <h3>2.5D 加工 (DXF/SVG)</h3>
          <label style={labelStyle}>ステップオーバー (%)</label>
          <input type="number" value={stepover * 100} onChange={(e) => setStepover(parseFloat(e.target.value) / 100)} step="1" min="1" max="100" />
          <label style={labelStyle}>輪郭方向</label>
          <select value={contourSide} onChange={(e) => setContourSide(e.target.value)}>
            <option value="outer">外側</option>
            <option value="inner">内側</option>
          </select>
          <button onClick={handleGenerateContour}>輪郭パス生成</button>
          <button onClick={handleGeneratePocket}>ポケットパス生成</button>
        </div>
        <div style={inputGroupStyle}>
          <h3>3D 加工 (STL)</h3>
          <label style={labelStyle}>スライス厚 (mm)</label>
          <input type="number" value={sliceHeight} onChange={(e) => setSliceHeight(parseFloat(e.target.value))} step="0.1" />
          <button onClick={handleGenerate3dPath}>3Dパス生成</button>
        </div>
        <hr />
        <div style={inputGroupStyle}>
          <h3>ドリル加工</h3>
          <label style={labelStyle}>R点 (切り込み開始高さ)</label>
          <input type="number" value={retractZ} onChange={(e) => setRetractZ(parseFloat(e.target.value))} step="0.1" />
          <label style={labelStyle}>ペック量 (Q)</label>
          <input type="number" value={peckQ} onChange={(e) => setPeckQ(parseFloat(e.target.value))} step="0.1" />
          <button onClick={handleGenerateDrillGcode}>ドリルGコード生成</button>
        </div>
        <hr />
        <div style={inputGroupStyle}>
          <h3>Gコード保存</h3>
          <label style={labelStyle}>送り速度 (mm/min)</label>
          <input type="number" value={feedRate} onChange={(e) => setFeedRate(parseFloat(e.target.value))} />
          <button onClick={handleSaveGcode}>輪郭/ポケットGコードを保存</button>
          <button onClick={handleArcTest}>円弧Gコードテスト</button>
        </div>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
