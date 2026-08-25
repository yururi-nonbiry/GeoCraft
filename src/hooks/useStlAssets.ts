import { useState } from 'react';
import { api } from '../api';
import { StlBaseTransform, StlPlacement } from '../types';
import { createBoxStlData, translateStlData, getStlMinZ } from '../stlUtils';

type Vec3 = { x: number; y: number; z: number };

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

// 材料(stock)・加工後形状(target)STLの読み込み・配置(オフセット/底面選択)・
// ドラッグ&ドロップ投入・プロジェクト保存/復元用データを一括管理する。
// onNewStlLoaded は新しいSTLが実体として差し替わった(=既存のツールパス/プレビューが無効になる)
// タイミングでのみ呼ばれ、削除操作では呼ばれない(削除時はパス自体は残す挙動を維持するため)。
export const useStlAssets = (onNewStlLoaded: () => void) => {
  const [stockStlFile, setStockStlFile] = useState<string | null>(null);
  const [stockStlPath, setStockStlPath] = useState<string | null>(null);
  const [targetStlFile, setTargetStlFile] = useState<string | null>(null);
  const [stockStlData, setStockStlData] = useState<ArrayBuffer | null>(null);
  const [targetStlData, setTargetStlData] = useState<ArrayBuffer | null>(null);
  const [pickFaceMode, setPickFaceMode] = useState<'stock' | 'target' | null>(null);
  // --- STLドラッグ&ドロップ投入時、材料/加工後形状の選択待ちのデータ ---
  const [pendingStlDrop, setPendingStlDrop] = useState<{ fileLabel: string; filePath: string; data: ArrayBuffer } | null>(null);
  const [isDragOverViewer, setIsDragOverViewer] = useState(false);
  const [stockOffset, setStockOffset] = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const [targetOffset, setTargetOffset] = useState<Vec3>({ x: 0, y: 0, z: 0 });
  // 底面選択(ピックフェース)で決まった基準位置・回転。プロジェクト保存・復元の対象。
  const [stockBaseTransform, setStockBaseTransform] = useState<StlBaseTransform | null>(null);
  const [targetBaseTransform, setTargetBaseTransform] = useState<StlBaseTransform | null>(null);
  const [stockBoxSize, setStockBoxSize] = useState<Vec3>({ x: 100, y: 100, z: 20 });

  const loadStlData = async (filePath: string): Promise<ArrayBuffer | null> => {
    const result = await api.readFileAsBase64(filePath);
    if (result.status !== 'success') {
      alert(`STLファイルの読み込みに失敗しました: ${result.message}`);
      return null;
    }
    return base64ToArrayBuffer(result.data);
  };

  const applyStockStl = (fileLabel: string, filePath: string, data: ArrayBuffer | null) => {
    setStockStlFile(fileLabel);
    setStockStlPath(filePath);
    setStockStlData(data);
    setPickFaceMode(null);
    setStockBaseTransform(null);
    // STL自体のモデリング原点は底面と一致しているとは限らないため、底面を作業エリアの床(Z=0)に合わせる
    setStockOffset({ x: 0, y: 0, z: data ? -getStlMinZ(data) : 0 });
    onNewStlLoaded();
  };

  const applyTargetStl = (fileLabel: string, filePath: string, data: ArrayBuffer | null) => {
    setTargetStlFile(fileLabel);
    setTargetStlData(data);
    setPickFaceMode(null);
    setTargetBaseTransform(null);
    // STL自体のモデリング原点は底面と一致しているとは限らないため、底面を作業エリアの床(Z=0)に合わせる
    setTargetOffset({ x: 0, y: 0, z: data ? -getStlMinZ(data) : 0 });
    onNewStlLoaded();
  };

  const handleSelectStockStl = async () => {
    const result = await api.openFile('stl');
    if (result.status === 'success') {
      const data = await loadStlData(result.filePath);
      applyStockStl(result.filePath, result.filePath, data);
    }
  };

  const handleSelectTargetStl = async () => {
    const result = await api.openFile('stl');
    if (result.status === 'success') {
      const data = await loadStlData(result.filePath);
      applyTargetStl(result.filePath, result.filePath, data);
    }
  };

  const handleCreateBoxStock = async () => {
    const { x, y, z } = stockBoxSize;
    if (x <= 0 || y <= 0 || z <= 0) return alert('材料の幅・奥行き・高さには0より大きい値を入力してください。');
    const stlData = createBoxStlData(x, y, z);
    const result = await api.writeTempStlFile(arrayBufferToBase64(stlData));
    if (result.status !== 'success') return alert(`材料STLの生成に失敗しました: ${result.message}`);
    setStockStlFile(`矩形材料 ${x}×${y}×${z}mm`);
    setStockStlPath(result.filePath);
    setStockStlData(stlData);
    setPickFaceMode(null);
    setStockBaseTransform(null);
    setStockOffset({ x: 0, y: 0, z: 0 });
    onNewStlLoaded();
  };

  // ファイルメニューからDXF/SVGを開いた際、既存の材料/加工後形状STLを一括で破棄する
  // (底面選択の基準位置(baseTransform)は元々このタイミングでは保持されていた挙動を維持する)
  const clearStockAndTarget = () => {
    setStockStlFile(null);
    setStockStlPath(null);
    setTargetStlFile(null);
    setStockStlData(null);
    setTargetStlData(null);
    setStockOffset({ x: 0, y: 0, z: 0 });
    setTargetOffset({ x: 0, y: 0, z: 0 });
  };

  // --- オブジェクト一覧からの削除ハンドラ ---
  const handleDeleteStock = () => {
    setStockStlFile(null);
    setStockStlPath(null);
    setStockStlData(null);
    setStockOffset({ x: 0, y: 0, z: 0 });
    setStockBaseTransform(null);
    setPickFaceMode((prev) => (prev === 'stock' ? null : prev));
  };

  const handleDeleteTarget = () => {
    setTargetStlFile(null);
    setTargetStlData(null);
    setTargetOffset({ x: 0, y: 0, z: 0 });
    setTargetBaseTransform(null);
    setPickFaceMode((prev) => (prev === 'target' ? null : prev));
  };

  // --- STLファイルのドラッグ&ドロップ投入 ---
  const handleStlFileDrop = async (file: File) => {
    const data = await file.arrayBuffer();
    const result = await api.writeTempStlFile(arrayBufferToBase64(data));
    if (result.status !== 'success') {
      alert(`STLファイルの読み込みに失敗しました: ${result.message}`);
      return;
    }
    setPendingStlDrop({ fileLabel: file.name, filePath: result.filePath, data });
  };

  const handleViewerDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOverViewer(true);
  };

  const handleViewerDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOverViewer(false);
  };

  const handleViewerDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOverViewer(false);
    const file = Array.from(event.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.stl'));
    if (!file) {
      alert('STLファイル(.stl)をドロップしてください。');
      return;
    }
    void handleStlFileDrop(file);
  };

  const handlePendingStlRoleSelect = (role: 'stock' | 'target') => {
    if (!pendingStlDrop) return;
    const { fileLabel, filePath, data } = pendingStlDrop;
    if (role === 'stock') {
      applyStockStl(fileLabel, filePath, data);
    } else {
      applyTargetStl(fileLabel, filePath, data);
    }
    setPendingStlDrop(null);
  };

  // ビューア上のオフセット(stockOffset/targetOffset)・底面選択による基準位置/回転(baseTransform)は
  // 表示位置の調整用だが、パス生成はSTLファイルの実座標を元に行われるため、これらが設定されている場合は
  // 頂点座標に焼き込んだ一時STLを生成してからパスを生成する。
  const resolveOffsetStlPath = async (
    originalPath: string,
    data: ArrayBuffer | null,
    offset: Vec3,
    baseTransform: StlBaseTransform | null
  ): Promise<string> => {
    const hasOffset = offset.x !== 0 || offset.y !== 0 || offset.z !== 0;
    if (!data || (!hasOffset && !baseTransform)) return originalPath;
    const translation = baseTransform
      ? { x: baseTransform.position.x + offset.x, y: baseTransform.position.y + offset.y, z: baseTransform.position.z + offset.z }
      : offset;
    const translated = translateStlData(data, translation, baseTransform?.rotation);
    const result = await api.writeTempStlFile(arrayBufferToBase64(translated));
    if (result.status !== 'success') throw new Error(result.message ?? '一時STLファイルの書き込みに失敗しました。');
    return result.filePath;
  };

  const getStockPlacement = (): StlPlacement => ({
    fileName: stockStlFile,
    stlDataBase64: stockStlData ? arrayBufferToBase64(stockStlData) : null,
    offset: stockOffset,
    boxSize: stockBoxSize,
    baseTransform: stockBaseTransform,
  });

  const getTargetPlacement = (): StlPlacement => ({
    fileName: targetStlFile,
    stlDataBase64: targetStlData ? arrayBufferToBase64(targetStlData) : null,
    offset: targetOffset,
    baseTransform: targetBaseTransform,
  });

  const restorePlacement = async (
    placement: StlPlacement | undefined,
    setFile: (v: string | null) => void,
    setData: (v: ArrayBuffer | null) => void,
    setOffset: (v: Vec3) => void,
    setBaseTransform: (v: StlBaseTransform | null) => void,
    setPath?: (v: string | null) => void
  ) => {
    if (!placement || !placement.stlDataBase64) {
      setFile(null);
      setData(null);
      setOffset({ x: 0, y: 0, z: 0 });
      setBaseTransform(null);
      if (setPath) setPath(null);
      return;
    }
    const data = base64ToArrayBuffer(placement.stlDataBase64);
    setFile(placement.fileName ?? null);
    setData(data);
    setOffset(placement.offset ?? { x: 0, y: 0, z: 0 });
    setBaseTransform(placement.baseTransform ?? null);
    if (setPath) {
      // 復元されたSTLは元のファイルパスが存在しない可能性があるため、
      // ツールパス生成に使える一時ファイルとして書き出し直す。
      const written = await api.writeTempStlFile(placement.stlDataBase64);
      setPath(written.status === 'success' ? written.filePath : null);
    }
  };

  const restoreStockPlacement = (placement: StlPlacement | undefined) =>
    restorePlacement(placement, setStockStlFile, setStockStlData, setStockOffset, setStockBaseTransform, setStockStlPath);

  const restoreTargetPlacement = (placement: StlPlacement | undefined) =>
    restorePlacement(placement, setTargetStlFile, setTargetStlData, setTargetOffset, setTargetBaseTransform);

  return {
    stockStlFile,
    stockStlPath,
    targetStlFile,
    stockStlData,
    targetStlData,
    pickFaceMode,
    setPickFaceMode,
    pendingStlDrop,
    setPendingStlDrop,
    isDragOverViewer,
    stockOffset,
    setStockOffset,
    targetOffset,
    setTargetOffset,
    stockBaseTransform,
    setStockBaseTransform,
    targetBaseTransform,
    setTargetBaseTransform,
    stockBoxSize,
    setStockBoxSize,
    handleSelectStockStl,
    handleSelectTargetStl,
    handleCreateBoxStock,
    clearStockAndTarget,
    handleDeleteStock,
    handleDeleteTarget,
    handleViewerDragOver,
    handleViewerDragLeave,
    handleViewerDrop,
    handlePendingStlRoleSelect,
    resolveOffsetStlPath,
    getStockPlacement,
    getTargetPlacement,
    restoreStockPlacement,
    restoreTargetPlacement,
  };
};
