import sys
import json
import ezdxf
from ezdxf.math import Vec3
from ezdxf.render import forms

def dxf_to_segments(filepath):
    """
    DXFファイルを解析し、図形を線分セグメントのリストに変換する。
    """
    try:
        doc = ezdxf.readfile(filepath)
        msp = doc.modelspace()
    except IOError:
        return {"status": "error", "message": "Not a DXF file or a generic I/O error."}
    except ezdxf.DXFStructureError:
        return {"status": "error", "message": "Invalid or corrupted DXF file."}

    all_segments = []
    try:
        for entity in msp:
            if entity.dxftype() == 'LINE':
                start = entity.dxf.start
                end = entity.dxf.end
                all_segments.append([[start[0], start[1], start[2]], [end[0], end[1], end[2]]])
            
            elif entity.dxftype() == 'LWPOLYLINE' or entity.dxftype() == 'POLYLINE':
                is_closed = entity.is_closed
                with entity.points() as points:
                    if is_closed and len(points) > 1:
                        points.append(points[0])
                    
                    for i in range(len(points) - 1):
                        start = points[i]
                        end = points[i+1]
                        all_segments.append([[start[0], start[1], start[2]], [end[0], end[1], end[2]]])

            elif entity.dxftype() in ['CIRCLE', 'ARC']:
                vertices = list(entity.flattening(distance=0.1))
                for i in range(len(vertices) - 1):
                    start = vertices[i]
                    end = vertices[i+1]
                    start_point = [start[0], start[1], start[2] if len(start) > 2 else 0]
                    end_point = [end[0], end[1], end[2] if len(end) > 2 else 0]
                    all_segments.append([start_point, end_point])
    except Exception as e:
        return {"status": "error", "message": f"An error occurred while processing entities: {str(e)}"}

    return {
        "status": "success",
        "segments": all_segments
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