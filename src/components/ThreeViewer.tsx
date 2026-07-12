import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { ToolpathSegment, Geometry, BottomFace } from '../types';
import {
    SimulationConfig,
    Heightmap,
    SamplePoint,
    computeBounds,
    createHeightmap,
    stampCircle,
    sampleToolpath,
    buildGridPositions,
    buildGridIndices,
} from '../simulation/stockSimulation';

// Playback pace (mm of toolpath traveled per real second at 1x speed). Not tied to the
// tool's actual feed rate - this is purely a visualization pace.
const SIM_BASE_SPEED_MM_PER_SEC = 40;
const SIM_NORMAL_RECOMPUTE_INTERVAL = 4; // frames between vertex-normal recalculation
const SIM_PROGRESS_REPORT_INTERVAL_MS = 100;

interface ThreeViewerProps {
    toolpaths: ToolpathSegment[] | null;
    geometry: Geometry | null;
    stockStlData: ArrayBuffer | null;
    targetStlData: ArrayBuffer | null;
    stockBottomFace: BottomFace;
    targetBottomFace: BottomFace;
    simulation?: SimulationConfig | null;
}

// STLファイルのローカル座標系のうち、どの面を「底面」（テーブルに接する面 = ワールドの -Z 方向）
// として扱うかを表すベクトル群。ユーザーが選択した面の法線がワールドの -Z に向くよう回転させる。
const BOTTOM_FACE_NORMALS: Record<BottomFace, THREE.Vector3> = {
    '+X': new THREE.Vector3(1, 0, 0),
    '-X': new THREE.Vector3(-1, 0, 0),
    '+Y': new THREE.Vector3(0, 1, 0),
    '-Y': new THREE.Vector3(0, -1, 0),
    '+Z': new THREE.Vector3(0, 0, 1),
    '-Z': new THREE.Vector3(0, 0, -1),
};

const getBottomFaceQuaternion = (face: BottomFace): THREE.Quaternion => {
    const down = new THREE.Vector3(0, 0, -1);
    return new THREE.Quaternion().setFromUnitVectors(BOTTOM_FACE_NORMALS[face], down);
};

