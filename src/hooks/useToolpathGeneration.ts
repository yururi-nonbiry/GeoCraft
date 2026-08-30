import { useEffect, useState } from 'react';
import { api } from '../api';
import { Geometry, ToolpathSegment, StlBaseTransform } from '../types';
import { optimizeToolpathOrder } from '../toolpathOrdering';

type Vec3 = { x: number; y: number; z: number };

type StockTargetPlacement = {
  stockStlPath: string | null;
  stockStlData: ArrayBuffer | null;
  stockOffset: Vec3;
  stockBaseTransform: StlBaseTransform | null;
  targetStlFile: string | null;
  targetStlData: ArrayBuffer | null;
  targetOffset: Vec3;
  targetBaseTransform: StlBaseTransform | null;
  resolveOffsetStlPath: (originalPath: string, data: ArrayBuffer | null, offset: Vec3, baseTransform: StlBaseTransform | null) => Promise<string>;
};

type UseToolpathGenerationArgs = {
  geometry: Geometry | null;
  toolDiameter: number;
  stepover: number;
  contourSide: string;
  processType: 'roughing' | 'finishing';
  stockToLeave: number;
  sliceHeight: number;
  placement: StockTargetPlacement;
  setToolpaths: (paths: ToolpathSegment[]) => void;
  setPreviewMode: (v: boolean) => void;
  resetSimulation: () => void;
};

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

// 2.5D(DXF/SVG輪郭・ポケット)・3D(STL荒加工)のツールパス生成を担う。
export const useToolpathGeneration = ({
  geometry,
  toolDiameter,
  stepover,
  contourSide,
  processType,
  stockToLeave,
  sliceHeight,
  placement,
  setToolpaths,
  setPreviewMode,
  resetSimulation,
}: UseToolpathGenerationArgs) => {
  const [isGenerating3dPath, setIsGenerating3dPath] = useState(false);
  const [path3dProgress, setPath3dProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const removePathProgressListener = api.onPathProgress((progress) => {
      setPath3dProgress({ current: progress.current, total: progress.total });
    });
    return () => removePathProgressListener();
  }, []);

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
      if (allSegments.length > 0) setToolpaths(optimizeToolpathOrder(allSegments));
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
        const segments = result.toolpaths.map((path: number[][]) => ({ type: 'line' as const, points: path }));
        setToolpaths(optimizeToolpathOrder(segments));
      } else {
        alert(`パス生成エラー: ${result.message}`);
      }
      resetSimulation();
    } catch (error) {
      alert(`パス生成に失敗しました: ${error}`);
    }
  };

  const handleGenerate3dPath = async () => {
    const { stockStlPath, stockStlData, stockOffset, stockBaseTransform, targetStlFile, targetStlData, targetOffset, targetBaseTransform, resolveOffsetStlPath } = placement;
    if (!stockStlPath || !targetStlFile) return alert('3D加工パスを生成するには、材料と加工後形状の両方のSTLファイルを開いてください。');
    setPath3dProgress({ current: 0, total: 0 });
    setIsGenerating3dPath(true);
    try {
      const stockPath = await resolveOffsetStlPath(stockStlPath, stockStlData, stockOffset, stockBaseTransform);
      const targetPath = await resolveOffsetStlPath(targetStlFile, targetStlData, targetOffset, targetBaseTransform);
      const params = {
        stockPath,
        targetPath,
        sliceHeight,
        toolDiameter,
        stepoverRatio: stepover
      };
      const result = await api.generate3dRoughingPath(params);
      if (result.status === 'success') {
        setToolpaths(optimizeToolpathOrder(result.toolpaths));
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

  return {
    handleGenerateContour,
    handleGeneratePocket,
    handleGenerate3dPath,
    isGenerating3dPath,
    path3dProgress,
  };
};
