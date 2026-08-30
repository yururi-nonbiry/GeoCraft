// 生成順(輪郭=図形ループ単位、ポケット=同心オフセットリング単位、3D荒加工=Zレベル単位)のまま
// 出力されているツールパスを、無駄なリトラクト/移動が減るよう並べ替える。
//
// 安全のため、Z値を持つセグメント(3D荒加工)は元のZレベル順(浅い→深い、生成時の配列順)を
// 保ったまま、同一Zレベル内でのみ最近傍法により並べ替える。層をまたいだ並べ替えは、まだ
// 削っていない上の層を突き抜けて工具を進入させる恐れがあるため行わない。
// Z値を持たないセグメント(2.5D輪郭/ポケット)は単一の深さパスとみなし、全体をまとめて
// 並べ替える。

import { ToolpathSegment } from './types';

const Z_EPSILON = 1e-3;
const CLOSE_EPSILON = 1e-6;

function segStart(seg: ToolpathSegment): number[] {
    return seg.type === 'line' ? seg.points[0] : seg.start;
}

function segEnd(seg: ToolpathSegment): number[] {
    return seg.type === 'line' ? seg.points[seg.points.length - 1] : seg.end;
}

function representativeZ(seg: ToolpathSegment): number | null {
    const p = segStart(seg);
    return p.length > 2 ? p[2] : null;
}

function distance(a: number[], b: number[]): number {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = (a[2] ?? 0) - (b[2] ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 閉ループ(始点=終点)は反転しても位置関係が変わらず、切削方向(climb/conventional)だけが
// 変わってしまうため反転候補にしない。始点と終点が離れている開いた断片のみ反転を検討する。
function reverseSegment(seg: ToolpathSegment): ToolpathSegment {
    if (seg.type === 'line') {
        return { type: 'line', points: [...seg.points].reverse() };
    }
    return { type: 'arc', start: seg.end, end: seg.start, center: seg.center, direction: seg.direction === 'cw' ? 'ccw' : 'cw' };
}

// 貪欲法(最近傍法)で1グループ内のセグメント順を決める。O(n^2)だが、1回のツールパス生成で
// 生じるループ/リング数の範囲では実用上問題ない。
function nearestNeighborOrder(group: ToolpathSegment[], startPos: number[] | null): ToolpathSegment[] {
    const remaining = group.map((seg) => ({ seg, used: false }));
    const ordered: ToolpathSegment[] = [];
    let pos = startPos;

    for (let count = 0; count < remaining.length; count++) {
        let bestIdx = -1;
        let bestReversed = false;
        let bestDist = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].used) continue;
            const seg = remaining[i].seg;
            if (pos === null) {
                bestIdx = i;
                bestReversed = false;
                break;
            }
            const start = segStart(seg);
            const end = segEnd(seg);
            const closed = distance(start, end) < CLOSE_EPSILON;

            const dStart = distance(pos, start);
            if (dStart < bestDist) {
                bestDist = dStart;
                bestIdx = i;
                bestReversed = false;
            }
            if (!closed) {
                const dEnd = distance(pos, end);
                if (dEnd < bestDist) {
                    bestDist = dEnd;
                    bestIdx = i;
                    bestReversed = true;
                }
            }
        }

        const chosen = remaining[bestIdx].seg;
        remaining[bestIdx].used = true;
        const finalSeg = bestReversed ? reverseSegment(chosen) : chosen;
        ordered.push(finalSeg);
        pos = segEnd(finalSeg);
    }

    return ordered;
}

export function optimizeToolpathOrder(segments: ToolpathSegment[]): ToolpathSegment[] {
    if (segments.length <= 2) return segments;

    // 元の配列順に連続する同一Zレベル(2D区間はZなし単一グループ)ごとに分割する。
    // 3D荒加工は生成時点で既にZレベルごとに連続して並んでいるため、この分割で
    // 各Zレベルの範囲がそのまま切り出せる。
    const groups: ToolpathSegment[][] = [];
    let currentGroup: ToolpathSegment[] = [];
    let currentZ: number | null = null;

    for (const seg of segments) {
        const z = representativeZ(seg);
        const sameGroup =
            currentGroup.length === 0 ||
            (currentZ === null && z === null) ||
            (currentZ !== null && z !== null && Math.abs(currentZ - z) < Z_EPSILON);
        if (!sameGroup) {
            groups.push(currentGroup);
            currentGroup = [];
        }
        currentGroup.push(seg);
        currentZ = z;
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    const result: ToolpathSegment[] = [];
    let currentPos: number[] | null = null;
    for (const group of groups) {
        const ordered = nearestNeighborOrder(group, currentPos);
        result.push(...ordered);
        if (ordered.length > 0) currentPos = segEnd(ordered[ordered.length - 1]);
    }
    return result;
}
