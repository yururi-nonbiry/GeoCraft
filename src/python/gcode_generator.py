import json
import sys

def generate_gcode(toolpath_segments, feed_rate, safe_z, step_down):
    """
    直線と円弧が混在するツールパスセグメントからGコードを生成する
    """
    gcode = []
    gcode.append('%')
    gcode.append('O0001')
    gcode.append('G90 G21 G17')  # 絶対座標系, mm単位, XY平面
    gcode.append('M03 S1000')      # 主軸正転 (回転数は仮)
    gcode.append(f'G00 Z{safe_z:.3f}') # 安全高さに移動

    is_first_move = True

    for segment in toolpath_segments:
        seg_type = segment.get('type')
        points = segment.get('points')

        if not points:
            continue

        start_point = points[0]

        # 最初のセグメントの開始点へ移動
        if is_first_move:
            gcode.append(f'G00 X{start_point[0]:.3f} Y{start_point[1]:.3f}')
            gcode.append(f'G01 Z{step_down:.3f} F{feed_rate / 2:.0f}')
            is_first_move = False
        else:
            # 前のセグメントの終点から今の始点へ移動 (必要なら)
            # TODO: パス間の接続をより賢くする
            gcode.append(f'G00 Z{safe_z:.3f}')
            gcode.append(f'G00 X{start_point[0]:.3f} Y{start_point[1]:.3f}')
            gcode.append(f'G01 Z{step_down:.3f} F{feed_rate / 2:.0f}')

        # セグメントの種類に応じてGコード生成
        if seg_type == 'line':
            for point in points[1:]:
                gcode.append(f'G01 X{point[0]:.3f} Y{point[1]:.3f} F{feed_rate:.0f}')
        
        elif seg_type == 'arc':
            end_point = segment['end']
            center = segment['center']
            direction = segment['direction']
            
            # I, J は始点から中心への相対ベクトル
            i = center[0] - start_point[0]
            j = center[1] - start_point[1]

            if direction == 'cw': # 時計回り
                gcode.append(f'G02 X{end_point[0]:.3f} Y{end_point[1]:.3f} I{i:.3f} J{j:.3f} F{feed_rate:.0f}')
            else: # 反時計回り
                gcode.append(f'G03 X{end_point[0]:.3f} Y{end_point[1]:.3f} I{i:.3f} J{j:.3f} F{feed_rate:.0f}')

    # 最終的な退避
    gcode.append(f'G00 Z{safe_z:.3f}')
    gcode.append('M05')  # 主軸停止
    gcode.append('M30')  # プログラム終了
    gcode.append('%')

    return {
        "status": "success",
        "gcode": "\n".join(gcode)
    }

if __name__ == "__main__":
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
            error_msg = {"status": "error", "message": f"Invalid arguments: {e}"}
            print(json.dumps(error_msg))
            sys.stdout.flush()
    else:
        error_msg = {"status": "error", "message": "Required arguments not provided."}
        print(json.dumps(error_msg))
        sys.stdout.flush()
