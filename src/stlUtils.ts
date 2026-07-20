import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

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

// STLの底面(Z最小値)を取得する。モデリング原点が底面と一致しているとは限らないため、
// 読み込み直後にこの値の符号を反転した量をオフセットのZに設定することで、
// 表示上・パス生成用STLの両方で底面を作業エリアの床(Z=0)に合わせることができる。
export const getStlMinZ = (data: ArrayBuffer): number => {
    const geometry = new STLLoader().parse(data);
    geometry.computeBoundingBox();
    return geometry.boundingBox?.min.z ?? 0;
};

// STLの頂点座標をoffset分だけ平行移動したバイナリSTLデータを生成する。
// ビューア上でのオフセット表示(見た目上の位置合わせ)を、実際のジオメトリにも反映するために使用する。
export const translateStlData = (data: ArrayBuffer, offset: { x: number; y: number; z: number }): ArrayBuffer => {
    const geometry = new STLLoader().parse(data);
    geometry.translate(offset.x, offset.y, offset.z);
    const mesh = new THREE.Mesh(geometry);
    const exporter = new STLExporter();
    const dataView = exporter.parse(mesh, { binary: true }) as DataView;
    return dataView.buffer as ArrayBuffer;
};
