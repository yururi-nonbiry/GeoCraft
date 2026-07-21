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
// 斜め/曲線の切削境界のガタガタを抑えるため、セルサイズ自体を小さくする方向で
// 300から引き上げた値。面取り(classifyCorner等)と併用することで、階段の1段が
// 小さくなった上にさらに角が斜めに均されるため、体感の滑らかさは相乗的に向上する。
// セル数はこの値のN倍でN²倍になる点に注意(大きいストックほど負荷が増える)。
const MAX_GRID_CELLS = 600;
const MIN_CELL_SIZE = 0.2;
// STLメッシュへの下方向レイキャストで高さマップを構築する際のグリッド上限。
// 通常のヒートマップ(MAX_GRID_CELLS=600)より粗くしているのは、
// アクセラレーション構造を持たない Three.js の Raycaster で セル数×三角形数 の総当たりになり、
// セル数を増やすほど大きなSTLで著しく遅くなるため。
const MAX_GRID_CELLS_STL = 240;

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

// 内部グリッド頂点(セル4つが接する角)における、周囲4象限のセルの呼び方。
// UR=(vcol,vrow)自身のセル、UL=左隣、DR=下隣、DL=左下斜め隣。
export type CornerQuadrant = 'UL' | 'UR' | 'DL' | 'DR';

// 高さが「同じ」とみなす許容誤差。ランプ加工などでZが連続的に変化する経路でも、
// 実用上意味のある段差だけを面取り対象として検出するための閾値。
const CORNER_HEIGHT_EPS = 1e-4;

function quadrantCellIdx(map: Heightmap, vcol: number, vrow: number, quadrant: CornerQuadrant): number {
  const { cols } = map;
  switch (quadrant) {
    case 'UR': return vrow * cols + vcol;
    case 'UL': return vrow * cols + (vcol - 1);
    case 'DR': return (vrow - 1) * cols + vcol;
    case 'DL': return (vrow - 1) * cols + (vcol - 1);
  }
}

// 内部グリッド頂点(col=1..cols-1, row=1..rows-1)を、周囲4セルの高さから分類する。
// 3セルが同じ高さ・1セルだけ異なる(3対1)の場合のみ、その少数派セルの象限を返し
// 面取り対象とする。全て同じ/2対2(直線境界・鞍点)/3種類以上は null とし、
// 現状通りシャープな角のままにする(2対2は既存の垂直壁で正しく表現できており、
// 鞍点は面取り方向が幾何学的に曖昧なため安全側でスキップする)。
export function classifyCorner(map: Heightmap, vcol: number, vrow: number): CornerQuadrant | null {
  if (vcol <= 0 || vcol >= map.cols || vrow <= 0 || vrow >= map.rows) return null;

  const quadrants: CornerQuadrant[] = ['UR', 'UL', 'DR', 'DL'];
  const groups: { height: number; members: CornerQuadrant[] }[] = [];
  for (const q of quadrants) {
    const h = map.heights[quadrantCellIdx(map, vcol, vrow, q)];
    const g = groups.find((g) => Math.abs(g.height - h) <= CORNER_HEIGHT_EPS);
    if (g) g.members.push(q);
    else groups.push({ height: h, members: [q] });
  }

  if (groups.length !== 2) return null;
  const minority = groups.find((g) => g.members.length === 1);
  return minority ? minority.members[0] : null;
}

// 頂点(vcol,vrow)における面取りが、セル idxA/idxB のどちらかを少数派としているかどうか。
// buildInteriorWallPositions で、セル境界壁の両端を面取り分だけtrimすべきか判定するのに使う。
function isMinorityAtVertex(map: Heightmap, vcol: number, vrow: number, idxA: number, idxB: number): boolean {
  const q = classifyCorner(map, vcol, vrow);
  if (!q) return false;
  const minorityIdx = quadrantCellIdx(map, vcol, vrow, q);
  return minorityIdx === idxA || minorityIdx === idxB;
}

interface CellChamferInfo {
  blIn: [number, number]; blOut: [number, number];
  brIn: [number, number]; brOut: [number, number];
  trIn: [number, number]; trOut: [number, number];
  tlIn: [number, number]; tlOut: [number, number];
}

