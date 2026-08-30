// Rough machining-time estimate for arbitrary G-code text (pasted or CAM-generated),
// used by the CNC tab to show total/remaining time while a job is streaming.
// Mirrors GeoCraftBridge's line splitting (`_totalLines`/`_sentLines` count) so the
// index into `cumulativeSec` lines up with the backend's `gcodeProgress.sent` value:
// blank lines and lines starting with ';' are counted but contribute zero time,
// exactly like SendNextLine() skips them without writing to the serial port.

const DEFAULT_RAPID_FEED_RATE = 3000; // mm/min, 加工時間見積もり専用の仮定値 (toolpathStats.ts と同じ)
const INCH_TO_MM = 25.4;

export interface GcodeTimeEstimate {
    totalSec: number;
    // cumulativeSec[i] = estimated seconds elapsed after the (i+1)-th line (1-indexed
    // count, matching gcodeProgress.sent) has been processed.
    cumulativeSec: number[];
}

function stripComments(line: string): string {
    // Grbl-style comments: "(...)" anywhere, or ";" to end of line.
    return line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '');
}

function parseTokens(line: string): Map<string, number> {
    const tokens = new Map<string, number>();
    const re = /([A-Za-z])\s*(-?\d+\.?\d*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        tokens.set(m[1].toUpperCase(), parseFloat(m[2]));
    }
    return tokens;
}

export function estimateGcodeTime(gcode: string, rapidFeedRate: number = DEFAULT_RAPID_FEED_RATE): GcodeTimeEstimate {
    const lines = gcode.split(/[\r\n]+/).filter((l) => l.length > 0);
    const cumulativeSec: number[] = new Array(lines.length);

    let x = 0, y = 0, z = 0;
    let feed = 0;
    let motion: number | null = null; // 0, 1, 2, or 3 (G0/G1/G2/G3)
    let absolute = true; // G90 default
    let unitScale = 1; // G21 (mm) default; G20 (inch) -> 25.4
    let totalSec = 0;

    for (let idx = 0; idx < lines.length; idx++) {
        const raw = lines[idx];
        if (/^\s*$/.test(raw) || raw.trimStart().startsWith(';')) {
            cumulativeSec[idx] = totalSec;
            continue;
        }

        const code = stripComments(raw);
        const tokens = parseTokens(code);

        if (tokens.has('G')) {
            const g = tokens.get('G')!;
            if (g === 90) absolute = true;
            else if (g === 91) absolute = false;
            else if (g === 20) unitScale = INCH_TO_MM;
            else if (g === 21) unitScale = 1;
            else if (g === 0 || g === 1 || g === 2 || g === 3) motion = g;
            else if (g === 4) {
                // Dwell: P is milliseconds (Grbl), a bare P/S without decimals is common too.
                const dwellMs = tokens.get('P');
                const dwellSec = tokens.get('S');
                if (dwellMs !== undefined) totalSec += dwellMs / 1000;
                else if (dwellSec !== undefined) totalSec += dwellSec;
                cumulativeSec[idx] = totalSec;
                continue;
            }
        }
        if (tokens.has('F')) feed = tokens.get('F')! * unitScale;

        const hasXyz = tokens.has('X') || tokens.has('Y') || tokens.has('Z');
        if (!hasXyz || motion === null) {
            cumulativeSec[idx] = totalSec;
            continue;
        }

        const nx = tokens.has('X') ? (absolute ? tokens.get('X')! * unitScale : x + tokens.get('X')! * unitScale) : x;
        const ny = tokens.has('Y') ? (absolute ? tokens.get('Y')! * unitScale : y + tokens.get('Y')! * unitScale) : y;
        const nz = tokens.has('Z') ? (absolute ? tokens.get('Z')! * unitScale : z + tokens.get('Z')! * unitScale) : z;

        let distance: number;
        if (motion === 2 || motion === 3) {
            const i = (tokens.get('I') ?? 0) * unitScale;
            const j = (tokens.get('J') ?? 0) * unitScale;
            const cx = x + i, cy = y + j;
            const radius = Math.hypot(x - cx, y - cy);
            let arcLenXY: number;
            if (radius < 1e-9) {
                arcLenXY = 0;
            } else if (Math.hypot(nx - x, ny - y) < 1e-6) {
                // Start === end: full circle.
                arcLenXY = 2 * Math.PI * radius;
            } else {
                const startAngle = Math.atan2(y - cy, x - cx);
                let endAngle = Math.atan2(ny - cy, nx - cx);
                if (motion === 2) {
                    while (endAngle > startAngle) endAngle -= 2 * Math.PI;
                } else {
                    while (endAngle < startAngle) endAngle += 2 * Math.PI;
                }
                arcLenXY = Math.abs(endAngle - startAngle) * radius;
            }
            distance = Math.hypot(arcLenXY, nz - z);
        } else {
            distance = Math.hypot(nx - x, ny - y, nz - z);
        }

        if (motion === 0) {
            if (rapidFeedRate > 0) totalSec += (distance / rapidFeedRate) * 60;
        } else if (feed > 0) {
            totalSec += (distance / feed) * 60;
        }

        x = nx; y = ny; z = nz;
        cumulativeSec[idx] = totalSec;
    }

    return { totalSec, cumulativeSec };
}
