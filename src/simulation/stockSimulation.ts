import * as THREE from 'three';
import { Geometry, ToolpathSegment } from '../types';

export interface SimulationConfig {
  enabled: boolean;
  toolRadius: number;
  cutZ: number;
  stockMargin: number;
  stockThickness: number;
  playing: boolean;
  speed: number;
  resetToken: number;
  // 値が変化するたびに、残りのツールパスを即座に最後まで適用して完了状態にする。
  skipToken: number;
  onProgress?: (ratio: number) => void;
  onFinished?: () => void;
}

export interface Bounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Heightmap {
  cols: number;
  rows: number;
  cellSize: number;
  originX: number;
  originY: number;
  topZ: number;
  bottomZ: number;
  heights: Float32Array;
}

export interface DirtyRegion {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export interface SamplePoint {
  x: number;
  y: number;
  // ツールパス点が実際に持つZ座標。2D輪郭パスのようにZ情報を持たない点はnull。
  z: number | null;
  distance: number;
}

const MIN_GRID_CELLS = 40;
const MAX_GRID_CELLS = 300;
const MIN_CELL_SIZE = 0.2;
// STLメッシュへの下方向レイキャストで高さマップを構築する際のグリッド上限。
// 通常のヒートマップ(MAX_GRID_CELLS=300)より粗くしているのは、
// アクセラレーション構造を持たない Three.js の Raycaster で セル数×三角形数 の総当たりになり、
// 300×300 だと大きなSTLで著しく遅くなるため。
const MAX_GRID_CELLS_STL = 120;

export function computeBounds(geometry: Geometry | null, toolpaths: ToolpathSegment[] | null): Bounds2D | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;

  const expand = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    found = true;
  };

  if (geometry) {
    for (const seg of geometry.segments ?? []) {
      for (const p of seg.points) expand(p[0], p[1]);
    }
    for (const arc of geometry.arcs ?? []) {
      expand(arc.center[0] - arc.radius, arc.center[1] - arc.radius);
      expand(arc.center[0] + arc.radius, arc.center[1] + arc.radius);
    }
  }

  if (!found && toolpaths) {
    for (const seg of toolpaths) {
      if (seg.type === 'line') {
        for (const p of seg.points) expand(p[0], p[1]);
      } else {
        const r = Math.hypot(seg.start[0] - seg.center[0], seg.start[1] - seg.center[1]);
        expand(seg.center[0] - r, seg.center[1] - r);
        expand(seg.center[0] + r, seg.center[1] + r);
      }
    }
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY };
}

export function createHeightmap(bounds: Bounds2D, margin: number, thickness: number, topZ = 0): Heightmap {
  const width = (bounds.maxX - bounds.minX) + margin * 2;
  const depth = (bounds.maxY - bounds.minY) + margin * 2;
  const longestSide = Math.max(width, depth, 1e-6);

  const cellSize = Math.max(longestSide / MAX_GRID_CELLS, MIN_CELL_SIZE);

  const cols = Math.min(MAX_GRID_CELLS, Math.max(MIN_GRID_CELLS, Math.round(width / cellSize)));
  const rows = Math.min(MAX_GRID_CELLS, Math.max(MIN_GRID_CELLS, Math.round(depth / cellSize)));

  return {
    cols,
    rows,
    cellSize,
    originX: bounds.minX - margin,
    originY: bounds.minY - margin,
    topZ,
    bottomZ: topZ - Math.abs(thickness),
    heights: new Float32Array(cols * rows).fill(topZ),
  };
}