// セル(col,row)の4隅について、面取りされている場合はその隅を隣接2辺の中点まで
// 引っ込めた位置を、されていない場合は元の隅の位置をそのまま返す。
// セル自身の4隅は、それぞれ独自のグリッド頂点における次の象限に対応する:
// 左下角→頂点(col,row)のUR、右下角→頂点(col+1,row)のUL、
// 右上角→頂点(col+1,row+1)のDL、左上角→頂点(col,row+1)のDR。
function computeCellChamfer(map: Heightmap, col: number, row: number): CellChamferInfo {
  const { cellSize, originX, originY } = map;
  const x0 = originX + col * cellSize;
  const x1 = x0 + cellSize;
  const y0 = originY + row * cellSize;
  const y1 = y0 + cellSize;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;

  const chamferBL = classifyCorner(map, col, row) === 'UR';
  const chamferBR = classifyCorner(map, col + 1, row) === 'UL';
  const chamferTR = classifyCorner(map, col + 1, row + 1) === 'DL';
  const chamferTL = classifyCorner(map, col, row + 1) === 'DR';

  return {
    blIn: chamferBL ? [x0, midY] : [x0, y0],
    blOut: chamferBL ? [midX, y0] : [x0, y0],
    brIn: chamferBR ? [midX, y0] : [x1, y0],
    brOut: chamferBR ? [x1, midY] : [x1, y0],
    trIn: chamferTR ? [x1, midY] : [x1, y1],
    trOut: chamferTR ? [midX, y1] : [x1, y1],
    tlIn: chamferTL ? [midX, y1] : [x0, y1],
    tlOut: chamferTL ? [x0, midY] : [x0, y1],
  };
}

// トップメッシュを、セル中心同士を結ぶ滑らかなグリッド(旧実装)ではなく、
// セル1個ずつを独立した平らなタイル(セルの外形そのままの正方形)として構築する。
// 旧実装はセルの高さが異なる箇所を必ず「1セル分の水平距離のなだらかな斜面」として
// 補間してしまい、垂直な切削壁が斜めのテーパーに見える原因になっていた。
// タイルを独立させ、セル境界をそのままセルの外形とすることで、面自体には一切傾斜が
// 生じなくなる(高さの変化はセル間の垂直な壁として buildInteriorWallPositions が別途埋める)。
//
// 各セルは中心1頂点+外周8頂点(4隅×2、面取りされていない隅は同一点に重複)の
// 固定9頂点・8三角形ファンとして構築する。面取りされていない隅は退化三角形
// (面積0)になるだけで見た目は通常の正方形と変わらない。面取りされている隅は
// 三角形が消え、代わりに斜めにカットされた輪郭になる(空いた分は
// buildChamferPositions が生成するキャップ三角形・斜め壁で埋める)。
export function buildTopTilePositions(map: Heightmap): TopTileGeometryData {
  const { cols, rows, cellSize, originX, originY, heights } = map;
  const positions: number[] = [];
  const indices: number[] = [];
  const vertexIndicesByCell = new Map<number, number[]>();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const z = heights[idx];
      const cx = originX + (col + 0.5) * cellSize;
      const cy = originY + (row + 0.5) * cellSize;
      const c = computeCellChamfer(map, col, row);
      const perimeter: [number, number][] = [c.blIn, c.blOut, c.brIn, c.brOut, c.trIn, c.trOut, c.tlIn, c.tlOut];

      const base = positions.length / 3;
      positions.push(cx, cy, z);
      for (const [px, py] of perimeter) positions.push(px, py, z);

      const vIdxs = [base];
      for (let i = 0; i < 8; i++) {
        const a = base + 1 + i;
        const b = base + 1 + ((i + 1) % 8);
        indices.push(base, a, b);
        vIdxs.push(a);
      }
      vertexIndicesByCell.set(idx, vIdxs);
    }
  }

  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), vertexIndicesByCell };
}

