export type DxfSegment = { points: [[number, number, number], [number, number, number]]; color: string };
export type DxfArc = { center: [number, number, number]; radius: number; start_angle: number; end_angle: number; };
export type DrillPoint = number[];
export type Geometry = { segments: DxfSegment[]; arcs: DxfArc[]; drill_points: DrillPoint[] };
export type Toolpath = number[][];
export type ToolpathSegment =
    | { type: 'line'; points: number[][] }
    | { type: 'arc'; start: number[]; end: number[]; center: number[]; direction: 'cw' | 'ccw' };
