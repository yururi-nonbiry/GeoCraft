import sys
import json
import math
import ezdxf
from ezdxf.math import Vec3
from ezdxf.render import forms

def get_point_with_z(point):
    """座標タプル/ベクターを[x, y, z]のリストに変換する。Zがなければ0.0を追加。"""
    return [point[0], point[1], point[2] if len(point) > 2 else 0.0]

def bulge_to_arc(start_point, end_point, bulge, elevation):
    '''bulge値から円弧情報を計算する'''
    if abs(bulge) < 1e-8:
        return None

    x1, y1 = start_point[0], start_point[1]
    x2, y2 = end_point[0], end_point[1]
    chord = math.hypot(x2 - x1, y2 - y1)
    if chord < 1e-8:
        return None

    theta = 4 * math.atan(bulge)
    if abs(theta) < 1e-8:
        return None

    radius = chord / (2 * math.sin(abs(theta) / 2))
    if radius <= 0:
        return None

    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2
    dir_x = (x2 - x1) / chord
    dir_y = (y2 - y1) / chord
    perp_x = -dir_y
    perp_y = dir_x

    sagitta = math.sqrt(max(radius ** 2 - (chord / 2) ** 2, 0.0))
    direction_sign = 1 if bulge > 0 else -1

    center_x = mid_x + perp_x * sagitta * direction_sign
    center_y = mid_y + perp_y * sagitta * direction_sign

    start_angle = math.degrees(math.atan2(y1 - center_y, x1 - center_x))
    end_angle = math.degrees(math.atan2(y2 - center_y, x2 - center_x))

    if direction_sign > 0 and end_angle <= start_angle:
        end_angle += 360
    elif direction_sign < 0 and end_angle >= start_angle:
        end_angle -= 360

    return {
        'center': [center_x, center_y, elevation],
        'radius': radius,
        'start_angle': start_angle,
        'end_angle': end_angle
    }

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
            
            elif entity.dxftype() == 'LWPOLYLINE':
                is_closed = entity.is_closed
                elevation = float(getattr(entity.dxf, 'elevation', 0.0) or 0.0)
                try:
                    vertex_data = list(entity.get_points('xyb'))
                except (AttributeError, TypeError):
                    vertex_data = []
                if not vertex_data:
                    with entity.points() as points:
                        if is_closed and len(points) > 1:
                            points.append(points[0])

                        for i in range(len(points) - 1):
                            start = get_point_with_z(points[i])
                            end = get_point_with_z(points[i+1])
                            all_segments.append([start, end])
                    continue

                point_count = len(vertex_data)
                for idx in range(point_count):
                    next_idx = idx + 1
                    if next_idx == point_count and not is_closed:
                        break
                    next_idx %= point_count

                    current = vertex_data[idx]
                    nxt = vertex_data[next_idx]

                    x1, y1 = current[0], current[1]
                    bulge = current[2] if len(current) > 2 else 0.0
                    x2, y2 = nxt[0], nxt[1]

                    start = [x1, y1, elevation]
                    end = [x2, y2, elevation]
                    all_segments.append([start, end])

                    arc_info = bulge_to_arc(start, end, bulge, elevation)
                    if arc_info:
                        arcs.append(arc_info)

            elif entity.dxftype() == 'POLYLINE':
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