const ThreeViewer = ({ toolpaths, geometry, stockStlData, targetStlData, stockBottomFace, targetBottomFace, simulation }: ThreeViewerProps) => {
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

    // --- 加工シミュレーション state (refs so the animate() loop always reads live values) ---
    const simGroupRef = useRef<THREE.Group | null>(null);
    const simTopMeshRef = useRef<THREE.Mesh | null>(null);
    const heightmapRef = useRef<Heightmap | null>(null);
    const samplesRef = useRef<SamplePoint[]>([]);
    const sampleCursorRef = useRef(0);
    const traveledRef = useRef(0);
    const lastFrameTimeRef = useRef<number | null>(null);
    const lastProgressReportRef = useRef(0);
    const frameCounterRef = useRef(0);
    const finishedRef = useRef(false);

    const simEnabled = simulation?.enabled ?? false;
    const simToolRadius = simulation?.toolRadius ?? 0;
    const simCutZ = simulation?.cutZ ?? 0;
    const simStockMargin = simulation?.stockMargin ?? 5;
    const simStockThickness = simulation?.stockThickness ?? 10;
    const simResetToken = simulation?.resetToken ?? 0;

    const simPlayingRef = useRef(simulation?.playing ?? false);
    const simSpeedRef = useRef(simulation?.speed ?? 1);
    const simCutZRef = useRef(simCutZ);
    const onSimProgressRef = useRef(simulation?.onProgress);
    const onSimFinishedRef = useRef(simulation?.onFinished);

    useEffect(() => {
        simPlayingRef.current = simulation?.playing ?? false;
        simSpeedRef.current = simulation?.speed ?? 1;
        simCutZRef.current = simCutZ;
        onSimProgressRef.current = simulation?.onProgress;
        onSimFinishedRef.current = simulation?.onFinished;
    }, [simulation?.playing, simulation?.speed, simCutZ, simulation?.onProgress, simulation?.onFinished]);

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

        const stepSimulation = (now: number) => {
            const map = heightmapRef.current;
            const topMesh = simTopMeshRef.current;
            const samples = samplesRef.current;
            if (!map || !topMesh || samples.length === 0) return;

            if (lastFrameTimeRef.current === null) lastFrameTimeRef.current = now;
            const elapsedSeconds = (now - lastFrameTimeRef.current) / 1000;
            lastFrameTimeRef.current = now;

            if (!simPlayingRef.current || finishedRef.current) return;

            const totalDistance = samples[samples.length - 1].distance;
            const targetDistance = Math.min(totalDistance, traveledRef.current + elapsedSeconds * SIM_BASE_SPEED_MM_PER_SEC * simSpeedRef.current);

            let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
            let touched = false;
            while (sampleCursorRef.current < samples.length && samples[sampleCursorRef.current].distance <= targetDistance) {
                const p = samples[sampleCursorRef.current];
                const dirty = stampCircle(map, p.x, p.y, simToolRadius, simCutZRef.current);
                if (dirty) {
                    touched = true;
                    minCol = Math.min(minCol, dirty.minCol);
                    maxCol = Math.max(maxCol, dirty.maxCol);
                    minRow = Math.min(minRow, dirty.minRow);
                    maxRow = Math.max(maxRow, dirty.maxRow);
                }
                sampleCursorRef.current++;
            }
            traveledRef.current = targetDistance;

            if (touched) {
                const posAttr = topMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
                for (let row = minRow; row <= maxRow; row++) {
                    for (let col = minCol; col <= maxCol; col++) {
                        const idx = row * map.cols + col;
                        posAttr.setZ(idx, map.heights[idx]);
                    }
                }
                posAttr.needsUpdate = true;
                frameCounterRef.current++;
                if (frameCounterRef.current % SIM_NORMAL_RECOMPUTE_INTERVAL === 0) {
                    topMesh.geometry.computeVertexNormals();
                }
            }

            const reachedEnd = targetDistance >= totalDistance;
            if (reachedEnd && !finishedRef.current) {
                finishedRef.current = true;
                topMesh.geometry.computeVertexNormals();
                onSimProgressRef.current?.(1);
                onSimFinishedRef.current?.();
            } else if (now - lastProgressReportRef.current > SIM_PROGRESS_REPORT_INTERVAL_MS) {
                lastProgressReportRef.current = now;
                onSimProgressRef.current?.(totalDistance > 0 ? traveledRef.current / totalDistance : 0);
            }
        };

        const animate = (now?: number) => {
            requestAnimationFrame(animate);
            controls.update();
            stepSimulation(now ?? performance.now());
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

    // 加工シミュレーション用ストックの構築（トグル/リセット/工具・素材条件の変更時に再構築）
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        if (simGroupRef.current) {
            scene.remove(simGroupRef.current);
            simGroupRef.current.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
                    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
                }
            });
        }
        simGroupRef.current = null;
        simTopMeshRef.current = null;
        heightmapRef.current = null;
        samplesRef.current = [];
        sampleCursorRef.current = 0;
        traveledRef.current = 0;
        lastFrameTimeRef.current = null;
        lastProgressReportRef.current = 0;
        frameCounterRef.current = 0;
        finishedRef.current = false;
        onSimProgressRef.current?.(0);

        if (!simEnabled || !toolpaths || toolpaths.length === 0 || simToolRadius <= 0) {
            return;
        }

        const bounds = computeBounds(geometry, toolpaths);
        if (!bounds) return;

        const map = createHeightmap(bounds, simStockMargin, simStockThickness, 0);
        heightmapRef.current = map;
        samplesRef.current = sampleToolpath(toolpaths, map.cellSize * 0.5);

        const group = new THREE.Group();

        const topGeometry = new THREE.BufferGeometry();
        topGeometry.setAttribute('position', new THREE.BufferAttribute(buildGridPositions(map), 3));
        topGeometry.setIndex(new THREE.BufferAttribute(buildGridIndices(map), 1));
        topGeometry.computeVertexNormals();
        const topMaterial = new THREE.MeshStandardMaterial({ color: 0xd9a066, metalness: 0.05, roughness: 0.8, side: THREE.DoubleSide });
        const topMesh = new THREE.Mesh(topGeometry, topMaterial);
        group.add(topMesh);
        simTopMeshRef.current = topMesh;

        // 側面・底面はストック外形（マージン込みの矩形）から静的に生成。ツールパスはマージン分
        // 内側に収まる前提のため、輪郭が削られることはなく毎フレーム更新する必要はない。
        const minX = map.originX, maxX = map.originX + map.cols * map.cellSize;
        const minY = map.originY, maxY = map.originY + map.rows * map.cellSize;
        const { topZ, bottomZ } = map;
        const skirtPositions: number[] = [];
        const pushWall = (x0: number, y0: number, x1: number, y1: number) => {
            skirtPositions.push(
                x0, y0, topZ, x1, y1, topZ, x0, y0, bottomZ,
                x1, y1, topZ, x1, y1, bottomZ, x0, y0, bottomZ,
            );
        };
        pushWall(minX, minY, maxX, minY);
        pushWall(maxX, minY, maxX, maxY);
        pushWall(maxX, maxY, minX, maxY);
        pushWall(minX, maxY, minX, minY);
        skirtPositions.push(
            minX, minY, bottomZ, maxX, minY, bottomZ, minX, maxY, bottomZ,
            maxX, minY, bottomZ, maxX, maxY, bottomZ, minX, maxY, bottomZ,
        );
        const skirtGeometry = new THREE.BufferGeometry();
        skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
        skirtGeometry.computeVertexNormals();
        const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0xb08968, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide });
        const skirtMesh = new THREE.Mesh(skirtGeometry, skirtMaterial);
        group.add(skirtMesh);

        scene.add(group);
        simGroupRef.current = group;
    }, [toolpaths, geometry, simEnabled, simToolRadius, simStockMargin, simStockThickness, simResetToken]);

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

        const loadStl = (data: ArrayBuffer, material: THREE.Material, modelRef: React.MutableRefObject<THREE.Object3D | null>, bottomFace: BottomFace) => {
            try {
                const loader = new STLLoader();
                const geometry = loader.parse(data);
                geometry.computeVertexNormals();
                const mesh = new THREE.Mesh(geometry, material);
                mesh.quaternion.copy(getBottomFaceQuaternion(bottomFace));
                scene.add(mesh);
                modelRef.current = mesh;

                // 両方のモデルが読み込まれた後にカメラを調整
                const combinedBox = new THREE.Box3();
                if (stockModelRef.current) combinedBox.expandByObject(stockModelRef.current);
                if (targetModelRef.current) combinedBox.expandByObject(targetModelRef.current);
                if (!combinedBox.isEmpty()) {
                    fitCameraToObject(stockModelRef.current ?? targetModelRef.current!);
                }
            } catch (err) {
                console.error('STLファイルの解析に失敗しました:', err);
                alert(`STLファイルの解析に失敗しました: ${err}`);
            }
        };

        // 材料STLの読み込み
        if (stockStlData) {
            const stockMaterial = new THREE.MeshStandardMaterial({
                color: 0x1565c0, // Blue
                transparent: true,
                opacity: 0.3,
                wireframe: true,
            });
            loadStl(stockStlData, stockMaterial, stockModelRef, stockBottomFace);
        }

        // 加工後形状STLの読み込み
        if (targetStlData) {
            const targetMaterial = new THREE.MeshStandardMaterial({
                color: 0x999999, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide,
            });
            loadStl(targetStlData, targetMaterial, targetModelRef, targetBottomFace);
        }

    }, [stockStlData, targetStlData, stockBottomFace, targetBottomFace]);

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
