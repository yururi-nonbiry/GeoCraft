import { parse } from 'svg-parser';

// Shared types (can be moved to types.ts later if needed, but for now we redefined minimal needed here or import from types.ts if we want to share with renderer)
// However, main.ts runs in Node, types.ts is likely used by frontend. Let's keep it simple.
type Segment = { points: [[number, number, number], [number, number, number]]; color: string };

function parsePoints(pointsStr: string): [number, number][] {
    return pointsStr.split(/[\s,]+/).filter(p => p).reduce((acc, val, i, arr) => {
        if (i % 2 === 0 && arr[i + 1] !== undefined) acc.push([parseFloat(val), parseFloat(arr[i + 1])]);
        return acc;
    }, [] as [number, number][]);
}

// Bezier curve helpers
const getQuadraticBezierPoint = (t: number, p0: number, p1: number, p2: number) => Math.pow(1 - t, 2) * p0 + 2 * (1 - t) * t * p1 + Math.pow(t, 2) * p2;
const getCubicBezierPoint = (t: number, p0: number, p1: number, p2: number, p3: number) => Math.pow(1 - t, 3) * p0 + 3 * Math.pow(1 - t, 2) * t * p1 + 3 * (1 - t) * t * t * p2 + Math.pow(t, 3) * p3;