// 材料STLメッシュの実形状(外形・上面の高さ)から高さマップを構築する。
// メッシュの底面(Z最小)を bottomZ とし、各セル中心から下向きにレイキャストして
// ヒットした最も高いZを初期の材料表面とする。メッシュの外形(フットプリント)外のセルは
// 材料が無いものとして bottomZ(=何も残っていない状態)にする。
export function createHeightmapFromMesh(mesh: THREE.Object3D): Heightmap | null {
  const box = new THREE.Box3().setFromObject(mesh);
  if (box.isEmpty()) return null;

  const width = Math.max(box.max.x - box.min.x, 1e-6);
  const depth = Math.max(box.max.y - box.min.y, 1e-6);
  const longestSide = Math.max(width, depth, 1e-6);

  const cellSize = Math.max(longestSide / MAX_GRID_CELLS_STL, MIN_CELL_SIZE);
  const cols = Math.min(MAX_GRID_CELLS_STL, Math.max(MIN_GRID_CELLS, Math.round(width / cellSize)));
  const rows = Math.min(MAX_GRID_CELLS_STL, Math.max(MIN_GRID_CELLS, Math.round(depth / cellSize)));

  const originX = box.min.x;
  const originY = box.min.y;
  const bottomZ = box.min.z;
  const rayOriginZ = box.max.z + Math.max(1, (box.max.z - box.min.z) * 0.1);
  const raycaster = new THREE.Raycaster(undefined, undefined, 0, (rayOriginZ - box.min.z) + 1);
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, 0, -1);

  const heights = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = originX + (col + 0.5) * cellSize;
      const y = originY + (row + 0.5) * cellSize;
      origin.set(x, y, rayOriginZ);
      raycaster.set(origin, down);
      const hits = raycaster.intersectObject(mesh, true);
      heights[row * cols + col] = hits.length > 0 ? hits[0].point.z : bottomZ;
    }
  }

  return { cols, rows, cellSize, originX, originY, topZ: box.max.z, bottomZ, heights };
}

export function cellCenter(map: Heightmap, col: number, row: number): [number, number] {
  return [map.originX + (col + 0.5) * map.cellSize, map.originY + (row + 0.5) * map.cellSize];
}

export function stampCircle(map: Heightmap, cx: number, cy: number, radius: number, cutZ: number): DirtyRegion | null {
  const clampedCutZ = Math.max(map.bottomZ, Math.min(cutZ, map.topZ));
  const minCol = Math.max(0, Math.floor((cx - radius - map.originX) / map.cellSize));
  const maxCol = Math.min(map.cols - 1, Math.ceil((cx + radius - map.originX) / map.cellSize));
  const minRow = Math.max(0, Math.floor((cy - radius - map.originY) / map.cellSize));
  const maxRow = Math.min(map.rows - 1, Math.ceil((cy + radius - map.originY) / map.cellSize));

  if (minCol > maxCol || minRow > maxRow) return null;

  const r2 = radius * radius;
  let touched = false;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const [px, py] = cellCenter(map, col, row);
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r2) {
        const idx = row * map.cols + col;
        if (clampedCutZ < map.heights[idx]) {
          map.heights[idx] = clampedCutZ;
          touched = true;
        }
      }
    }
  }

  return touched ? { minCol, maxCol, minRow, maxRow } : null;
}

