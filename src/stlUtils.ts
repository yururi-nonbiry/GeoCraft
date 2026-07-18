import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';

// 直方体形状のバイナリSTLデータを生成する。
// X: 0〜width, Y: 0〜depth, Z: 0〜height (原点手前角、底面がZ=0)の直方体として出力する。
export const createBoxStlData = (width: number, depth: number, height: number): ArrayBuffer => {
    const geometry = new THREE.BoxGeometry(width, depth, height);
    geometry.translate(width / 2, depth / 2, height / 2);
    const mesh = new THREE.Mesh(geometry);
    const exporter = new STLExporter();
    const dataView = exporter.parse(mesh, { binary: true }) as DataView;
    return dataView.buffer as ArrayBuffer;
};
