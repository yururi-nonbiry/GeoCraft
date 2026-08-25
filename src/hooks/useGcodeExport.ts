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
  machine: MachineGcodeFields;
  onNoTransferToolpaths: () => void;
  setGcode: (gcode: string) => void;
  setGcodeStatus: (status: 'idle') => void;
};

// ドリル/輪郭・ポケット/3D加工パスのGコード出力(ファイル保存・実機転送)を担う。
// C#ブリッジ呼び出しの成功/失敗判定・アラート表示のパターンが3ハンドラで共通のため
// runGcodeAction にまとめている。
export const useGcodeExport = ({
  geometry,
  toolpaths,
  getEffectiveToolpaths,
  feedRate,
  machine,
  onNoTransferToolpaths,
  setGcode,
  setGcodeStatus,
}: UseGcodeExportArgs) => {
  // Shared machine-derived fields every G-code generation call needs.
  const buildGcodeParams = () => ({
    feedRate,
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
    const result = await runGcodeAction(
      () => api.generateDrillGcode({ drillPoints: geometry.drill_points, ...buildGcodeParams(), peckQ: machine.peckQ }),
      'Gコードの保存に失敗しました'
    );
    if (result?.status === 'success') alert(`ドリルGコードを保存しました: ${result.filePath}`);
  };

  const handleSaveGcode = async () => {
    if (!toolpaths || toolpaths.length === 0) return alert('保存するツールパスがありません。');
    const result = await runGcodeAction(
      () => api.generateGcode({ toolpaths: getEffectiveToolpaths(toolpaths), ...buildGcodeParams() }),
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