// buildTopTilePositions で生成した固定9頂点ファンのXY・Zを、現在のheightsと面取り
// 判定に基づいて再計算する。面取りの有無は切削の進行(周囲セルの高さ変化)で
// 動的に変わり、対象セル自身の高さが変わっていなくても再分類が必要になるため、
// dirty regionを四方に1セル分広げた範囲のセルを対象にする。
export function updateTopTilePositions(
  map: Heightmap,
  posAttr: { setXYZ(index: number, x: number, y: number, z: number): void },
  vertexIndicesByCell: Map<number, number[]>,
  dirty: DirtyRegion,
): void {
  const minCol = Math.max(0, dirty.minCol - 1);
  const maxCol = Math.min(map.cols - 1, dirty.maxCol + 1);
  const minRow = Math.max(0, dirty.minRow - 1);
  const maxRow = Math.min(map.rows - 1, dirty.maxRow + 1);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const idx = row * map.cols + col;
      const vIdxs = vertexIndicesByCell.get(idx);
      if (!vIdxs) continue;
      const z = map.heights[idx];
      const cx = map.originX + (col + 0.5) * map.cellSize;
      const cy = map.originY + (row + 0.5) * map.cellSize;
      const c = computeCellChamfer(map, col, row);
      const perimeter: [number, number][] = [c.blIn, c.blOut, c.brIn, c.brOut, c.trIn, c.trOut, c.tlIn, c.tlOut];

      posAttr.setXYZ(vIdxs[0], cx, cy, z);
      for (let i = 0; i < 8; i++) {
        const [px, py] = perimeter[i];
        posAttr.setXYZ(vIdxs[i + 1], px, py, z);
      }
    }
  }
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

export interface WallSegment {
  x0: number; y0: number; x1: number; y1: number;
  idxA: number; idxB: number;
  startVCol: number; startVRow: number;
  endVCol: number; endVRow: number;
  base: number;
}

export interface InteriorWallGeometryData {
  positions: Float32Array;
  walls: WallSegment[];
}

// セル境界壁の6頂点(三角形2枚)を計算する。面取りされた頂点に接する側は、
// その頂点から半セル分(=面取りの引っ込み量と同じ距離)だけtrimし、
// buildTopTilePositions側で短くなったセル外形の辺と壁の端が一致するようにする。
function computeWallQuadPoints(
  map: Heightmap,
  x0: number, y0: number, x1: number, y1: number,
  idxA: number, idxB: number,
  trimStart: boolean, trimEnd: boolean,
): number[] {
  const trim = map.cellSize / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = trimStart ? x0 + ux * trim : x0;
  const sy = trimStart ? y0 + uy * trim : y0;
  const ex = trimEnd ? x1 - ux * trim : x1;
  const ey = trimEnd ? y1 - uy * trim : y1;
  const hA = map.heights[idxA];
  const hB = map.heights[idxB];

  return [
    sx, sy, hA, ex, ey, hA, ex, ey, hB,
    ex, ey, hB, sx, sy, hB, sx, sy, hA,
  ];
}

// トップメッシュは独立した平らなタイルの集まりになったため(buildTopTilePositions参照)、
// 高さの異なる隣接セル同士の間には面が存在せず、隙間が空いてしまう。このセル境界に、
// 隣接する2セルの高さをそのまま結ぶ垂直な壁を追加し、その隙間を塞ぐ。
// 高さが同じセル同士では壁の上端と下端が同じ高さになり、面積ゼロの壁として実質的に
// 描画されない。
// 壁の両端が面取りされた頂点に接する場合は、その端をtrimして短くする
// (面取りされた分は buildChamferPositions が生成する斜め壁が埋める)。
export function buildInteriorWallPositions(map: Heightmap): InteriorWallGeometryData {
  const { cols, rows, cellSize, originX, originY } = map;
  const positions: number[] = [];
  const walls: WallSegment[] = [];

  // 水平方向に隣接するセルの境界(縦の壁): (col,row)-(col+1,row)
  for (let row = 0; row < rows; row++) {
    const y0 = originY + row * cellSize;
    const y1 = y0 + cellSize;
    for (let col = 0; col < cols - 1; col++) {
      const x = originX + (col + 1) * cellSize;
      const idxA = row * cols + col;
      const idxB = row * cols + col + 1;
      const startVCol = col + 1, startVRow = row;
      const endVCol = col + 1, endVRow = row + 1;
      const trimStart = isMinorityAtVertex(map, startVCol, startVRow, idxA, idxB);
      const trimEnd = isMinorityAtVertex(map, endVCol, endVRow, idxA, idxB);
      const base = positions.length / 3;
      positions.push(...computeWallQuadPoints(map, x, y0, x, y1, idxA, idxB, trimStart, trimEnd));
      walls.push({ x0: x, y0, x1: x, y1, idxA, idxB, startVCol, startVRow, endVCol, endVRow, base });
    }
  }

  // 垂直方向に隣接するセルの境界(横の壁): (col,row)-(col,row+1)
  for (let col = 0; col < cols; col++) {
    const x0 = originX + col * cellSize;
    const x1 = x0 + cellSize;
    for (let row = 0; row < rows - 1; row++) {
      const y = originY + (row + 1) * cellSize;
      const idxA = row * cols + col;
      const idxB = (row + 1) * cols + col;
      const startVCol = col, startVRow = row + 1;
      const endVCol = col + 1, endVRow = row + 1;
      const trimStart = isMinorityAtVertex(map, startVCol, startVRow, idxA, idxB);
      const trimEnd = isMinorityAtVertex(map, endVCol, endVRow, idxA, idxB);
      const base = positions.length / 3;
      positions.push(...computeWallQuadPoints(map, x0, y, x1, y, idxA, idxB, trimStart, trimEnd));
      walls.push({ x0, y0: y, x1, y1: y, idxA, idxB, startVCol, startVRow, endVCol, endVRow, base });
    }
  }

  return { positions: Float32Array.from(positions), walls };
}

