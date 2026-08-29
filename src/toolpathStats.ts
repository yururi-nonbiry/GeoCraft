import { ToolpathSegment } from './types';

export interface ToolpathStatsParams {
    feedRate: number; // mm/min, 切削送り
    safeZ: number;
    retractZ: number;
    stepDown: number;
    // G0(早送り)の実速度はGRBL側の設定($110-$112)でありこのアプリでは保持していないため、
    // 加工時間の見積もり専用の仮定値として扱う。
    rapidFeedRate?: number;
}

export interface ToolpathStats {
    cuttingDistanceMm: number;
    rapidDistanceMm: number;
    totalDistanceMm: number;
    timeSec: number;
}

const DEFAULT_RAPID_FEED_RATE = 3000; // mm/min, 加工時間見積もり専用の仮定値

function isClose(a: number[], b: number[]): boolean {
    return Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;
}

function isSameZ(a: number[], b: number[]): boolean {
    if (a.length <= 2 || b.length <= 2) return true;
    return Math.abs(a[2] - b[2]) < 1e-4;
}

// GcodeService.cs の GenerateGcode と同じ移動シーケンス(退避 -> 位置決め -> 突込み -> 切削)を
// たどって移動距離・加工時間を見積もる。実際に出力されるGコードの挙動と一致させるため、
// 分岐条件やZ深さの扱い(2要素の点はstepDown固定、3要素はその点のZを使う)もそちらに合わせている。
export function computeToolpathStats(segments: ToolpathSegment[], params: ToolpathStatsParams): ToolpathStats {
    const { feedRate, safeZ, retractZ, stepDown } = params;
    const rapidFeedRate = params.rapidFeedRate ?? DEFAULT_RAPID_FEED_RATE;

    let cuttingDistance = 0;
    let rapidDistance = 0;
    let cuttingMinutes = 0;
    let rapidMinutes = 0;

    let currentXy: number[] | null = null;
    let currentZ = safeZ;
    let isCutting = false;

    const addRapid = (dist: number) => {
        if (dist <= 0) return;
        rapidDistance += dist;
        if (rapidFeedRate > 0) rapidMinutes += dist / rapidFeedRate;
    };
    const addCut = (dist: number, feed: number) => {
        if (dist <= 0) return;
        cuttingDistance += dist;
        if (feed > 0) cuttingMinutes += dist / feed;
    };

    for (const segment of segments) {
        const start = segment.type === 'line' ? segment.points[0] : segment.start;
        if (!start || start.length < 2) continue;
        const startZ = start.length > 2 ? start[2] : stepDown;

        if (currentXy === null || !isClose(currentXy, start) || !isSameZ(currentXy, start)) {
            if (isCutting) {
                addRapid(Math.abs(currentZ - retractZ));
                currentZ = retractZ;
                isCutting = false;
            }
            if (currentXy !== null) {
                addRapid(Math.hypot(start[0] - currentXy[0], start[1] - currentXy[1]));
            }
            currentXy = [start[0], start[1]];
            addCut(Math.abs(currentZ - startZ), feedRate / 2);
            currentZ = startZ;
            isCutting = true;
        } else if (!isCutting) {
            addCut(Math.abs(currentZ - startZ), feedRate / 2);
            currentZ = startZ;
            isCutting = true;
        }

        if (segment.type === 'arc') {
            const { end, center, direction } = segment;
            const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
            const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
            let endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);
            if (direction === 'cw') {
                while (endAngle > startAngle) endAngle -= Math.PI * 2;
            } else {
                while (endAngle < startAngle) endAngle += Math.PI * 2;
            }
            const arcLenXY = Math.abs(endAngle - startAngle) * radius;
            const endZ = end.length > 2 ? end[2] : currentZ;
            const dist = Math.hypot(arcLenXY, endZ - currentZ);
            addCut(dist, feedRate);
            currentXy = end;
            currentZ = endZ;
        } else {
            const points = segment.points;
            for (let k = 1; k < points.length; k++) {
                const pt = points[k];
                const prevXy = currentXy!;
                const dz = pt.length > 2 ? pt[2] - currentZ : 0;
                const dist = Math.hypot(pt[0] - prevXy[0], pt[1] - prevXy[1], dz);
                addCut(dist, feedRate);
                currentXy = pt;
                if (pt.length > 2) currentZ = pt[2];
            }
        }
    }

    if (isCutting) {
        addRapid(Math.abs(currentZ - safeZ));
    }

    return {
        cuttingDistanceMm: cuttingDistance,
        rapidDistanceMm: rapidDistance,
        totalDistanceMm: cuttingDistance + rapidDistance,
        timeSec: (cuttingMinutes + rapidMinutes) * 60,
    };
}
