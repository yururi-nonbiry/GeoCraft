import json
import sys
import trimesh
import numpy as np
from shapely.geometry import Polygon, LineString

def slice_and_pocket(stl_path, slice_height, tool_diameter, stepover_ratio):
    try:
        mesh = trimesh.load_mesh(stl_path)
    except Exception as e:
        return {"status": "error", "message": f"Failed to load STL: {e}"}

    z_min, z_max = mesh.bounds[:, 2]
    all_toolpaths = []
    stepover = tool_diameter * stepover_ratio

    # Z軸に沿ってスライス
    for z in np.arange(z_min + slice_height, z_max + slice_height, slice_height):
        try:
            section = mesh.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
            if not section:
                continue

            planar_section, to_3D = section.to_planar()
            
            for poly_2d in planar_section.polygons_full:
                shape = Polygon(poly_2d.exterior.coords)
                if not shape.is_valid:
                    shape = shape.buffer(0)
                if shape.is_empty or not shape.is_valid:
                    continue

                # ポケット加工パスの生成 (インワードオフセット)
                current_offset = - (tool_diameter / 2)
                while True:
                    offset_shape = shape.buffer(current_offset, join_style=2)
                    if offset_shape.is_empty:
                        break
                    
                    if offset_shape.geom_type == 'MultiPolygon':
                        polygons = list(offset_shape.geoms)
                    else:
                        polygons = [offset_shape]

                    for p in polygons:
                        path_2d = list(p.exterior.coords)
                        # 2Dパスを3Dに変換
                        path_3d = [[coord[0], coord[1], z] for coord in path_2d]
                        all_toolpaths.append(path_3d)
                    
                    current_offset -= stepover
        except Exception as e:
            # 特定のスライスでエラーが発生しても処理を続ける
            # print(f"Warning: Failed to process slice at Z={z}: {e}", file=sys.stderr)
            pass

    return {
        "status": "success",
        "toolpaths": all_toolpaths
    }

if __name__ == "__main__":
    if len(sys.argv) > 4:
        try:
            stl_path = sys.argv[1]
            slice_h = float(sys.argv[2])
            tool_dia = float(sys.argv[3])
            stepover_ratio_val = float(sys.argv[4])
            
            result = slice_and_pocket(stl_path, slice_h, tool_dia, stepover_ratio_val)
            print(json.dumps(result))
            sys.stdout.flush()
        except Exception as e:
            error_msg = {"status": "error", "message": f"An error occurred: {e}"}
            print(json.dumps(error_msg))
            sys.stdout.flush()
    else:
        error_msg = {"status": "error", "message": "Required arguments not provided."}
        print(json.dumps(error_msg))
        sys.stdout.flush()
