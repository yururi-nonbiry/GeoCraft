import json
import sys
from typing import Optional, Sequence, Tuple

def _extract_xy(point: Sequence[float]) -> Tuple[float, float]:
    if len(point) < 2:
        raise ValueError('Point requires at least x and y values.')
    return float(point[0]), float(point[1])


def _points_close(p1: Tuple[float, float], p2: Tuple[float, float], tol: float = 1e-4) -> bool:
    return abs(p1[0] - p2[0]) <= tol and abs(p1[1] - p2[1]) <= tol


def generate_gcode(toolpath_segments, feed_rate, safe_z, step_down):
    """Convert mixed line/arc toolpath segments into G-code."""
    gcode = []
    gcode.append('%')
    gcode.append('O0001')
    gcode.append('G90 G21 G17')  # absolute coordinates, mm units, XY plane
    gcode.append('M03 S1000')    # spindle on (speed placeholder)
    gcode.append(f'G00 Z{safe_z:.3f}')

    current_xy: Optional[Tuple[float, float]] = None
    is_cutting = False

    for segment in toolpath_segments:
        points = segment.get('points')
        if not points:
            continue

        try:
            start_xy = _extract_xy(points[0])
        except (TypeError, ValueError):
            continue

        if current_xy is None or not _points_close(current_xy, start_xy):
            if is_cutting:
                gcode.append(f'G00 Z{safe_z:.3f}')
                is_cutting = False
            gcode.append(f'G00 X{start_xy[0]:.3f} Y{start_xy[1]:.3f}')
            gcode.append(f'G01 Z{step_down:.3f} F{feed_rate / 2:.0f}')
            is_cutting = True
        elif not is_cutting:
            gcode.append(f'G01 Z{step_down:.3f} F{feed_rate / 2:.0f}')
            is_cutting = True

        seg_type = segment.get('type')
        last_xy = start_xy

        if seg_type == 'arc':
            end_point = segment.get('end') or points[-1]
            center = segment.get('center')
            direction = segment.get('direction', 'cw')
            if center is None or end_point is None:
                continue

            try:
                end_xy = _extract_xy(end_point)
                cx, cy = _extract_xy(center)
            except (TypeError, ValueError):
                continue

            i = cx - start_xy[0]
            j = cy - start_xy[1]
            code = 'G02' if direction == 'cw' else 'G03'
            gcode.append(
                f"{code} X{end_xy[0]:.3f} Y{end_xy[1]:.3f} I{i:.3f} J{j:.3f} F{feed_rate:.0f}"
            )
            last_xy = end_xy
        else:
            for point in points[1:]:
                try:
                    px, py = _extract_xy(point)
                except (TypeError, ValueError):
                    continue
                gcode.append(f'G01 X{px:.3f} Y{py:.3f} F{feed_rate:.0f}')
                last_xy = (px, py)

        current_xy = last_xy

    if is_cutting:
        gcode.append(f'G00 Z{safe_z:.3f}')

    gcode.append('M05')
    gcode.append('M30')
    gcode.append('%')

    return {
        'status': 'success',
        'gcode': '\n'.join(gcode)
    }


if __name__ == '__main__':
    if len(sys.argv) > 4:
        try:
            toolpaths_str = sys.argv[1]
            feed_rate = float(sys.argv[2])
            safe_z = float(sys.argv[3])
            step_down = float(sys.argv[4])

            toolpath_segments = json.loads(toolpaths_str)

            result = generate_gcode(toolpath_segments, feed_rate, safe_z, step_down)
            print(json.dumps(result))
            sys.stdout.flush()
        except Exception as e:
            error_msg = {'status': 'error', 'message': f'Invalid arguments: {e}'}
            print(json.dumps(error_msg))
            sys.stdout.flush()
    else:
        error_msg = {'status': 'error', 'message': 'Required arguments not provided.'}
        print(json.dumps(error_msg))
        sys.stdout.flush()
