import React from 'react';
import { Box, FormControlLabel, Checkbox } from '@mui/material';

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