// Samples line/arc segments into a flat, ordered point list with cumulative path distance,
// so playback can be driven by "distance traveled" rather than by segment/point index.
// 各点のZは、そのツールパス点が実際に持つZ座標(points[i][2] / start[2] / end[2])をそのまま使う。
// 3Dラフィングパスや層分けされたポケット/輪郭パスは各点・各層に本来の切削深さを持っているため、
// それを無視して一律の深さ(旧実装ではマシン設定のstepDown固定値)で削ると、層ごとの
// 段階的な切削が再現されず、最初に触れた瞬間に最終深さまで一気に削れてしまう不具合になる。
// Z座標を持たない(2要素のみの)点はnullとし、呼び出し側でフォールバック値を適用する。
export function sampleToolpath(segments: ToolpathSegment[], spacing: number): SamplePoint[] {
  const points: SamplePoint[] = [];
  let distance = 0;
  const step = Math.max(spacing, 1e-3);

  const pushPoint = (x: number, y: number, z: number | null) => {
    if (points.length > 0) {
      const last = points[points.length - 1];
      distance += Math.hypot(x - last.x, y - last.y);
    }
    points.push({ x, y, z, distance });
  };

  for (const seg of segments) {
    if (seg.type === 'line') {
      for (let i = 0; i < seg.points.length - 1; i++) {
        const [x0, y0, z0raw] = seg.points[i];
        const [x1, y1, z1raw] = seg.points[i + 1];
        const z0 = z0raw ?? null;
        const z1 = z1raw ?? null;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(1, Math.ceil(len / step));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const z = z0 === null || z1 === null ? (z0 ?? z1) : z0 + (z1 - z0) * t;
          pushPoint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z);
        }
      }
    } else {
      const { start, end, center, direction } = seg;
      const startZ = start[2] ?? null;
      const endZ = end[2] ?? null;
      const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
      const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
      let endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);

      if (direction === 'cw') {
        while (endAngle > startAngle) endAngle -= Math.PI * 2;
      } else {
        while (endAngle < startAngle) endAngle += Math.PI * 2;
      }

      const arcLen = Math.abs(endAngle - startAngle) * radius;
      const steps = Math.max(1, Math.ceil(arcLen / step));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const angle = startAngle + (endAngle - startAngle) * t;
        const z = startZ === null || endZ === null ? (startZ ?? endZ) : startZ + (endZ - startZ) * t;
        pushPoint(center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle), z);
      }
    }
  }

  return points;
}

export interface SkirtGeometryData {
  positions: Float32Array;
  // セルインデックス(row*cols+col) -> そのセルの高さに連動する頂点インデックスの一覧。
  vertexIndicesByCell: Map<number, number[]>;
}

export interface TopTileGeometryData extends SkirtGeometryData {
  indices: Uint32Array;
}

// トップメッシュを、セル中心同士を結ぶ滑らかなグリッド(旧実装)ではなく、
// セル1個ずつを独立した平らなタイル(セルの外形そのままの正方形)として構築する。
// 旧実装はセルの高さが異なる箇所を必ず「1セル分の水平距離のなだらかな斜面」として
// 補間してしまい、垂直な切削壁が斜めのテーパーに見える原因になっていた。
// タイルを独立させ、セル境界をそのままセルの外形とすることで、面自体には一切傾斜が
// 生じなくなる(高さの変化はセル間の垂直な壁として buildInteriorWallPositions が別途埋める)。
export function buildTopTilePositions(map: Heightmap): TopTileGeometryData {
  const { cols, rows, cellSize, originX, originY, heights } = map;
  const positions: number[] = [];
  const indices: number[] = [];
  const vertexIndicesByCell = new Map<number, number[]>();

  for (let row = 0; row < rows; row++) {
    const y0 = originY + row * cellSize;
    const y1 = y0 + cellSize;
    for (let col = 0; col < cols; col++) {
      const x0 = originX + col * cellSize;
      const x1 = x0 + cellSize;
      const idx = row * cols + col;
      const z = heights[idx];

      const base = positions.length / 3;
      positions.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
      vertexIndicesByCell.set(idx, [base, base + 1, base + 2, base + 3]);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), vertexIndicesByCell };
}

