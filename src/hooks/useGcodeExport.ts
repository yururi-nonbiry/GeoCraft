import { Geometry, ToolpathSegment } from '../types';
import { api } from '../api';

type MachineGcodeFields = {
  safeZ: number;
  stepDown: number;
  retractZ: number;
  peckQ: number;
};

type UseGcodeExportArgs = {
  geometry: Geometry | null;
  toolpaths: ToolpathSegment[] | null;
  getEffectiveToolpaths: (paths: ToolpathSegment[] | null) => ToolpathSegment[] | null;
  feedRate: number;
  rpm: number;
  machine: MachineGcodeFields;
  stockThickness: number;
  onNoTransferToolpaths: () => void;
  setGcode: (gcode: string) => void;
  setGcodeStatus: (status: 'idle') => void;
};

// ツールパスが実際に到達する最大切り込み深さ(mm、work Z0=材料上面からの正の距離)を求める。
// 3D荒加工パスは点ごとに実Zを持つためその最深点を使い、Z座標を持たない2D輪郭/ポケット
// パスはGcodeServiceが同じフォールバックでマシン設定のstepDownを深さとして使うため、それに合わせる。
const computeMaxCutDepth = (paths: ToolpathSegment[], stepDown: number): number => {
  let maxDepth = 0;
  let hasZ = false;
  for (const seg of paths) {
    const points = seg.type === 'line' ? seg.points : [seg.start, seg.end];
    for (const p of points) {
      if (p.length > 2) {
        hasZ = true;
        maxDepth = Math.max(maxDepth, -p[2]);
      }
    }
  }
  return hasZ ? maxDepth : Math.abs(stepDown);
};

// 切り込み深さが材料厚みを超える場合、テーブルや治具に接触する恐れがあることを警告し、
// ユーザーが承知した場合のみ続行させる。
const confirmDepthWithinStock = (depth: number, stockThickness: number): boolean => {
  if (depth <= stockThickness + 1e-6) return true;
  return window.confirm(
    `切り込み深さ(${depth.toFixed(2)}mm)が材料厚み(${stockThickness.toFixed(2)}mm)を超えています。テーブルや治具に接触する恐れがあります。続行しますか？`
  );
};

// ドリル/輪郭・ポケット/3D加工パスのGコード出力(ファイル保存・実機転送)を担う。
// C#ブリッジ呼び出しの成功/失敗判定・アラート表示のパターンが3ハンドラで共通のため
// runGcodeAction にまとめている。
export const useGcodeExport = ({
  geometry,
  toolpaths,
  getEffectiveToolpaths,
  feedRate,
  rpm,
  machine,
  stockThickness,
  onNoTransferToolpaths,
  setGcode,
  setGcodeStatus,
}: UseGcodeExportArgs) => {
  // Shared machine-derived fields every G-code generation call needs.
  const buildGcodeParams = () => ({
    feedRate,
    rpm,
    safeZ: machine.safeZ,
    stepDown: machine.stepDown,
    retractZ: machine.retractZ,
  });

  // Runs a bridge call that returns { status, message, ... }, alerting on any
  // outcome other than success/canceled (including a thrown/rejected call).
  const runGcodeAction = async (action: () => Promise<any>, failureMessage: string): Promise<any | null> => {
    try {
      const result = await action();
      if (result.status !== 'success' && result.status !== 'canceled') {
        alert(`${failureMessage}: ${result.message}`);
      }
      return result;
    } catch (error) {
      alert(`${failureMessage}: ${error}`);
      return null;
    }
  };

  const handleGenerateDrillGcode = async () => {
    if (!geometry || !geometry.drill_points || geometry.drill_points.length === 0) return alert('Gコードを生成するためのドリル点がありません。');
    if (!confirmDepthWithinStock(Math.abs(machine.stepDown), stockThickness)) return;
    const result = await runGcodeAction(
      () => api.generateDrillGcode({ drillPoints: geometry.drill_points, ...buildGcodeParams(), peckQ: machine.peckQ }),
      'Gコードの保存に失敗しました'
    );
    if (result?.status === 'success') alert(`ドリルGコードを保存しました: ${result.filePath}`);
  };

  const handleSaveGcode = async () => {
    if (!toolpaths || toolpaths.length === 0) return alert('保存するツールパスがありません。');
    const effectiveToolpaths = getEffectiveToolpaths(toolpaths);
    if (!confirmDepthWithinStock(computeMaxCutDepth(effectiveToolpaths ?? toolpaths, machine.stepDown), stockThickness)) return;
    const result = await runGcodeAction(
      () => api.generateGcode({ toolpaths: effectiveToolpaths, ...buildGcodeParams() }),
      'Gコードの保存に失敗しました'
    );
    if (result?.status === 'success') alert(`Gコードを保存しました: ${result.filePath}`);
  };

  const handleTransferGcodeToCnc = async (): Promise<boolean> => {
    if (!toolpaths || toolpaths.length === 0) {
      onNoTransferToolpaths();
      return false;
    }
    // どの区間が固まりの原因か切り分けるための一時的な計測ログ。
    const tEffective0 = performance.now();
    const effectiveToolpaths = getEffectiveToolpaths(toolpaths);
    const tEffective1 = performance.now();
    console.log(`[transfer] getEffectiveToolpaths: ${(tEffective1 - tEffective0).toFixed(1)}ms, segments=${effectiveToolpaths?.length ?? 0}`);

    if (!confirmDepthWithinStock(computeMaxCutDepth(effectiveToolpaths ?? toolpaths, machine.stepDown), stockThickness)) return false;

    const tCall0 = performance.now();
    const result = await runGcodeAction(
      () => api.generateGcodeForTransfer({ toolpaths: effectiveToolpaths, ...buildGcodeParams() }),
      'Gコードの生成に失敗しました'
    );
    const tCall1 = performance.now();
    console.log(`[transfer] bridge call (JSON.stringify + C#生成 + JSON.parse往復): ${(tCall1 - tCall0).toFixed(1)}ms, gcode length=${result?.gcode?.length ?? 0}`);

    if (result?.status === 'success') {
      const tSet0 = performance.now();
      setGcode(result.gcode);
      setGcodeStatus('idle');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          console.log(`[transfer] setGcode -> 再描画完了まで: ${(performance.now() - tSet0).toFixed(1)}ms`);
        });
      });
      return true;
    }
    return false;
  };

  return { handleGenerateDrillGcode, handleSaveGcode, handleTransferGcodeToCnc };
};
