import json
import sys
from shapely.geometry import Polygon, LineString

def generate_contour_path(tool_diameter, geometry_data, side):
    """
    与えられたジオメトリデータから輪郭加工パスを生成する
    """
    # geometry_dataは頂点のリスト [[x1, y1], [x2, y2], ...] と想定
    if len(geometry_data) < 3:
        return {"status": "error", "message": "Invalid geometry data. At least 3 points are required."}

    # 頂点リストからポリゴンを作成
    # Z座標は無視して2Dとして扱う
    shape = Polygon([(p[0], p[1]) for p in geometry_data])

    if not shape.is_valid:
        return {"status": "error", "message": "Invalid polygon geometry."}

    # 工具半径でオフセットを計算
    tool_radius = tool_diameter / 2
    
    # sideに応じてオフセット方向を決定
    offset_distance = tool_radius if side == 'outer' else -tool_radius
    
    toolpath_geom = shape.exterior.offset_curve(offset_distance)
    
    # 座標をリストに変換
    if isinstance(toolpath_geom, LineString):
        path_coords = list(toolpath_geom.coords)
    else: # MultiLineStringの場合
        # 簡単のため、最初のLineStringだけを使う
        path_coords = list(toolpath_geom.geoms[0].coords)

    return {
        "status": "success",
        "toolpath": path_coords
    }

if __name__ == "__main__":
    if len(sys.argv) > 3:
        try:
            tool_dia = float(sys.argv[1])
            # 第2引数はJSON文字列として渡される
            geom_data_str = sys.argv[2]
            geom_data = json.loads(geom_data_str)
            side = sys.argv[3]
            
            result = generate_contour_path(tool_dia, geom_data, side)
            print(json.dumps(result))
            sys.stdout.flush()
        except (ValueError, json.JSONDecodeError) as e:
            error_msg = {"status": "error", "message": f"Invalid arguments: {e}"}
            print(json.dumps(error_msg))
            sys.stdout.flush()
    else:
        error_msg = {"status": "error", "message": "Tool diameter, geometry data, and side not provided."}
        print(json.dumps(error_msg))
        sys.stdout.flush()