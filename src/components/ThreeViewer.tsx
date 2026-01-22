import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { ToolpathSegment, Geometry } from '../types';

interface ThreeViewerProps {
    toolpaths: ToolpathSegment[] | null;
    geometry: Geometry | null;
    stockStlFile: string | null;
    targetStlFile: string | null;
}

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
            if (currentMount.contains(renderer.domElement)) {
                currentMount.removeChild(renderer.domElement);
            }
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

export default ThreeViewer;
