import { useEffect, useState } from 'react';
import { api } from '../api';
import { SerialPortInfo } from '../types';

export type GcodeStatus = 'idle' | 'sending' | 'paused' | 'finished' | 'error';

type MachinePosition = {
  wpos: { x: number; y: number; z: number };
  mpos: { x: number; y: number; z: number };
  status: string;
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
  });
  const [grblSettings, setGrblSettings] = useState<GrblSettings>({
    stepsX: 250,
    stepsY: 250,
    stepsZ: 250,
    invertX: false,
    invertY: false,
    invertZ: false,
  });

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
    const removeDataListener = api.onSerialData((data) => setConsoleLog(prev => [...prev, `> ${data}`]));
    const removeClosedListener = api.onSerialClosed(() => {
      setIsConnected(false);
      setConsoleLog(prev => [...prev, '--- 接続が切断されました ---']);
    });
    const removeGcodeProgressListener = api.onGcodeProgress(progress => {
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
      alert(`接続エラー: ${result.message}`);
    }
  };

  const handleDisconnect = async () => {
    const result = await api.disconnectSerial();
    if (result.status !== 'success') alert(`切断エラー: ${result.message}`);
  };

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

  const handleEmergencyStop = () => {
    if (!isConnected) return;
    api.emergencyStop();
    // spindleOn / gcodeStatus are derived from the bridge's spindle-status /
    // gcode-progress broadcasts (see the listener setup above), so no local
    // state write here — this avoids drifting from reality if the reset fails.
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
    handleEmergencyStop,
  };
};
