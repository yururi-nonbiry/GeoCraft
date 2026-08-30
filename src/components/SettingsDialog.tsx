import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Grid,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  MachineSetting,
  EditableMachineSetting,
  MaterialSetting,
  EditableMaterialSetting,
  ToolSetting,
  EditableToolSetting,
} from '../types';
import { NumberField, ConfirmDialog } from './ControlPanel/shared';

const EMPTY_MACHINE: EditableMachineSetting = {
  id: null,
  name: '',
  safeZ: 5.0,
  retractZ: 2.0,
  stepDown: -2.0,
  peckQ: 1.0,
  gcodeHeader: 'G90 G21 G17',
  gcodeFooter: 'M30',
  workAreaX: 300,
  workAreaY: 300,
  workAreaZ: 100,
};

const EMPTY_MATERIAL: EditableMaterialSetting = {
  id: null,
  name: '',
  feedRate: 1000,
  plungeRate: 300,
  rpm: 15000,
  depthPerPass: 1,
};

const EMPTY_TOOL: EditableToolSetting = {
  id: null,
  machineId: 1,
  name: '',
  diameter: 3,
  type: 'endmill',
  roughing: { depthPerPass: 1.0, feedRate: 1000, plungeRate: 300, rpm: 15000 },
  finishing: { depthPerPass: 0.5, feedRate: 800, plungeRate: 200, rpm: 15000, stockToLeave: 0.0 },
};

// id が既存なら更新、無ければ Date.now() を新規IDとして追加する（Machine/Material/Tool共通の保存パターン）
const upsertById = <T extends { id: number | null }>(
  list: (Omit<T, 'id'> & { id: number })[],
  editing: T,
  onNewId: (id: number) => void
): (Omit<T, 'id'> & { id: number })[] => {
  if (editing.id !== null) {
    return list.map((item) => (item.id === editing.id ? ({ ...editing, id: editing.id } as any) : item));
  }
  const newId = Date.now();
  onNewId(newId);
  return [...list, { ...editing, id: newId } as any];
};

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  machineSettings: MachineSetting[];
  setMachineSettings: React.Dispatch<React.SetStateAction<MachineSetting[]>>;
  selectedMachineId: number | '';
  setSelectedMachineId: React.Dispatch<React.SetStateAction<number | ''>>;
  materialSettings: MaterialSetting[];
  setMaterialSettings: React.Dispatch<React.SetStateAction<MaterialSetting[]>>;
  selectedMaterialId: number | '';
  setSelectedMaterialId: React.Dispatch<React.SetStateAction<number | ''>>;
  toolSettings: ToolSetting[];
  setToolSettings: React.Dispatch<React.SetStateAction<ToolSetting[]>>;
  selectedToolId: number | '';
  setSelectedToolId: React.Dispatch<React.SetStateAction<number | ''>>;
};

