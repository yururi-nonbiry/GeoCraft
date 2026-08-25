import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { SerialPortInfo } from '../types';

export type GcodeStatus = 'idle' | 'sending' | 'paused' | 'finished' | 'error';

// 文字数カウント方式のストリーミングではGrblから"ok"が非常に高頻度(先読みバッファが
// 空くたび)に返ってくるため、受信のたびに setState すると再レンダーの嵐になりUI全体
// (タブ切り替え等)が重くなる。ここで短時間分をまとめてから反映し、件数も上限で切る。
const CONSOLE_LOG_FLUSH_MS = 100;
const CONSOLE_LOG_MAX_LINES = 500;

type MachinePosition = {
  wpos: { x: number; y: number; z: number };
  mpos: { x: number; y: number; z: number };
  status: string;
  homed: boolean;
};

type GrblSettings = {
  stepsX: number;
  stepsY: number;
  stepsZ: number;
  invertX: boolean;
  invertY: boolean;
  invertZ: boolean;
};

// シリアル接続、ジョグ、主軸、Grbl設定、G-code送信制御など、CNC機械との通信に関する
// state・handler・イベント購読をまとめたフック。CAM側(ツールパス/ジオメトリ)の状態とは
// 独立しており、G-codeの「生成」(handleSaveGcode等)は呼び出し側(renderer.tsx)に残る。
export const useCncConnection = () => {
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [consoleLog, setConsoleLog] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [gcode, setGcode] = useState('');
  const [gcodeStatus, setGcodeStatus] = useState<GcodeStatus>('idle');
  const [gcodeProgress, setGcodeProgress] = useState({ sent: 0, total: 0 });

  const [jogStep, setJogStep] = useState(10);
  const [spindleSpeed, setSpindleSpeed] = useState(1000);
  const [spindleOn, setSpindleOn] = useState(false);
  const [enableMachineOriginReset, setEnableMachineOriginReset] = useState(false);
  const [machinePosition, setMachinePosition] = useState<MachinePosition>({
    wpos: { x: 0, y: 0, z: 0 },
    mpos: { x: 0, y: 0, z: 0 },
    status: 'Unknown',
    homed: false,
  });
  const [grblSettings, setGrblSettings] = useState<GrblSettings>({
    stepsX: 250,
    stepsY: 250,
    stepsZ: 250,
    invertX: false,
    invertY: false,
    invertZ: false,
  });

  const pendingConsoleLinesRef = useRef<string[]>([]);
  const consoleFlushTimerRef = useRef<number | null>(null);
  const pendingGcodeProgressRef = useRef<{ sent: number; total: number } | null>(null);
  const gcodeProgressFlushTimerRef = useRef<number | null>(null);

  const handleRefreshPorts = () => {
    api.listSerialPorts().then(result => {
      if (result.status === 'success') {
        setSerialPorts(result.ports);
        if (result.ports.length > 0 && !selectedPort) {
          setSelectedPort(result.ports[0].path);
        }
      } else {
        alert(`ポートの取得に失敗しました: ${result.message}`);
      }
    });
  };

  useEffect(() => {
    handleRefreshPorts();
    const removeDataListener = api.onSerialData((data) => {
      pendingConsoleLinesRef.current.push(`> ${data}`);
      if (consoleFlushTimerRef.current == null) {
        consoleFlushTimerRef.current = window.setTimeout(() => {
          consoleFlushTimerRef.current = null;
          const batch = pendingConsoleLinesRef.current;
          pendingConsoleLinesRef.current = [];
          if (batch.length === 0) return;
          setConsoleLog(prev => {
            const next = prev.length + batch.length > CONSOLE_LOG_MAX_LINES
              ? [...prev, ...batch].slice(-CONSOLE_LOG_MAX_LINES)
              : [...prev, ...batch];
            return next;
          });
        }, CONSOLE_LOG_FLUSH_MS);
      }
    });
    const removeClosedListener = api.onSerialClosed(() => {
      setIsConnected(false);
      setConsoleLog(prev => [...prev, '--- 接続が切断されました ---']);
    });
    const removeGcodeProgressListener = api.onGcodeProgress(progress => {
      // "sending"中の進捗(sent/total)更新は文字数カウント方式のバッファリング送信で
      // 高頻度に届くため、数値の反映も他の再レンダーと同じ間隔にまとめて間引く。
      // finished/error等の状態遷移は稀なイベントなので即時に反映する。
      if (progress.status === 'sending') {
        pendingGcodeProgressRef.current = { sent: progress.sent, total: progress.total };
        setGcodeStatus('sending');
        if (gcodeProgressFlushTimerRef.current == null) {
          gcodeProgressFlushTimerRef.current = window.setTimeout(() => {
            gcodeProgressFlushTimerRef.current = null;
            if (pendingGcodeProgressRef.current) {
              setGcodeProgress(pendingGcodeProgressRef.current);
              pendingGcodeProgressRef.current = null;
            }
          }, CONSOLE_LOG_FLUSH_MS);
        }
        return;
      }

      if (gcodeProgressFlushTimerRef.current != null) {
        window.clearTimeout(gcodeProgressFlushTimerRef.current);
        gcodeProgressFlushTimerRef.current = null;
      }
      pendingGcodeProgressRef.current = null;
      setGcodeProgress({ sent: progress.sent, total: progress.total });
      setGcodeStatus(progress.status);
      if (progress.status === 'finished') {
        setConsoleLog(prev => [...prev, '--- G-code送信完了 ---']);
        setGcodeStatus('idle');
      } else if (progress.status === 'error') {
        setConsoleLog(prev => [...prev, '--- G-code送信エラー ---']);
        setGcodeStatus('idle');
      }
    });
    const removeSpindleStatusListener = api.onSpindleStatus(status => setSpindleOn(status.on));
    const removeStatusListener = api.onStatus(status => setMachinePosition(status));
    const removeGrblSettingListener = api.onGrblSetting((setting) => {
      setGrblSettings(prev => {
        const next = { ...prev };
        if (setting.id === 100) next.stepsX = setting.value;
        if (setting.id === 101) next.stepsY = setting.value;
        if (setting.id === 102) next.stepsZ = setting.value;
        if (setting.id === 3) {
          const val = Math.round(setting.value);
          next.invertX = (val & 1) !== 0;
          next.invertY = (val & 2) !== 0;
          next.invertZ = (val & 4) !== 0;
        }
        return next;
      });
    });

    return () => {
      if (consoleFlushTimerRef.current != null) {
        window.clearTimeout(consoleFlushTimerRef.current);
        consoleFlushTimerRef.current = null;
      }
      if (gcodeProgressFlushTimerRef.current != null) {
        window.clearTimeout(gcodeProgressFlushTimerRef.current);
        gcodeProgressFlushTimerRef.current = null;
      }
      removeDataListener();
      removeClosedListener();
      removeGcodeProgressListener();
      removeSpindleStatusListener();
      removeStatusListener();
      removeGrblSettingListener();
    };
  }, []);

  const handleConnect = async () => {
    if (!selectedPort) return alert('ポートを選択してください。');
    const result = await api.connectSerial(selectedPort, baudRate);
    if (result.status === 'success') {
      setIsConnected(true);
      setConsoleLog(prev => [...prev, `--- ${selectedPort}に接続しました ---`]);
      setTimeout(() => {
        api.requestGrblSettings();
      }, 500);
    } else {
      setConnectionError(`接続エラー: ${result.message}`);
    }
  };

  const handleDisconnect = async () => {
    const result = await api.disconnectSerial();
    if (result.status !== 'success') setConnectionError(`切断エラー: ${result.message}`);
  };

  const clearConnectionError = () => setConnectionError(null);

  const handleJog = (axis: 'X' | 'Y' | 'Z', direction: number) => {
    if (isConnected) api.jog(axis, direction, jogStep);
  };

  const handleSetZero = () => {
    if (isConnected) {
      api.setZero();
    }
  };

  const handleResetMachineOrigin = () => {
    if (isConnected) {
      api.resetMachineOrigin();
    }
  };

  const handleSpindleOn = () => {
    if (isConnected) {
      api.spindleOn(spindleSpeed);
    }
  };

  const handleSpindleOff = () => {
    if (isConnected) {
      api.spindleOff();
    }
  };

  const handleRequestGrblSettings = () => {
    if (isConnected) {
      api.requestGrblSettings();
    }
  };

  const handleSaveGrblSettings = () => {
    if (isConnected) {
      api.saveGrblSettings(
        grblSettings.stepsX,
        grblSettings.stepsY,
        grblSettings.stepsZ,
        grblSettings.invertX,
        grblSettings.invertY,
        grblSettings.invertZ
      );
      alert('設定書き込みコマンドを送信しました。');
    }
  };

  const handleSendGcode = () => {
    if (gcode.trim() === '') return alert('送信するG-codeがありません。');
    api.sendGcode(gcode);
    setGcodeStatus('sending');
  };

  const handlePauseGcode = () => api.pauseGcode();
  const handleResumeGcode = () => api.resumeGcode();
  const handleStopGcode = () => api.stopGcode();

  // 停止後にバックエンドとの状態がずれて(進捗表示が残る・ボタンが操作不能になる等)
  // 元に戻せなくなった場合の避難用リセット。バックエンド側が送信中なら念のため
  // 停止も試みつつ、フロント側の表示は結果を待たず即座にidleへ戻す。
  const handleResetGcodeState = () => {
    api.stopGcode();
    setGcodeStatus('idle');
    setGcodeProgress({ sent: 0, total: 0 });
  };

  const handleEmergencyStop = () => {
    if (!isConnected) return;
    api.emergencyStop();
    // spindleOn / gcodeStatus are derived from the bridge's spindle-status /
    // gcode-progress broadcasts (see the listener setup above), so no local
    // state write here — this avoids drifting from reality if the reset fails.
  };

  const handleUnlockAlarm = () => {
    if (!isConnected) return;
    api.unlockAlarm();
  };

  // Escape キーをどこにフォーカスがあっても緊急停止として扱う（ダイアログ/入力欄内でも動作させるため window に登録）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleEmergencyStop();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isConnected]);

  return {
    serialPorts,
    selectedPort,
    setSelectedPort,
    isConnected,
    baudRate,
    setBaudRate,
    consoleLog,
    connectionError,
    clearConnectionError,

    gcode,
    setGcode,
    gcodeStatus,
    setGcodeStatus,
    gcodeProgress,

    jogStep,
    setJogStep,
    spindleSpeed,
    setSpindleSpeed,
    spindleOn,
    enableMachineOriginReset,
    setEnableMachineOriginReset,
    machinePosition,
    grblSettings,
    setGrblSettings,

    handleRefreshPorts,
    handleConnect,
    handleDisconnect,
    handleJog,
    handleSetZero,
    handleResetMachineOrigin,
    handleSpindleOn,
    handleSpindleOff,
    handleRequestGrblSettings,
    handleSaveGrblSettings,
    handleSendGcode,
    handlePauseGcode,
    handleResumeGcode,
    handleStopGcode,
    handleResetGcodeState,
    handleEmergencyStop,
    handleUnlockAlarm,
  };
};