// buildInteriorWallPositions で生成した壁のうち、dirty region(四方に1セル分広げた範囲)
// 内のセルに接する壁だけを対象に、trim状態も含めて頂点位置を再計算する。
export function updateInteriorWallPositions(
  map: Heightmap,
  posAttr: { setXYZ(index: number, x: number, y: number, z: number): void },
  walls: WallSegment[],
  dirty: DirtyRegion,
): void {
  const minCol = Math.max(0, dirty.minCol - 1);
  const maxCol = Math.min(map.cols - 1, dirty.maxCol + 1);
  const minRow = Math.max(0, dirty.minRow - 1);
  const maxRow = Math.min(map.rows - 1, dirty.maxRow + 1);
  const { cols } = map;

  const inRange = (idx: number) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    return c >= minCol && c <= maxCol && r >= minRow && r <= maxRow;
  };

  for (const wall of walls) {
    if (!inRange(wall.idxA) && !inRange(wall.idxB)) continue;
    const trimStart = isMinorityAtVertex(map, wall.startVCol, wall.startVRow, wall.idxA, wall.idxB);
    const trimEnd = isMinorityAtVertex(map, wall.endVCol, wall.endVRow, wall.idxA, wall.idxB);
    const pts = computeWallQuadPoints(map, wall.x0, wall.y0, wall.x1, wall.y1, wall.idxA, wall.idxB, trimStart, trimEnd);
    for (let i = 0; i < 6; i++) {
      posAttr.setXYZ(wall.base + i, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    }
  }
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

// buildTopTilePositions/buildInteriorWallPositions で面取りされた隅の分だけ、
// トップサーフェスに隙間が空く。ここに、多数派の高さで埋める小さな三角形
// (キャップ)と、キャップ〜少数派セルの間を結ぶ斜めの垂直壁を追加して隙間を塞ぐ。
// 面取りされていない内部頂点では、9頂点すべてを同一点に縮退させ
// (面積0の三角形3枚)、何も描画しない。
const CHAMFER_VERTS_PER_SLOT = 9;

function chamferSlotIndex(map: Heightmap, vcol: number, vrow: number): number {
  return (vrow - 1) * (map.cols - 1) + (vcol - 1);
}

// 面取り象限qにおける、キャップ/斜め壁で使う2つの引っ込み点(V基準)と、
// それらの高さの基準となる多数派側の象限を返す。
function chamferOffsets(
  q: CornerQuadrant,
  Vx: number,
  Vy: number,
  half: number,
): { inPt: [number, number]; outPt: [number, number]; majority: CornerQuadrant } {
  if (q === 'UR') return { inPt: [Vx, Vy + half], outPt: [Vx + half, Vy], majority: 'DL' };
  if (q === 'UL') return { inPt: [Vx - half, Vy], outPt: [Vx, Vy + half], majority: 'DR' };
  if (q === 'DR') return { inPt: [Vx + half, Vy], outPt: [Vx, Vy - half], majority: 'UL' };
  return { inPt: [Vx, Vy - half], outPt: [Vx - half, Vy], majority: 'UR' };
}

function computeChamferSlotPoints(map: Heightmap, vcol: number, vrow: number): number[] {
  const Vx = map.originX + vcol * map.cellSize;
  const Vy = map.originY + vrow * map.cellSize;
  const q = classifyCorner(map, vcol, vrow);

  if (!q) {
    // 面取りなし: 9頂点すべてを同一点に縮退させ、面積ゼロにする(どの高さを使っても
    // 描画結果に影響しないが、便宜上DL象限の高さを使う)。
    const h = map.heights[quadrantCellIdx(map, vcol, vrow, 'DL')];
    const p = [Vx, Vy, h];
    return [...p, ...p, ...p, ...p, ...p, ...p, ...p, ...p, ...p];
  }

  const half = map.cellSize / 2;
  const { inPt, outPt, majority } = chamferOffsets(q, Vx, Vy, half);
  const hA = map.heights[quadrantCellIdx(map, vcol, vrow, majority)];
  const hB = map.heights[quadrantCellIdx(map, vcol, vrow, q)];

  return [
    // キャップ三角形(多数派の高さhAで、少数派セルが引っ込めた分の隙間を埋める)
    Vx, Vy, hA, outPt[0], outPt[1], hA, inPt[0], inPt[1], hA,
    // キャップ〜少数派セルを結ぶ斜めの垂直壁
    inPt[0], inPt[1], hA, outPt[0], outPt[1], hA, outPt[0], outPt[1], hB,
    outPt[0], outPt[1], hB, inPt[0], inPt[1], hB, inPt[0], inPt[1], hA,
  ];
}

export function buildChamferPositions(map: Heightmap): Float32Array {
  const count = Math.max(0, map.cols - 1) * Math.max(0, map.rows - 1);
  const positions = new Float32Array(count * CHAMFER_VERTS_PER_SLOT * 3);
  for (let vrow = 1; vrow < map.rows; vrow++) {
    for (let vcol = 1; vcol < map.cols; vcol++) {
      const base = chamferSlotIndex(map, vcol, vrow) * CHAMFER_VERTS_PER_SLOT * 3;
      positions.set(computeChamferSlotPoints(map, vcol, vrow), base);
    }
  }
  return positions;
}

export function buildChamferIndices(map: Heightmap): Uint32Array {
  const count = Math.max(0, map.cols - 1) * Math.max(0, map.rows - 1);
  const indices = new Uint32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const base = i * CHAMFER_VERTS_PER_SLOT;
    let o = i * 9;
    indices[o++] = base; indices[o++] = base + 1; indices[o++] = base + 2;
    indices[o++] = base + 3; indices[o++] = base + 4; indices[o++] = base + 5;
    indices[o++] = base + 6; indices[o++] = base + 7; indices[o++] = base + 8;
  }
  return indices;
}

