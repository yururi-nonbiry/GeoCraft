import sys
import json
import ezdxf
from ezdxf.math import Vec3
from ezdxf.render import forms

def get_point_with_z(point):
    """座標タプル/ベクターを[x, y, z]のリストに変換する。Zがなければ0.0を追加。"""
    return [point[0], point[1], point[2] if len(point) > 2 else 0.0]

def dxf_to_segments(filepath):
    """
    DXFファイルを解析し、図形を線分セグメントとドリルポイントのリストに変換する。
    """
    try:
        doc = ezdxf.readfile(filepath)
        msp = doc.modelspace()
    except IOError:
        return {"status": "error", "message": "Not a DXF file or a generic I/O error."}
    except ezdxf.DXFStructureError:
        return {"status": "error", "message": "Invalid or corrupted DXF file."}

    all_segments = []
    drill_points = []
    try:
        for entity in msp:
            if entity.dxftype() == 'LINE':
                start = get_point_with_z(entity.dxf.start)
                end = get_point_with_z(entity.dxf.end)
                all_segments.append([start, end])
            
            elif entity.dxftype() == 'LWPOLYLINE' or entity.dxftype() == 'POLYLINE':
                is_closed = entity.is_closed
                with entity.points() as points:
                    if is_closed and len(points) > 1:
                        points.append(points[0])
                    
                    for i in range(len(points) - 1):
                        start = get_point_with_z(points[i])
                        end = get_point_with_z(points[i+1])
                        all_segments.append([start, end])

            elif entity.dxftype() in ['CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE']:
                # `construction_tool`を持つエンティティをポリラインに変換
                try:
                    vertices = list(forms.adaptive_flattening(entity, segments=16))
                    if entity.dxftype() == 'CIRCLE':
                        center = get_point_with_z(entity.dxf.center)
                        drill_points.append(center)
                    
                    for i in range(len(vertices) - 1):
                        start = get_point_with_z(vertices[i])
                        end = get_point_with_z(vertices[i+1])
                        all_segments.append([start, end])
                except (AttributeError, TypeError):
                    # flatteningできないエンティティはスキップ
                    pass
    except Exception as e:
        return {"status": "error", "message": f"An error occurred while processing entities: {str(e)}"}

    return {
        "status": "success",
        "segments": all_segments,
        "drill_points": drill_points
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        result = dxf_to_segments(filepath)
        print(json.dumps(result))
        sys.stdout.flush()
    else:
        error_msg = {"status": "error", "message": "DXF file path not provided."}
        print(json.dumps(error_msg))
        sys.stdout.flush()