// ストック側面(スカート)のジオメトリを、トップメッシュと同じ「セルの外形(タイル境界)・高さ」を
// 基準に生成する。以前は側面をストック外形の静的な矩形として一度だけ生成していたが、
// 切削が外周セルに達すると側面の上端(topZ固定)とトップメッシュの頂点(削られてtopZ未満に
// 下がる)がずれてしまい、その隙間から内部の空洞が透けて見える不具合があった。
// 側面の各頂点をセル高さに追従させることで、切削のたびにトップメッシュと側面を同期させ、
// 隙間が生じないようにする。
// 外周セルごとに、そのセルが接する外側の辺(1〜2辺、角セルは2辺)だけを壁として追加する。
export function buildSkirtPositions(map: Heightmap): SkirtGeometryData {
  const { cols, rows, cellSize, originX, originY, bottomZ, heights } = map;
  const positions: number[] = [];
  const vertexIndicesByCell = new Map<number, number[]>();

  const pushVertex = (x: number, y: number, z: number, cellIdx: number | null) => {
    const vIdx = positions.length / 3;
    positions.push(x, y, z);
    if (cellIdx !== null) {
      const arr = vertexIndicesByCell.get(cellIdx);
      if (arr) arr.push(vIdx);
      else vertexIndicesByCell.set(cellIdx, [vIdx]);
    }
  };

  // セル idx の外形上の(x0,y0)-(x1,y1)の辺を、そのセルの高さからbottomZまでの壁にする。
  const pushOuterWall = (x0: number, y0: number, x1: number, y1: number, idx: number) => {
    const h = heights[idx];
    pushVertex(x0, y0, h, idx);
    pushVertex(x1, y1, h, idx);
    pushVertex(x0, y0, bottomZ, null);

    pushVertex(x1, y1, h, idx);
    pushVertex(x1, y1, bottomZ, null);
    pushVertex(x0, y0, bottomZ, null);
  };

  for (let row = 0; row < rows; row++) {
    const y0 = originY + row * cellSize;
    const y1 = y0 + cellSize;
    for (let col = 0; col < cols; col++) {
      const x0 = originX + col * cellSize;
      const x1 = x0 + cellSize;
      const idx = row * cols + col;
      if (row === 0) pushOuterWall(x0, y0, x1, y0, idx);
      if (row === rows - 1) pushOuterWall(x1, y1, x0, y1, idx);
      if (col === 0) pushOuterWall(x0, y1, x0, y0, idx);
      if (col === cols - 1) pushOuterWall(x1, y0, x1, y1, idx);
    }
  }

  // 底面(グリッドは常に矩形なので単純な2枚の三角形でよい)
  const bx0 = originX, by0 = originY, bx1 = originX + cols * cellSize, by1 = originY + rows * cellSize;
  pushVertex(bx0, by0, bottomZ, null);
  pushVertex(bx1, by0, bottomZ, null);
  pushVertex(bx1, by1, bottomZ, null);

  pushVertex(bx0, by0, bottomZ, null);
  pushVertex(bx1, by1, bottomZ, null);
  pushVertex(bx0, by1, bottomZ, null);

  return { positions: Float32Array.from(positions), vertexIndicesByCell };
}

