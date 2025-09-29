import json
import math
import sys
from typing import Iterable, List, Optional, Tuple

import numpy as np

Point = List[float]


def _normalize_point(point: Iterable[float]) -> Point:
    values = list(point)
    if len(values) < 2:
        raise ValueError('point requires at least x and y components')
    if len(values) >= 3:
        return [float(values[0]), float(values[1]), float(values[2])]
    return [float(values[0]), float(values[1]), 0.0]


def _clone_point(point: Point) -> Point:
    return [float(point[0]), float(point[1]), float(point[2])]


def _points_to_numpy(points: List[Point]) -> np.ndarray:
    return np.array([[p[0], p[1]] for p in points], dtype=float)


def _fit_circle(points2d: np.ndarray) -> Tuple[float, float, float]:
    """Least-squares fit of a circle to the supplied 2D points."""
    A = np.column_stack((2 * points2d[:, 0], 2 * points2d[:, 1], np.ones(len(points2d))))
    b = points2d[:, 0] ** 2 + points2d[:, 1] ** 2
    solution, _, rank, _ = np.linalg.lstsq(A, b, rcond=None)
    if rank < 3:
        raise np.linalg.LinAlgError('degenerate configuration')
    cx, cy, c = solution
    radius_sq = cx * cx + cy * cy + c
    if radius_sq <= 0:
        raise np.linalg.LinAlgError('non-positive radius')
    return cx, cy, math.sqrt(radius_sq)


def _remove_consecutive_duplicates(points: List[Point], tol: float = 1e-6) -> List[Point]:
    cleaned: List[Point] = []
    for pt in points:
        if not cleaned:
            cleaned.append(pt)
            continue
        prev = cleaned[-1]
        if (
            abs(prev[0] - pt[0]) < tol
            and abs(prev[1] - pt[1]) < tol
            and abs(prev[2] - pt[2]) < tol
        ):
            continue
        cleaned.append(pt)
    return cleaned


def _estimate_radius(points: List[Point]) -> Optional[float]:
    if len(points) < 3:
        return None
    indices = [0, len(points) // 2, len(points) - 1]
    sample = np.array([[points[i][0], points[i][1]] for i in indices], dtype=float)
    try:
        _, _, radius = _fit_circle(sample)
    except np.linalg.LinAlgError:
        return None
    return radius


def _select_original_arc(radius: Optional[float], original_arcs: List[dict]) -> Optional[dict]:
    if radius is None or not original_arcs:
        return None
    best = None
    best_diff = None
    for arc in original_arcs:
        arc_radius = arc.get('radius')
        if arc_radius is None:
            continue
        diff = abs(float(arc_radius) - radius)
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best = arc
    if best is None:
        return None
    if best_diff is not None and best_diff > max(radius * 0.1, 1.0):
        return None
    return best


def fit_arc_to_points(points: List[Point], original_arc: Optional[dict]) -> Tuple[bool, Optional[dict]]:
    """Check whether the given points can be represented by a circular arc."""
    if len(points) < 3:
        return False, None

    points2d = _points_to_numpy(points)
    if np.allclose(points2d[0], points2d[-1]):
        return False, None

    try:
        cx, cy, radius = _fit_circle(points2d)
    except np.linalg.LinAlgError:
        return False, None

    if not np.isfinite(radius) or radius <= 0:
        return False, None

    expected_radius = radius
    if original_arc and 'radius' in original_arc:
        expected_radius = float(original_arc['radius'])
        if abs(radius - expected_radius) > max(expected_radius * 0.05, 0.5):
            return False, None

    center = np.array([cx, cy])
    distances = np.linalg.norm(points2d - center, axis=1)
    max_deviation = float(np.max(np.abs(distances - radius)))
    tolerance = max(expected_radius * 0.01, 0.05)
    if max_deviation > tolerance:
        return False, None

    angles = np.unwrap(np.arctan2(points2d[:, 1] - cy, points2d[:, 0] - cx))
    total_change = angles[-1] - angles[0]
    if abs(total_change) < math.radians(5):
        return False, None

    direction = 'ccw' if total_change > 0 else 'cw'

    start = _clone_point(points[0])
    end = _clone_point(points[-1])
    center_with_z = [float(cx), float(cy), start[2]]

    return True, {
        'type': 'arc',
        'start': start,
        'end': end,
        'center': center_with_z,
        'radius': float(radius),
        'direction': direction,
        'start_angle': math.degrees(angles[0]),
        'end_angle': math.degrees(angles[-1]),
        'max_deviation': max_deviation,
        'points': [start, end],
    }


def find_arc_segments(toolpath: List[Iterable[float]], original_arcs: List[dict]) -> List[dict]:
    """Split a polyline toolpath into line and arc segments."""
    if not toolpath:
        return []

    normalized = [_normalize_point(p) for p in toolpath]
    normalized = _remove_consecutive_duplicates(normalized)
    if len(normalized) < 2:
        return []

    segments: List[dict] = []
    i = 0
    count = len(normalized)
    max_window = 18
    min_points = 3

    while i < count - 1:
        best_arc_info: Optional[dict] = None
        best_arc_end: Optional[int] = None

        for j in range(i + min_points - 1, min(count, i + max_window)):
            candidate_points = normalized[i:j + 1]
            radius_estimate = _estimate_radius(candidate_points)
            matching_arc = _select_original_arc(radius_estimate, original_arcs)
            success, arc_info = fit_arc_to_points(candidate_points, matching_arc)
            if not success:
                if best_arc_info is not None:
                    break
                continue

            if (
                best_arc_end is None
                or j > best_arc_end
                or (
                    j == best_arc_end
                    and arc_info['max_deviation'] < best_arc_info['max_deviation']
                )
            ):
                best_arc_info = arc_info
                best_arc_end = j

        if best_arc_info is not None and best_arc_end is not None:
            segments.append({
                'type': 'arc',
                'points': [best_arc_info['start'], best_arc_info['end']],
                'start': best_arc_info['start'],
                'end': best_arc_info['end'],
                'center': best_arc_info['center'],
                'radius': best_arc_info['radius'],
                'direction': best_arc_info['direction'],
            })
            i = best_arc_end
            continue

        start_pt = _clone_point(normalized[i])
        end_pt = _clone_point(normalized[i + 1])
        if segments and segments[-1]['type'] == 'line':
            last_points = segments[-1]['points']
            if any(abs(a - b) > 1e-6 for a, b in zip(last_points[-1], start_pt)):
                last_points.append(start_pt)
            last_points.append(end_pt)
        else:
            segments.append({'type': 'line', 'points': [start_pt, end_pt]})
        i += 1

    return segments


def main():
    if len(sys.argv) > 2:
        try:
            toolpath_str = sys.argv[1]
            original_arcs_str = sys.argv[2]

            toolpath = json.loads(toolpath_str)
            original_arcs = json.loads(original_arcs_str)

            result_segments = find_arc_segments(toolpath, original_arcs)

            print(json.dumps({'status': 'success', 'toolpath_segments': result_segments}))
            sys.stdout.flush()

        except Exception as e:
            error_msg = {'status': 'error', 'message': f'An error occurred: {e}'}
            print(json.dumps(error_msg))
            sys.stdout.flush()
    else:
        error_msg = {'status': 'error', 'message': 'Required arguments not provided.'}
        print(json.dumps(error_msg))
        sys.stdout.flush()


if __name__ == '__main__':
    main()
