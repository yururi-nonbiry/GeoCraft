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
export function sampleToolpath(segments: ToolpathSegment[], spacing: number): SamplePoint[] {
  const points: SamplePoint[] = [];
  let distance = 0;
  const step = Math.max(spacing, 1e-3);

  const pushPoint = (x: number, y: number) => {
    if (points.length > 0) {
      const last = points[points.length - 1];
      distance += Math.hypot(x - last.x, y - last.y);
    }
    points.push({ x, y, distance });
  };

  for (const seg of segments) {
    if (seg.type === 'line') {
      for (let i = 0; i < seg.points.length - 1; i++) {
        const [x0, y0] = seg.points[i];
        const [x1, y1] = seg.points[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(1, Math.ceil(len / step));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          pushPoint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        }
      }
    } else {
      const { start, end, center, direction } = seg;
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
        pushPoint(center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle));
      }
    }
  }

  return points;
}

export function buildGridPositions(map: Heightmap): Float32Array {
  const positions = new Float32Array(map.cols * map.rows * 3);
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const idx = row * map.cols + col;
      const [x, y] = cellCenter(map, col, row);
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = map.heights[idx];
    }
  }
  return positions;
}

export function buildGridIndices(map: Heightmap): Uint32Array {
  const indices: number[] = [];
  for (let row = 0; row < map.rows - 1; row++) {
    for (let col = 0; col < map.cols - 1; col++) {
      const a = row * map.cols + col;
      const b = a + 1;
      const c = a + map.cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return Uint32Array.from(indices);
}