// トップメッシュは独立した平らなタイルの集まりになったため(buildTopTilePositions参照)、
// 高さの異なる隣接セル同士の間には面が存在せず、隙間が空いてしまう。このセル境界に、
// 隣接する2セルの高さをそのまま結ぶ垂直な壁を追加し、その隙間を塞ぐ。
// 高さが同じセル同士では壁の上端と下端が同じ高さになり、面積ゼロの壁として実質的に
// 描画されない。
export function buildInteriorWallPositions(map: Heightmap): SkirtGeometryData {
  const { cols, rows, cellSize, originX, originY, heights } = map;
  const positions: number[] = [];
  const vertexIndicesByCell = new Map<number, number[]>();

  const pushVertex = (x: number, y: number, z: number, cellIdx: number) => {
    const vIdx = positions.length / 3;
    positions.push(x, y, z);
    const arr = vertexIndicesByCell.get(cellIdx);
    if (arr) arr.push(vIdx);
    else vertexIndicesByCell.set(cellIdx, [vIdx]);
  };

  // 境界線分(x0,y0)-(x1,y1)の両側にあるセルidxA/idxBの高さを結ぶ壁を1枚(三角形2枚)追加する。
  const pushWall = (x0: number, y0: number, x1: number, y1: number, idxA: number, idxB: number) => {
    const hA = heights[idxA];
    const hB = heights[idxB];
    pushVertex(x0, y0, hA, idxA);
    pushVertex(x1, y1, hA, idxA);
    pushVertex(x1, y1, hB, idxB);

    pushVertex(x1, y1, hB, idxB);
    pushVertex(x0, y0, hB, idxB);
    pushVertex(x0, y0, hA, idxA);
  };

  // 水平方向に隣接するセルの境界(縦の壁): (col,row)-(col+1,row)
  for (let row = 0; row < rows; row++) {
    const cy = originY + (row + 0.5) * cellSize;
    const y0 = cy - cellSize / 2;
    const y1 = cy + cellSize / 2;
    for (let col = 0; col < cols - 1; col++) {
      const x = originX + (col + 1) * cellSize;
      const idxA = row * cols + col;
      const idxB = row * cols + col + 1;
      pushWall(x, y0, x, y1, idxA, idxB);
    }
  }

  // 垂直方向に隣接するセルの境界(横の壁): (col,row)-(col,row+1)
  for (let col = 0; col < cols; col++) {
    const cx = originX + (col + 0.5) * cellSize;
    const x0 = cx - cellSize / 2;
    const x1 = cx + cellSize / 2;
    for (let row = 0; row < rows - 1; row++) {
      const y = originY + (row + 1) * cellSize;
      const idxA = row * cols + col;
      const idxB = (row + 1) * cols + col;
      pushWall(x0, y, x1, y, idxA, idxB);
    }
  }

  return { positions: Float32Array.from(positions), vertexIndicesByCell };
}

// 切削によって高さが変化したセル(dirty領域)の頂点位置を、渡された頂点インデックス表を元に
// 更新する汎用ヘルパー。buildInteriorWallPositions の壁メッシュのように、1セルの高さ変化が
// 複数の頂点(=最大4方向の壁の端点)に影響する場合に使う。
export function updateVertexHeights(
  map: Heightmap,
  posAttr: { setZ(index: number, z: number): void },
  vertexIndicesByCell: Map<number, number[]>,
  dirty: DirtyRegion,
): void {
  for (let row = dirty.minRow; row <= dirty.maxRow; row++) {
    for (let col = dirty.minCol; col <= dirty.maxCol; col++) {
      const idx = row * map.cols + col;
      const vIdxs = vertexIndicesByCell.get(idx);
      if (!vIdxs) continue;
      const z = map.heights[idx];
      for (const vIdx of vIdxs) posAttr.setZ(vIdx, z);
    }
  }
}

// 切削で変化したセル(dirty領域)のうち外周セルに該当するものの高さを、スカート側の
// 頂点位置に反映する。戻り値は実際に外周セルへ変化が及んだかどうか。
export function updateSkirtPositions(
  map: Heightmap,
  posAttr: { setZ(index: number, z: number): void },
  vertexIndicesByCell: Map<number, number[]>,
  dirty: DirtyRegion,
): boolean {
  let touchedBoundary = false;
  const touchCell = (col: number, row: number) => {
    const idx = row * map.cols + col;
    const vIdxs = vertexIndicesByCell.get(idx);
    if (!vIdxs) return;
    touchedBoundary = true;
    const z = map.heights[idx];
    for (const vIdx of vIdxs) posAttr.setZ(vIdx, z);
  };

  if (dirty.minRow === 0) {
    for (let col = dirty.minCol; col <= dirty.maxCol; col++) touchCell(col, 0);
  }
  if (dirty.maxRow === map.rows - 1) {
    for (let col = dirty.minCol; col <= dirty.maxCol; col++) touchCell(col, map.rows - 1);
  }
  if (dirty.minCol === 0) {
    for (let row = dirty.minRow; row <= dirty.maxRow; row++) touchCell(0, row);
  }
  if (dirty.maxCol === map.cols - 1) {
    for (let row = dirty.minRow; row <= dirty.maxRow; row++) touchCell(map.cols - 1, row);
  }

  return touchedBoundary;
}