// dirty regionを四方に1セル分広げた範囲に接する内部グリッド頂点だけを対象に、
// キャップ・斜め壁の頂点位置を再計算する。
export function updateChamferPositions(
  map: Heightmap,
  posAttr: { setXYZ(index: number, x: number, y: number, z: number): void },
  dirty: DirtyRegion,
): void {
  const minCol = Math.max(0, dirty.minCol - 1);
  const maxCol = Math.min(map.cols - 1, dirty.maxCol + 1);
  const minRow = Math.max(0, dirty.minRow - 1);
  const maxRow = Math.min(map.rows - 1, dirty.maxRow + 1);
  const minVCol = Math.max(1, minCol);
  const maxVCol = Math.min(map.cols - 1, maxCol + 1);
  const minVRow = Math.max(1, minRow);
  const maxVRow = Math.min(map.rows - 1, maxRow + 1);

  for (let vrow = minVRow; vrow <= maxVRow; vrow++) {
    for (let vcol = minVCol; vcol <= maxVCol; vcol++) {
      const base = chamferSlotIndex(map, vcol, vrow) * CHAMFER_VERTS_PER_SLOT;
      const pts = computeChamferSlotPoints(map, vcol, vrow);
      for (let i = 0; i < CHAMFER_VERTS_PER_SLOT; i++) {
        posAttr.setXYZ(base + i, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      }
    }
  }
}
