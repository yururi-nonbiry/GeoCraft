import json
import sys

def generate_drill_gcode(drill_points, safe_z, retract_z, step_down, peck_q):
    """
    ドリル点のリストからG83（ペックドリル）のGコードを生成する
    """
    gcode = []
    gcode.append('%')
    gcode.append('O0002')
    gcode.append('G90 G21 G17') # 絶対座標系, mm単位, XY平面
    gcode.append('M03 S800')   # 主軸正転 (回転数は仮)
    gcode.append(f'G00 Z{safe_z:.3f}')

    # G83サイクルを開始
    # G98: サイクル完了後、初期高さに戻る
    # Z: 穴の最終深さ
    # R: 切り込み開始高さ
    # Q: 1回あたりの切り込み量（ペック量）
    # F: 送り速度
    gcode.append(f'G98 G83 Z{step_down:.3f} R{retract_z:.3f} Q{peck_q:.3f} F100')

    # 各ドリル点でサイクルを実行
    for point in drill_points:
        gcode.append(f'X{point[0]:.3f} Y{point[1]:.3f}')

    # ドリルサイクルをキャンセル
    gcode.append('G80')
    
    # 終了処理
    gcode.append(f'G00 Z{safe_z:.3f}')
    gcode.append('M05') # 主軸停止
    gcode.append('M30') # プログラム終了
    gcode.append('%')
    
    return {
        "status": "success",
        "gcode": "\n".join(gcode)
    }

if __name__ == "__main__":
    if len(sys.argv) > 5:
        try:
            points_str = sys.argv[1]
            safe_z = float(sys.argv[2])
            retract_z = float(sys.argv[3])
            step_down = float(sys.argv[4])
            peck_q = float(sys.argv[5])
            
            drill_points = json.loads(points_str)
            
            result = generate_drill_gcode(drill_points, safe_z, retract_z, step_down, peck_q)
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
