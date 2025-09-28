import json
import sys
from shapely.geometry import Polygon, LineString, MultiLineString
from shapely.errors import TopologicalError

def generate_pocket_path(geometry_data, tool_diameter, stepover):
    """
    インワードオフセット法でポケット加工パスを生成する
    """
    if len(geometry_data) < 3:
        return {"status": "error", "message": "Invalid geometry data."}

    try:
        # 形状データからポリゴンを作成
        shape = Polygon([(p[0], p[1]) for p in geometry_data])
        if not shape.is_valid:
            # 自己交差などを修正しようと試みる
            shape = shape.buffer(0)
            if not shape.is_valid:
                return {"status": "error", "message": "Invalid polygon geometry, buffer(0) failed."}

        all_paths = []
        current_offset = - (tool_diameter / 2) # 内側なので負の値

        while True:
            # 内側にオフセット
            offset_shape = shape.buffer(current_offset, join_style=2) # join_style=2はMITRE

            if offset_shape.is_empty:
                break

            # オフセット結果が複数のポリゴンに分かれる場合も考慮
            if offset_shape.geom_type == 'MultiPolygon':
                polygons = list(offset_shape.geoms)
            else:
                polygons = [offset_shape]

            for poly in polygons:
                path = list(poly.exterior.coords)
                all_paths.append(path)

            # 次のオフセット量を計算
            current_offset -= stepover

    except TopologicalError as e:
        return {"status": "error", "message": f"Topological error during offset: {e}"}
    except Exception as e:
        return {"status": "error", "message": f"An unexpected error occurred: {e}"}

    return {
        "status": "success",
        "toolpaths": all_paths
    }

if __name__ == "__main__":
    if len(sys.argv) > 3:
        try:
            geom_data_str = sys.argv[1]
            tool_dia = float(sys.argv[2])
            stepover_val = float(sys.argv[3])
            
            geom_data = json.loads(geom_data_str)
            
            result = generate_pocket_path(geom_data, tool_dia, stepover_val)
            print(json.dumps(result))
            sys.stdout.flush()
        except Exception as e:
            error_msg = {"status": "error", "message": f"Invalid arguments: {e}"}
            print(json.dumps(error_msg))
            sys.stdout.flush()
    else:
        error_msg = {"status": "error", "message": "Required arguments not provided."}
        print(json.dumps(error_msg))
        sys.stdout.flush()
