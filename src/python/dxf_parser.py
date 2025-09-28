import sys
import json
import math
import ezdxf
from ezdxf.math import Vec3
from ezdxf.render import forms

def get_point_with_z(point):
    """座標タプル/ベクターを[x, y, z]のリストに変換する。Zがなければ0.0を追加。"""
    return [point[0], point[1], point[2] if len(point) > 2 else 0.0]

def parse_dxf(filepath):
    """
    DXFファイルを解析し、図形を線分、円弧、ドリルポイントのリストに変換する。
    """
    try:
        doc = ezdxf.readfile(filepath)
        msp = doc.modelspace()
    except IOError:
        return {"status": "error", "message": "Not a DXF file or a generic I/O error."}
    except ezdxf.DXFStructureError:
        return {"status": "error", "message": "Invalid or corrupted DXF file."}

    all_segments = []
    arcs = []
    drill_points = []
    try:
        for entity in msp:
            if entity.dxftype() == 'LINE':
                start = get_point_with_z(entity.dxf.start)
                end = get_point_with_z(entity.dxf.end)
                all_segments.append([start, end])
            
            elif entity.dxftype() == 'LWPOLYLINE' or entity.dxftype() == 'POLYLINE':
                # ポリライン内の円弧（bulge）も線分に変換する
                # TODO: bulgeを円弧情報として抽出する
                is_closed = entity.is_closed
                with entity.points() as points:
                    if is_closed and len(points) > 1:
                        points.append(points[0])
                    
                    for i in range(len(points) - 1):
                        start = get_point_with_z(points[i])
                        end = get_point_with_z(points[i+1])
                        all_segments.append([start, end])

            elif entity.dxftype() == 'CIRCLE':
                center = get_point_with_z(entity.dxf.center)
                radius = entity.dxf.radius
                drill_points.append(center)
                arcs.append({
                    "center": center,
                    "radius": radius,
                    "start_angle": 0,
                    "end_angle": 360,
                })

            elif entity.dxftype() == 'ARC':
                center = get_point_with_z(entity.dxf.center)
                radius = entity.dxf.radius
                start_angle = math.degrees(entity.dxf.start_angle)
                end_angle = math.degrees(entity.dxf.end_angle)
                arcs.append({
                    "center": center,
                    "radius": radius,
                    "start_angle": start_angle,
                    "end_angle": end_angle,
                })

            elif entity.dxftype() in ['ELLIPSE', 'SPLINE']:
                # これらの複雑な形状は線分に変換する
                try:
                    vertices = list(forms.adaptive_flattening(entity, segments=16))
                    for i in range(len(vertices) - 1):
                        start = get_point_with_z(vertices[i])
                        end = get_point_with_z(vertices[i+1])
                        all_segments.append([start, end])
                except (AttributeError, TypeError):
                    pass
    except Exception as e:
        return {"status": "error", "message": f"An error occurred while processing entities: {str(e)}"}

    return {
        "status": "success",
        "segments": all_segments,
        "arcs": arcs,
        "drill_points": drill_points
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        result = parse_dxf(filepath)
        print(json.dumps(result))
        sys.stdout.flush()
    else:
        error_msg = {"status": "error", "message": "DXF file path not provided."}
        print(json.dumps(error_msg))
        sys.stdout.flush()
