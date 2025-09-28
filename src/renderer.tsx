import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

// Preloadスクリプト経由で公開されたAPIの型定義
declare global {
  interface Window {
    electronAPI: {
      onFileOpen: (callback: (filePath: string) => void) => () => void;
      generateContourPath: (toolDiameter: number, geometry: any) => Promise<any>;
      parseDxfFile: (filePath: string) => Promise<any>;
      generateGcode: (params: any) => Promise<any>;
    };
  }
}

// 型定義
type DxfSegment = [[number, number, number], [number, number, number]];

interface ThreeViewerProps {
  toolpath: number[][] | null;
  dxfSegments: DxfSegment[] | null;
  fileToLoad: string | null;
}

const ThreeViewer = ({ toolpath, dxfSegments, fileToLoad }: ThreeViewerProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const toolpathRef = useRef<THREE.Line | null>(null);
  const dxfObjectRef = useRef<THREE.Group | null>(null);

  // 初期セットアップ
  useEffect(() => {
    if (!mountRef.current) return;
    const currentMount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e0e0e0');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const gridHelper = new THREE.GridHelper(20, 20);
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
      if (!mountRef.current) return;
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

  // ファイル読み込み処理
  useEffect(() => {
    if (!fileToLoad || !sceneRef.current) return;
    const scene = sceneRef.current;

    if (modelRef.current) scene.remove(modelRef.current);
    if (toolpathRef.current) scene.remove(toolpathRef.current);
    if (dxfObjectRef.current) scene.remove(dxfObjectRef.current);

    if (fileToLoad.toLowerCase().endsWith('.stl')) {
      const loader = new STLLoader();
      loader.load(fileToLoad, (geometry) => {
        const material = new THREE.MeshStandardMaterial({ color: 0x007bff, transparent: true, opacity: 0.5 });
        const mesh = new THREE.Mesh(geometry, material);
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        const center = box.getCenter(new THREE.Vector3());
        mesh.position.sub(center);
        scene.add(mesh);
        modelRef.current = mesh;
      });
    }
  }, [fileToLoad]);

  // DXF描画処理
  useEffect(() => {
    if (dxfObjectRef.current && sceneRef.current) {
      sceneRef.current.remove(dxfObjectRef.current);
    }
    if (dxfSegments && sceneRef.current) {
      const group = new THREE.Group();
      const material = new THREE.LineBasicMaterial({ color: 0x333333 });
      for (const segment of dxfSegments) {
        const points = segment.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        group.add(line);
      }
      sceneRef.current.add(group);
      dxfObjectRef.current = group;
    }
  }, [dxfSegments]);

  // ツールパス描画処理
  useEffect(() => {
    if (toolpathRef.current && sceneRef.current) {
      sceneRef.current.remove(toolpathRef.current);
    }
    if (toolpath && sceneRef.current) {
      const points = toolpath.map(p => new THREE.Vector3(p[0], p[1], 0));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
      const line = new THREE.Line(geometry, material);
      sceneRef.current.add(line);
      toolpathRef.current = line;
    }
  }, [toolpath]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

const App = () => {
  // states
  const [toolDiameter, setToolDiameter] = useState(1.0);
  const [toolpath, setToolpath] = useState<number[][] | null>(null);
  const [dxfSegments, setDxfSegments] = useState<DxfSegment[] | null>(null);
  const [fileToLoad, setFileToLoad] = useState<string | null>(null);
  const [feedRate, setFeedRate] = useState(100);
  const [safeZ, setSafeZ] = useState(5.0);
  const [stepDown, setStepDown] = useState(-1.0);

  // File open listener
  useEffect(() => {
    const removeListener = window.electronAPI.onFileOpen((filePath) => {
      setToolpath(null);
      setDxfSegments(null);
      setFileToLoad(null);

      const extension = filePath.split('.').pop()?.toLowerCase();
      if (extension === 'stl') {
        setFileToLoad(filePath);
      } else if (extension === 'dxf') {
        window.electronAPI.parseDxfFile(filePath).then(result => {
          if (result.status === 'success') {
            setDxfSegments(result.segments);
          } else {
            alert(`DXF解析エラー: ${result.message}`);
          }
        }).catch(error => {
          alert(`DXF解析に失敗しました: ${error}`);
        });
      }
    });
    return () => { removeListener(); };
  }, []);

  // Handlers
  const handleGenerateContour = async () => {
    if (!dxfSegments) {
      alert('ツールパスを生成するための図形が読み込まれていません。DXFファイルを開いてください。');
      return;
    }
    const vertices = dxfSegments.map(segment => segment[0]);
    if (vertices.length > 0) {
      vertices.push(dxfSegments[dxfSegments.length - 1][1]);
    }
    try {
      const result = await window.electronAPI.generateContourPath(toolDiameter, vertices);
      if (result.status === 'success') {
        setToolpath(result.toolpath);
      } else {
        alert(`パス生成エラー: ${result.message}`);
      }
    } catch (error) {
      alert(`パス生成に失敗しました: ${error}`);
    }
  };

  const handleSaveGcode = async () => {
    if (!toolpath) {
      alert('保存するツールパスがありません。');
      return;
    }
    try {
      const params = { toolpath, feedRate, safeZ, stepDown };
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

  // Styles
  const mainStyle: React.CSSProperties = { display: 'flex', height: '100vh', fontFamily: 'sans-serif' };
  const viewerStyle: React.CSSProperties = { flex: 3, borderRight: '1px solid #ccc' };
  const panelStyle: React.CSSProperties = { flex: 1, padding: '1rem', overflowY: 'auto' };
  const inputGroupStyle: React.CSSProperties = { marginBottom: '1rem' };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.25rem' };

  return (
    <div style={mainStyle}>
      <div style={viewerStyle}>
        <ThreeViewer toolpath={toolpath} dxfSegments={dxfSegments} fileToLoad={fileToLoad} />
      </div>
      <div style={panelStyle}>
        <h2>設定パネル</h2>
        <div style={inputGroupStyle}>
          <h3>輪郭加工</h3>
          <label style={labelStyle}>工具径 (mm)</label>
          <input type="number" value={toolDiameter} onChange={(e) => setToolDiameter(parseFloat(e.target.value))} step="0.1"/>
          <button onClick={handleGenerateContour}>輪郭パス生成</button>
        </div>
        <hr />
        <div style={inputGroupStyle}>
          <h3>Gコード生成</h3>
          <label style={labelStyle}>送り速度 (mm/min)</label>
          <input type="number" value={feedRate} onChange={(e) => setFeedRate(parseFloat(e.target.value))} />
          <label style={labelStyle}>安全高さ (Z)</label>
          <input type="number" value={safeZ} onChange={(e) => setSafeZ(parseFloat(e.target.value))} step="0.1" />
          <label style={labelStyle}>切り込み深さ (Z)</label>
          <input type="number" value={stepDown} onChange={(e) => setStepDown(parseFloat(e.target.value))} step="0.1" />
          <button onClick={handleSaveGcode}>Gコードを保存</button>
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