import React from 'react';
import {
    Box,
    FormControlLabel,
    Checkbox,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
} from '@mui/material';

export const TabPanel = (props: { children?: React.ReactNode; index: number; value: number; sx?: any }) => {
    const { children, value, index, sx, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            style={{
                height: '100%',
                display: value === index ? 'flex' : 'none',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...sx }}>
                    {children}
                </Box>
            )}
        </div>
    );
};

export type VisibilityItem = { label: string; checked: boolean; onChange: (checked: boolean) => void };

// 3Dビュー上のオブジェクト(材料/加工後形状/パスなど)の表示・非表示チェックボックス列。
// CAM/CNC/シミュレーションの各タブで対象は違えど見た目・挙動が同じなので共通化している。
export const VisibilityToggles = ({ items }: { items: VisibilityItem[] }) => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', mb: 1 }}>
        {items.map((item) => (
            <FormControlLabel
                key={item.label}
                control={<Checkbox checked={item.checked} onChange={(e) => item.onChange(e.target.checked)} />}
                label={item.label}
            />
        ))}
    </Box>
);

type NumberFieldProps = {
    label: string;
    value: number;
    onChange: (val: number) => void;
    min?: number;
    max?: number;
    // min/max だけでは表現できない条件（例: 0以外の負数のみ許可）用の追加チェック。エラーメッセージを返す。
    validate?: (val: number) => string | undefined;
    // Z方向の向き(安全高さ/退避は上=正、切込み深さは下=負)を取り違えると加工機が
    // 意図しない方向(材料側)に動く危険があるため、表示上の警告に留めず符号自体を強制する。
    forceSign?: 'positive' | 'negative';
    helperText?: string;
    size?: 'small' | 'medium';
    fullWidth?: boolean;
    margin?: 'none' | 'dense' | 'normal';
    disabled?: boolean;
    multiline?: boolean;
    minRows?: number;
};

// 数値TextFieldの共通ラッパー。範囲外/未入力値を赤枠+ヘルパーテキストで可視化する。
// 入力自体はブロックしない(値は都度onChangeに伝播する)ため、既存の挙動を壊さずに検証だけ追加できる。
// forceSignを指定したフィールドのみ、伝播前に符号を矯正する(誤った符号のまま使われることを防ぐ)。
export const NumberField = ({
    label,
    value,
    onChange,
    min,
    max,
    validate,
    forceSign,
    helperText,
    size = 'small',
    fullWidth = true,
    margin = 'normal',
    disabled,
}: NumberFieldProps) => {
    const raw = String(value);
    const parsed = parseFloat(raw);
    let error: string | undefined;
    if (Number.isNaN(parsed)) {
        error = '数値を入力してください';
    } else if (min !== undefined && parsed < min) {
        error = `${min}以上の値を入力してください`;
    } else if (max !== undefined && parsed > max) {
        error = `${max}以下の値を入力してください`;
    } else if (validate) {
        error = validate(parsed);
    }

    return (
        <TextField
            label={label}
            type="number"
            value={value}
            onChange={(e) => {
                const next = parseFloat(e.target.value);
                if (Number.isNaN(next)) {
                    onChange(0);
                    return;
                }
                onChange(forceSign === 'positive' ? Math.abs(next) : forceSign === 'negative' ? -Math.abs(next) : next);
            }}
            error={!!error}
            helperText={error || helperText}
            fullWidth={fullWidth}
            margin={margin}
            size={size}
            disabled={disabled}
        />
    );
};

type ConfirmDialogProps = {
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmColor?: 'primary' | 'secondary' | 'error';
    onConfirm: () => void;
    onCancel: () => void;
};

// window.confirm() の代替。MUIダイアログでスタイルを統一し、破壊的操作の実行/キャンセルを明示する。
export const ConfirmDialog = ({
    open,
    title,
    message,
    confirmLabel = '実行',
    cancelLabel = 'キャンセル',
    confirmColor = 'secondary',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) => (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent dividers>
            {typeof message === 'string' ? <Typography>{message}</Typography> : message}
        </DialogContent>
        <DialogActions>
            <Button onClick={onCancel}>{cancelLabel}</Button>
            <Button variant="contained" color={confirmColor} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogActions>
    </Dialog>
);