function parsePathData(d: string, color: string): Segment[] {
    const pathSegments: Segment[] = [];
    const commands = d.match(/[MmLlHhVvQqCcSsTtZz][^MmLlHhVvQqCcSsTtZz]*/g) || [];
    let currentX = 0, currentY = 0, startX = 0, startY = 0;
    let lastCommand = '', lastControlX = 0, lastControlY = 0;

    const addSegment = (p1: [number, number], p2: [number, number]) => {
        pathSegments.push({ points: [[p1[0], -p1[1], 0], [p2[0], -p2[1], 0]], color });
    };

    for (const commandStr of commands) {
        const command = commandStr[0];
        const args = (commandStr.substring(1).match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || []).map(parseFloat);

        switch (command) {
            case 'M':
                [currentX, currentY] = [args[0], args[1]];
                [startX, startY] = [currentX, currentY];
                for (let i = 2; i < args.length; i += 2) {
                    addSegment([currentX, currentY], [args[i], args[i + 1]]);
                    [currentX, currentY] = [args[i], args[i + 1]];
                }
                break;
            case 'm':
                currentX += args[0];
                currentY += args[1];
                [startX, startY] = [currentX, currentY];
                for (let i = 2; i < args.length; i += 2) {
                    addSegment([currentX, currentY], [currentX + args[i], currentY + args[i + 1]]);
                    currentX += args[i];
                    currentY += args[i + 1];
                }
                break;
            case 'L':
                for (let i = 0; i < args.length; i += 2) {
                    addSegment([currentX, currentY], [args[i], args[i + 1]]);
                    [currentX, currentY] = [args[i], args[i + 1]];
                }
                break;
            case 'l':
                for (let i = 0; i < args.length; i += 2) {
                    addSegment([currentX, currentY], [currentX + args[i], currentY + args[i + 1]]);
                    currentX += args[i];
                    currentY += args[i + 1];
                }
                break;
            case 'H':
                for (const arg of args) {
                    addSegment([currentX, currentY], [arg, currentY]);
                    currentX = arg;
                }
                break;
            case 'h':
                for (const arg of args) {
                    addSegment([currentX, currentY], [currentX + arg, currentY]);
                    currentX += arg;
                }
                break;
            case 'V':
                for (const arg of args) {
                    addSegment([currentX, currentY], [currentX, arg]);
                    currentY = arg;
                }
                break;
            case 'v':
                for (const arg of args) {
                    addSegment([currentX, currentY], [currentX, currentY + arg]);
                    currentY += arg;
                }
                break;
            case 'Z': case 'z':
                addSegment([currentX, currentY], [startX, startY]);
                [currentX, currentY] = [startX, startY];
                break;

            case 'Q':
                for (let i = 0; i < args.length; i += 4) {
                    const x1 = args[i], y1 = args[i + 1], x2 = args[i + 2], y2 = args[i + 3];
                    const divisions = 16;
                    for (let j = 0; j < divisions; j++) {
                        const t1 = j / divisions, t2 = (j + 1) / divisions;
                        addSegment(
                            [getQuadraticBezierPoint(t1, currentX, x1, x2), getQuadraticBezierPoint(t1, currentY, y1, y2)],
                            [getQuadraticBezierPoint(t2, currentX, x1, x2), getQuadraticBezierPoint(t2, currentY, y1, y2)]
                        );
                    }
                    [currentX, currentY] = [x2, y2];
                    [lastControlX, lastControlY] = [x1, y1];
                }
                break;
            case 'q':
                for (let i = 0; i < args.length; i += 4) {
                    const x1 = currentX + args[i], y1 = currentY + args[i + 1], x2 = currentX + args[i + 2], y2 = currentY + args[i + 3];
                    const divisions = 16;
                    for (let j = 0; j < divisions; j++) {
                        const t1 = j / divisions, t2 = (j + 1) / divisions;
                        addSegment(
                            [getQuadraticBezierPoint(t1, currentX, x1, x2), getQuadraticBezierPoint(t1, currentY, y1, y2)],
                            [getQuadraticBezierPoint(t2, currentX, x1, x2), getQuadraticBezierPoint(t2, currentY, y1, y2)]
                        );
                    }
                    [currentX, currentY] = [x2, y2];
                    [lastControlX, lastControlY] = [x1, y1];
                }
                break;
            case 'T':
                for (let i = 0; i < args.length; i += 2) {
                    const endX = args[i], endY = args[i + 1];
                    const controlX = 'QqTt'.includes(lastCommand) ? 2 * currentX - lastControlX : currentX;
                    const controlY = 'QqTt'.includes(lastCommand) ? 2 * currentY - lastControlY : currentY;
                    const divisions = 16;
                    for (let j = 0; j < divisions; j++) {
                        const t1 = j / divisions, t2 = (j + 1) / divisions;
                        addSegment(
                            [getQuadraticBezierPoint(t1, currentX, controlX, endX), getQuadraticBezierPoint(t1, currentY, controlY, endY)],
                            [getQuadraticBezierPoint(t2, currentX, controlX, endX), getQuadraticBezierPoint(t2, currentY, controlY, endY)]
                        );
                    }
                    [currentX, currentY] = [endX, endY];
                    [lastControlX, lastControlY] = [controlX, controlY];
                }
                break;
            case 't':
                for (let i = 0; i < args.length; i += 2) {
                    const endX = currentX + args[i], endY = currentY + args[i + 1];
                    const controlX = 'QqTt'.includes(lastCommand) ? 2 * currentX - lastControlX : currentX;
                    const controlY = 'QqTt'.includes(lastCommand) ? 2 * currentY - lastControlY : currentY;
                    const divisions = 16;
                    for (let j = 0; j < divisions; j++) {
                        const t1 = j / divisions, t2 = (j + 1) / divisions;
                        addSegment(
                            [getQuadraticBezierPoint(t1, currentX, controlX, endX), getQuadraticBezierPoint(t1, currentY, controlY, endY)],
                            [getQuadraticBezierPoint(t2, currentX, controlX, endX), getQuadraticBezierPoint(t2, currentY, controlY, endY)]
                        );
                    }
                    [currentX, currentY] = [endX, endY];
                    [lastControlX, lastControlY] = [controlX, controlY];
                }
                break;
            case 'C':
                for (let i = 0; i < args.length; i += 6) {
                    const x1 = args[i], y1 = args[i + 1], x2 = args[i + 2], y2 = args[i + 3], x3 = args[i + 4], y3 = args[i + 5];
                    const divisions = 16;
                    for (let j = 0; j < divisions; j++) {
                        const t1 = j / divisions, t2 = (j + 1) / divisions;
                        addSegment(
                            [getCubicBezierPoint(t1, currentX, x1, x2, x3), getCubicBezierPoint(t1, currentY, y1, y2, y3)],
                            [getCubicBezierPoint(t2, currentX, x1, x2, x3), getCubicBezierPoint(t2, currentY, y1, y2, y3)]
                        );
                    }
                    [currentX, currentY] = [x3, y3];
                    [lastControlX, lastControlY] = [x2, y2];
                }
                break;
            case 'c':
                for (let i = 0; i < args.length; i += 6) {
                    const x1 = currentX + args[i], y1 = currentY + args[i + 1], x2 = currentX + args[i + 2], y2 = currentY + args[i + 3], x3 = currentX + args[i + 4], y3 = currentY + args[i + 5];
                    const divisions = 16;
                    for (let j = 0; j < divisions; j++) {
                        const t1 = j / divisions, t2 = (j + 1) / divisions;
                        addSegment(
                            [getCubicBezierPoint(t1, currentX, x1, x2, x3), getCubicBezierPoint(t1, currentY, y1, y2, y3)],
                            [getCubicBezierPoint(t2, currentX, x1, x2, x3), getCubicBezierPoint(t2, currentY, y1, y2, y3)]
                        );
                    }
                    [currentX, currentY] = [x3, y3];
                    [lastControlX, lastControlY] = [x2, y2];
                }
                break;
            case 'S':
                for (let i = 0; i < args.length; i += 4) {
                    const x2 = args[i], y2 = args[i + 1], x3 = args[i + 2], y3 = args[i + 3];
                    const x1 = 'CcSs'.includes(lastCommand) ? 2 * currentX - lastControlX : currentX;
                    const y1 = 'CcSs'.includes(lastCommand) ? 2 * currentY - lastControlY : currentY;
                    const divisions = 16;
                    for (let j = 0; j < divisions; j++) {
                        const t1 = j / divisions, t2 = (j + 1) / divisions;
                        addSegment(
                            [getCubicBezierPoint(t1, currentX, x1, x2, x3), getCubicBezierPoint(t1, currentY, y1, y2, y3)],
                            [getCubicBezierPoint(t2, currentX, x1, x2, x3), getCubicBezierPoint(t2, currentY, y1, y2, y3)]
                        );
                    }
                    [currentX, currentY] = [x3, y3];
                    [lastControlX, lastControlY] = [x2, y2];
                }
                break;
            case 's':
                for (let i = 0; i < args.length; i += 4) {
                    const x2 = currentX + args[i], y2 = currentY + args[i + 1], x3 = currentX + args[i + 2], y3 = currentY + args[i + 3];
                    const x1 = 'CcSs'.includes(lastCommand) ? 2 * currentX - lastControlX : currentX;
                    const y1 = 'CcSs'.includes(lastCommand) ? 2 * currentY - lastControlY : currentY;
                    const divisions = 16;
                    for (let j = 0; j < divisions; j++) {
                        const t1 = j / divisions, t2 = (j + 1) / divisions;
                        addSegment(
                            [getCubicBezierPoint(t1, currentX, x1, x2, x3), getCubicBezierPoint(t1, currentY, y1, y2, y3)],
                            [getCubicBezierPoint(t2, currentX, x1, x2, x3), getCubicBezierPoint(t2, currentY, y1, y2, y3)]
                        );
                    }
                    [currentX, currentY] = [x3, y3];
                    [lastControlX, lastControlY] = [x2, y2];
                }
                break;
        }
        lastCommand = command;
    }
    return pathSegments;
}

