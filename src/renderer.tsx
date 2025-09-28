import React, { useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

// Preloadスクリプト経由で公開されたAPIの型定義
declare global {
  interface Window {
    electronAPI: {
      onFileOpen: (callback: (filePath: string) => void) => void;
      invokePythonTest: () => Promise<any>;
    };
  }
}

const ThreeViewer = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    // 1. シーンの作成
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e0e0e0');
    sceneRef.current = scene;

    // 2. カメラの作成
    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(3, 3, 5);

    // 3. レンダラーの作成
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(renderer.domElement);

    // 4. ライトの追加
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // 5. コントロールの追加
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // 6. 初期オブジェクト (立方体) の作成
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x007bff });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    modelRef.current = cube;

    // 7. アニメーションループ
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    
    // 8. ファイル読み込みリスナーの設定
    window.electronAPI.onFileOpen((filePath) => {
      console.log('Received file path:', filePath);
      const loader = new STLLoader();
      loader.load(filePath, (geometry) => {
        // 既存のモデルを削除
        if (modelRef.current && sceneRef.current) {
          sceneRef.current.remove(modelRef.current);
        }

        const material = new THREE.MeshStandardMaterial({ color: 0x007bff, flatShading: true });
        const mesh = new THREE.Mesh(geometry, material);
        
        // モデルを中央に配置し、サイズを調整
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        const center = box.getCenter(new THREE.Vector3());
        mesh.position.sub(center); // 中央に移動
        
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 5 / maxDim; // 画面に収まるようにスケーリング
        mesh.scale.set(scale, scale, scale);

        scene.add(mesh);
        modelRef.current = mesh;
      });
    });

    // 9. リサイズ処理
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // 10. クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      currentMount.removeChild(renderer.domElement);
      // TODO: ipcRendererのリスナーもクリーンアップするのが望ましい
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

const App = () => {
  const mainStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    height: '100vh',
    fontFamily: 'sans-serif',
    color: '#333'
  };

  const viewerStyle: React.CSSProperties = {
    flex: 3,
    backgroundColor: '#e0e0e0',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    borderRight: '1px solid #ccc'
  };

  const panelStyle: React.CSSProperties = {
    flex: 1,
    padding: '1rem',
    backgroundColor: '#f7f7f7',
    overflowY: 'auto'
  };

  const handlePythonTest = async () => {
    console.log('Invoking Python script...');
    try {
      const result = await window.electronAPI.invokePythonTest();
      console.log('Result from Python:', result);
      alert(`Pythonからメッセージ: ${result.message}`);
    } catch (error) {
      console.error('Error invoking Python script:', error);
      alert(`Pythonの実行に失敗しました: ${error}`);
    }
  };

  return (
    <div style={mainStyle}>
      <div style={viewerStyle}>
        <ThreeViewer />
      </div>
      <div style={panelStyle}>
        <h2>設定パネル</h2>
        <p>ここに工具設定や加工条件などを配置します。</p>
        <hr />
        <button onClick={handlePythonTest}>Python実行テスト</button>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}