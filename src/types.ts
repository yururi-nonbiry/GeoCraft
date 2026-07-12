export type DxfSegment = { points: [[number, number, number], [number, number, number]]; color: string };
export type DxfArc = { center: [number, number, number]; radius: number; start_angle: number; end_angle: number; };
export type DrillPoint = number[];
export type Geometry = { segments: DxfSegment[]; arcs: DxfArc[]; drill_points: DrillPoint[] };
export type Toolpath = number[][];
export type ToolpathSegment =
    | { type: 'line'; points: number[][] }
    | { type: 'arc'; start: number[]; end: number[]; center: number[]; direction: 'cw' | 'ccw' };

export interface SerialPortInfo {
  path: string;
}

export type BottomFace = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

export type MachineSetting = {
  id: number;
  name: string;
  safeZ: number;
  retractZ: number;
  stepDown: number;
  peckQ: number;
  gcodeHeader: string;
  gcodeFooter: string;
};

export type EditableMachineSetting = Omit<MachineSetting, 'id'> & { id: number | null };

export type ToolCutSetting = {
  depthPerPass: number;
  feedRate: number;
  plungeRate: number;
  rpm: number;
};

export type ToolSetting = {
  id: number;
  machineId: number;
  name: string;
  diameter: number;
  type: string;
  roughing: ToolCutSetting;
  finishing: ToolCutSetting & { stockToLeave: number };
};

export type EditableToolSetting = Omit<ToolSetting, 'id'> & { id: number | null };