export function parseSvgContent(data: string): { segments: Segment[], drill_points: any[] } {
    const parsed = parse(data);
    const segments: Segment[] = [];

    function traverse(node: any) {
        if (node.type !== 'element') return;
        const props = node.properties || {};
        const color = (props.stroke as string) || '#000000';

        switch (node.tagName) {
            case 'line': {
                const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(p => parseFloat(props[p] || 0));
                segments.push({ points: [[x1, -y1, 0], [x2, -y2, 0]], color });
                break;
            }
            case 'rect': {
                const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(p => parseFloat(props[p] || 0));
                const p1: [number, number, number] = [x, -y, 0];
                const p2: [number, number, number] = [x + width, -y, 0];
                const p3: [number, number, number] = [x + width, -(y + height), 0];
                const p4: [number, number, number] = [x, -(y + height), 0];
                segments.push({ points: [p1, p2], color }, { points: [p2, p3], color }, { points: [p3, p4], color }, { points: [p4, p1], color });
                break;
            }
            case 'polyline': {
                const points = parsePoints(props.points || '');
                for (let i = 0; i < points.length - 1; i++) {
                    const [x1, y1] = points[i];
                    const [x2, y2] = points[i + 1];
                    segments.push({ points: [[x1, -y1, 0], [x2, -y2, 0]], color });
                }
                break;
            }
            case 'polygon': {
                const points = parsePoints(props.points || '');
                if (points.length < 2) break;
                for (let i = 0; i < points.length - 1; i++) {
                    segments.push({ points: [[points[i][0], -points[i][1], 0], [points[i + 1][0], -points[i + 1][1], 0]], color });
                }
                segments.push({ points: [[points[points.length - 1][0], -points[points.length - 1][1], 0], [points[0][0], -points[0][1], 0]], color });
                break;
            }
            case 'circle': {
                const [cx, cy, r] = ['cx', 'cy', 'r'].map(p => parseFloat(props[p] || 0));
                const numSegments = 32;
                for (let i = 0; i < numSegments; i++) {
                    const angle1 = (i / numSegments) * 2 * Math.PI;
                    const angle2 = ((i + 1) / numSegments) * 2 * Math.PI;
                    const x1 = cx + r * Math.cos(angle1), y1 = cy + r * Math.sin(angle1);
                    const x2 = cx + r * Math.cos(angle2), y2 = cy + r * Math.sin(angle2);
                    segments.push({ points: [[x1, -y1, 0], [x2, -y2, 0]], color });
                }
                break;
            }
            case 'path': {
                const pathData = props.d || '';
                segments.push(...parsePathData(pathData, color));
                break;
            }
        }

        if (node.children) {
            node.children.forEach(traverse);
        }
    }

    traverse(parsed.children[0]);
    return { segments, drill_points: [] };
}
