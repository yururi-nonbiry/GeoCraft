export type DxfSegment = { points: [[number, number, number], [number, number, number]]; color: string };
export type DxfArc = { center: [number, number, number]; radius: number; start_angle: number; end_angle: number; };
export type DrillPoint = number[];
export type Geometry = { segments: DxfSegment[]; arcs: DxfArc[]; drill_points: DrillPoint[] };
export type Toolpath = number[][];
// 底面選択(ピックフェース)で決まる3Dモデルの基準位置・回転。位置調整オフセットはこの基準位置に加算して適用する。
export type StlBaseTransform = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
};
export type ToolpathSegment =
    | { type: 'line'; points: number[][] }
    | { type: 'arc'; start: number[]; end: number[]; center: number[]; direction: 'cw' | 'ccw' };

export interface SerialPortInfo {
  path: string;
}

export type MachineSetting = {
  id: number;
  name: string;
  safeZ: number;
  retractZ: number;
  stepDown: number;
  peckQ: number;
  gcodeHeader: string;
  gcodeFooter: string;
  // 加工可能範囲（原点(0,0,0)を作業エリアの手前角とした可動範囲, mm）
  workAreaX: number;
  workAreaY: number;
  workAreaZ: number;
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