const SettingsDialog = ({
  open,
  onClose,
  machineSettings,
  setMachineSettings,
  selectedMachineId,
  setSelectedMachineId,
  materialSettings,
  setMaterialSettings,
  selectedMaterialId,
  setSelectedMaterialId,
  toolSettings,
  setToolSettings,
  selectedToolId,
  setSelectedToolId,
}: SettingsDialogProps) => {
  const [isMachineDialogOpen, setIsMachineDialogOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<EditableMachineSetting>({ ...EMPTY_MACHINE });
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<EditableMaterialSetting>({ ...EMPTY_MATERIAL });
  const [isToolDialogOpen, setIsToolDialogOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<EditableToolSetting>({ ...EMPTY_TOOL });
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'machine'; item: MachineSetting }
    | { kind: 'material'; item: MaterialSetting }
    | { kind: 'tool'; item: ToolSetting }
    | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMachineValid = editingMachine.name.trim() !== ''
    && editingMachine.safeZ >= 0
    && editingMachine.stepDown < 0
    && editingMachine.retractZ >= 0
    && editingMachine.peckQ > 0
    && editingMachine.workAreaX > 0
    && editingMachine.workAreaY > 0
    && editingMachine.workAreaZ > 0;

  const isMaterialValid = editingMaterial.name.trim() !== ''
    && editingMaterial.feedRate > 0
    && editingMaterial.plungeRate > 0
    && editingMaterial.rpm > 0
    && editingMaterial.depthPerPass > 0;

  const isToolValid = !!editingTool.name && editingTool.name.trim() !== ''
    && editingTool.diameter > 0
    && (editingTool.roughing?.depthPerPass ?? 0) > 0
    && (editingTool.roughing?.feedRate ?? 0) > 0
    && (editingTool.roughing?.plungeRate ?? 0) > 0
    && (editingTool.roughing?.rpm ?? 0) > 0
    && (editingTool.finishing?.depthPerPass ?? 0) > 0
    && (editingTool.finishing?.feedRate ?? 0) > 0
    && (editingTool.finishing?.plungeRate ?? 0) > 0
    && (editingTool.finishing?.rpm ?? 0) > 0
    && (editingTool.finishing?.stockToLeave ?? 0) >= 0;

  const handleSaveMachine = () => {
    if (!isMachineValid) return;
    setMachineSettings((prev) => upsertById(prev, editingMachine, setSelectedMachineId));
    setIsMachineDialogOpen(false);
  };

  const handleDeleteMachine = (machine: MachineSetting) => {
    setMachineSettings((prev) => {
      const updated = prev.filter((m) => m.id !== machine.id);
      if (machine.id === selectedMachineId) {
        setSelectedMachineId(updated.length ? updated[0].id : '');
      }
      return updated;
    });
  };

  const handleSaveMaterial = () => {
    if (!isMaterialValid) return;
    setMaterialSettings((prev) => upsertById(prev, editingMaterial, setSelectedMaterialId));
    setIsMaterialDialogOpen(false);
  };

  const handleDeleteMaterial = (material: MaterialSetting) => {
    setMaterialSettings((prev) => {
      const updated = prev.filter((m) => m.id !== material.id);
      if (material.id === selectedMaterialId) {
        setSelectedMaterialId(updated.length ? updated[0].id : '');
      }
      return updated;
    });
  };

  const handleSaveTool = () => {
    if (!isToolValid) return;
    setToolSettings((prev) => upsertById(prev, editingTool, setSelectedToolId));
    setIsToolDialogOpen(false);
  };

  const handleDeleteTool = (tool: ToolSetting) => {
    setToolSettings((prev) => {
      const updated = prev.filter((t) => t.id !== tool.id);
      if (tool.id === selectedToolId) {
        setSelectedToolId(updated.length ? updated[0].id : '');
      }
      return updated;
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'machine') handleDeleteMachine(deleteTarget.item);
    else if (deleteTarget.kind === 'material') handleDeleteMaterial(deleteTarget.item);
    else handleDeleteTool(deleteTarget.item);
    setDeleteTarget(null);
  };

  const handleSaveAll = async () => {
    try {
      await window.electronAPI.saveSettings({
        machineSettings,
        selectedMachineId: typeof selectedMachineId === 'number' ? selectedMachineId : undefined,
        materialSettings,
        toolSettings,
        selectedMaterialId: typeof selectedMaterialId === 'number' ? selectedMaterialId : undefined,
        selectedToolId: typeof selectedToolId === 'number' ? selectedToolId : undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save settings', error);
      setErrorMessage('設定の保存に失敗しました。');
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>設定</DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>加工機設定</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button variant="contained" size="small" onClick={() => { setEditingMachine({ ...EMPTY_MACHINE }); setIsMachineDialogOpen(true); }}>加工機を追加</Button>
          </Box>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell align="right">安全高さ (Z)</TableCell>
                  <TableCell align="right">切込み深さ (Z)</TableCell>
                  <TableCell align="right">R点 (退避Z)</TableCell>
                  <TableCell align="right">ペック量 (Q)</TableCell>
                  <TableCell align="right">加工範囲 X×Y×Z (mm)</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {machineSettings.map((machine) => (
                  <TableRow key={machine.id} hover selected={machine.id === selectedMachineId}>
                    <TableCell>{machine.name}</TableCell>
                    <TableCell align="right">{machine.safeZ}</TableCell>
                    <TableCell align="right">{machine.stepDown}</TableCell>
                    <TableCell align="right">{machine.retractZ}</TableCell>
                    <TableCell align="right">{machine.peckQ}</TableCell>
                    <TableCell align="right">{machine.workAreaX}×{machine.workAreaY}×{machine.workAreaZ}</TableCell>
                    <TableCell align="center">
                      <Button size="small" onClick={() => { setEditingMachine({ ...machine }); setIsMachineDialogOpen(true); }} sx={{ mr: 1 }}>編集</Button>
                      <Button size="small" color="secondary" onClick={() => setDeleteTarget({ kind: 'machine', item: machine })}>削除</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>材料設定</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button variant="contained" size="small" onClick={() => { setEditingMaterial({ ...EMPTY_MATERIAL }); setIsMaterialDialogOpen(true); }}>材料を追加</Button>
          </Box>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell align="right">送り (mm/min)</TableCell>
                  <TableCell align="right">突っ込み (mm/min)</TableCell>
                  <TableCell align="right">RPM</TableCell>
                  <TableCell align="right">切込み深さ (mm)</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materialSettings.map((material) => (
                  <TableRow key={material.id} hover selected={material.id === selectedMaterialId}>
                    <TableCell>{material.name}</TableCell>
                    <TableCell align="right">{material.feedRate}</TableCell>
                    <TableCell align="right">{material.plungeRate}</TableCell>
                    <TableCell align="right">{material.rpm}</TableCell>
                    <TableCell align="right">{material.depthPerPass}</TableCell>
                    <TableCell align="center">
                      <Button size="small" onClick={() => { setEditingMaterial({ ...material }); setIsMaterialDialogOpen(true); }} sx={{ mr: 1 }}>編集</Button>
                      <Button size="small" color="secondary" onClick={() => setDeleteTarget({ kind: 'material', item: material })}>削除</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>工具設定 (選択中の加工機向け)</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button variant="contained" size="small" onClick={() => { setEditingTool({ ...EMPTY_TOOL, machineId: typeof selectedMachineId === 'number' ? selectedMachineId : 1 }); setIsToolDialogOpen(true); }}>工具を追加</Button>
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell align="right">径 (mm)</TableCell>
                  <TableCell>種類</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {toolSettings.filter(t => t.machineId === selectedMachineId).map((tool) => (
                  <TableRow key={tool.id} hover selected={tool.id === selectedToolId}>
                    <TableCell>{tool.name}</TableCell>
                    <TableCell align="right">{tool.diameter}</TableCell>
                    <TableCell>{tool.type}</TableCell>
                    <TableCell align="center">
                      <Button size="small" onClick={() => { setEditingTool({ ...tool }); setIsToolDialogOpen(true); }} sx={{ mr: 1 }}>編集</Button>
                      <Button size="small" color="secondary" onClick={() => setDeleteTarget({ kind: 'tool', item: tool })}>削除</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>キャンセル</Button>
          <Button variant="contained" onClick={handleSaveAll}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isMachineDialogOpen} onClose={() => setIsMachineDialogOpen(false)}>
        <DialogTitle>{editingMachine.id ? '加工機を編集' : '加工機を追加'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="名称"
            value={editingMachine.name}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
            margin="dense"
            error={editingMachine.name.trim() === ''}
            helperText={editingMachine.name.trim() === '' ? '名称を入力してください' : undefined}
          />
          <NumberField
            label="安全高さ (Z)"
            value={editingMachine.safeZ}
            onChange={(val) => setEditingMachine((prev) => ({ ...prev, safeZ: val }))}
            forceSign="positive"
            margin="dense"
          />
          <NumberField
            label="切込み深さ (Z)"
            value={editingMachine.stepDown}
            onChange={(val) => setEditingMachine((prev) => ({ ...prev, stepDown: val }))}
            forceSign="negative"
            margin="dense"
          />
          <NumberField
            label="R点 (切込み開始高さ)"
            value={editingMachine.retractZ}
            onChange={(val) => setEditingMachine((prev) => ({ ...prev, retractZ: val }))}
            forceSign="positive"
            margin="dense"
          />
          <NumberField
            label="ペック量 (Q)"
            value={editingMachine.peckQ}
            onChange={(val) => setEditingMachine((prev) => ({ ...prev, peckQ: val }))}
            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
            margin="dense"
          />
          <NumberField
            label="加工範囲 X (幅, mm)"
            value={editingMachine.workAreaX}
            onChange={(val) => setEditingMachine((prev) => ({ ...prev, workAreaX: val }))}
            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
            margin="dense"
            helperText="原点(0)からテーブル奥までのX方向可動範囲"
          />
          <NumberField
            label="加工範囲 Y (奥行き, mm)"
            value={editingMachine.workAreaY}
            onChange={(val) => setEditingMachine((prev) => ({ ...prev, workAreaY: val }))}
            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
            margin="dense"
            helperText="原点(0)からテーブル奥までのY方向可動範囲"
          />
          <NumberField
            label="加工範囲 Z (高さ, mm)"
            value={editingMachine.workAreaZ}
            onChange={(val) => setEditingMachine((prev) => ({ ...prev, workAreaZ: val }))}
            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
            margin="dense"
            helperText="原点(Z=0)から下方向への可動範囲"
          />
          <TextField
            label="G-code ヘッダー"
            value={editingMachine.gcodeHeader}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, gcodeHeader: e.target.value }))}
            fullWidth
            margin="dense"
            multiline
            minRows={2}
          />
          <TextField
            label="G-code フッター"
            value={editingMachine.gcodeFooter}
            onChange={(e) => setEditingMachine((prev) => ({ ...prev, gcodeFooter: e.target.value }))}
            fullWidth
            margin="dense"
            multiline
            minRows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsMachineDialogOpen(false)}>キャンセル</Button>
          <Button variant="contained" onClick={handleSaveMachine} disabled={!isMachineValid}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isMaterialDialogOpen} onClose={() => setIsMaterialDialogOpen(false)}>
        <DialogTitle>{editingMaterial.id ? '材料を編集' : '材料を追加'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="名称"
            value={editingMaterial.name}
            onChange={(e) => setEditingMaterial((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
            margin="dense"
            error={editingMaterial.name.trim() === ''}
            helperText={editingMaterial.name.trim() === '' ? '名称を入力してください' : undefined}
          />
          <NumberField
            label="送り速度 (mm/min)"
            value={editingMaterial.feedRate}
            onChange={(val) => setEditingMaterial((prev) => ({ ...prev, feedRate: val }))}
            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
            margin="dense"
          />
          <NumberField
            label="突っ込み速度 (mm/min)"
            value={editingMaterial.plungeRate}
            onChange={(val) => setEditingMaterial((prev) => ({ ...prev, plungeRate: val }))}
            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
            margin="dense"
          />
          <NumberField
            label="主軸回転数 (RPM)"
            value={editingMaterial.rpm}
            onChange={(val) => setEditingMaterial((prev) => ({ ...prev, rpm: val }))}
            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
            margin="dense"
          />
          <NumberField
            label="切込み深さ (mm)"
            value={editingMaterial.depthPerPass}
            onChange={(val) => setEditingMaterial((prev) => ({ ...prev, depthPerPass: val }))}
            validate={(v) => (v <= 0 ? '0より大きい値を入力してください' : undefined)}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsMaterialDialogOpen(false)}>キャンセル</Button>
          <Button variant="contained" onClick={handleSaveMaterial} disabled={!isMaterialValid}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isToolDialogOpen} onClose={() => setIsToolDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingTool.id ? '工具を編集' : '工具を追加'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>基本情報</Typography>
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="名称"
                value={editingTool.name || ''}
                onChange={(e) => setEditingTool((prev) => ({ ...prev, name: e.target.value }))}
                fullWidth
                margin="dense"
                size="small"
                error={!editingTool.name || editingTool.name.trim() === ''}
                helperText={!editingTool.name || editingTool.name.trim() === '' ? '名称を入力してください' : undefined}
              />
            </Grid>
            <Grid item xs={3}>
              <NumberField
                label="径 (mm)"
                value={editingTool.diameter || 0}
                onChange={(val) => setEditingTool((prev) => ({ ...prev, diameter: val }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
            </Grid>
            <Grid item xs={3}>
              <FormControl fullWidth margin="dense" size="small">
                <InputLabel>種類</InputLabel>
                <Select
                  value={editingTool.type || 'endmill'}
                  label="種類"
                  onChange={(e) => setEditingTool((prev) => ({ ...prev, type: e.target.value }))}
                >
                  <MenuItem value="endmill">エンドミル</MenuItem>
                  <MenuItem value="ballend">ボールエンドミル</MenuItem>
                  <MenuItem value="drill">ドリル</MenuItem>
                  <MenuItem value="vbit">Vビット</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6}>
              <Typography variant="subtitle2" color="primary" sx={{ mt: 2 }} gutterBottom>粗削り加工条件</Typography>
              <NumberField
                label="切込み量 (mm)"
                value={editingTool.roughing?.depthPerPass ?? 1.0}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  roughing: { ...prev.roughing!, depthPerPass: val }
                }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
              <NumberField
                label="送り速度 (mm/min)"
                value={editingTool.roughing?.feedRate ?? 1000}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  roughing: { ...prev.roughing!, feedRate: val }
                }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
              <NumberField
                label="突っ込み速度 (mm/min)"
                value={editingTool.roughing?.plungeRate ?? 300}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  roughing: { ...prev.roughing!, plungeRate: val }
                }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
              <NumberField
                label="主軸回転数 (RPM)"
                value={editingTool.roughing?.rpm ?? 15000}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  roughing: { ...prev.roughing!, rpm: val }
                }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
            </Grid>

            <Grid item xs={6}>
              <Typography variant="subtitle2" color="primary" sx={{ mt: 2 }} gutterBottom>仕上げ加工条件</Typography>
              <NumberField
                label="切込み量 (mm)"
                value={editingTool.finishing?.depthPerPass ?? 0.5}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, depthPerPass: val }
                }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
              <NumberField
                label="送り速度 (mm/min)"
                value={editingTool.finishing?.feedRate ?? 800}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, feedRate: val }
                }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
              <NumberField
                label="突っ込み速度 (mm/min)"
                value={editingTool.finishing?.plungeRate ?? 200}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, plungeRate: val }
                }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
              <NumberField
                label="主軸回転数 (RPM)"
                value={editingTool.finishing?.rpm ?? 15000}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, rpm: val }
                }))}
                validate={(v) => (v <= 0 ? '0より大きい値' : undefined)}
                margin="dense"
                size="small"
              />
              <NumberField
                label="仕上げで残す量 (mm)"
                value={editingTool.finishing?.stockToLeave ?? 0.0}
                onChange={(val) => setEditingTool((prev) => ({
                  ...prev,
                  finishing: { ...prev.finishing!, stockToLeave: val }
                }))}
                min={0}
                margin="dense"
                size="small"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsToolDialogOpen(false)}>キャンセル</Button>
          <Button variant="contained" onClick={handleSaveTool} disabled={!isToolValid}>保存</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="削除の確認"
        message={
          deleteTarget?.kind === 'machine' ? `加工機「${deleteTarget.item.name}」を削除しますか？`
          : deleteTarget?.kind === 'material' ? `材料「${deleteTarget.item.name}」を削除しますか？`
          : deleteTarget?.kind === 'tool' ? `工具「${deleteTarget.item.name}」を削除しますか？`
          : ''
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Snackbar open={!!errorMessage} autoHideDuration={4000} onClose={() => setErrorMessage(null)}>
        <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert>
      </Snackbar>
    </>
  );
};

export default SettingsDialog;
