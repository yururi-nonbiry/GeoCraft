import json
import sys

def generate_gcode(toolpath, feed_rate, safe_z, step_down):
    """
    ツールパスの座標リストから基本的なGコードを生成する
    """
    gcode = []
    gcode.append('%')
    gcode.append('O0001')
    gcode.append('G90 G21 G17') # 絶対座標系, mm単位, XY平面
    gcode.append('M03 S1000') # 主軸正転 (回転数は仮)
    gcode.append(f'G00 Z{safe_z:.3f}') # 安全高さまで早送り

    # 最初の点へ移動
    start_point = toolpath[0]
    gcode.append(f'G00 X{start_point[0]:.3f} Y{start_point[1]:.3f}')

    # 切り込み
    gcode.append(f'G01 Z{step_down:.3f} F{feed_rate / 2:.0f}') # 切り込みは半分の速度で

    # ツールパスに沿って加工
    for point in toolpath[1:]:
        gcode.append(f'G01 X{point[0]:.3f} Y{point[1]:.3f} F{feed_rate:.0f}')
    
    # 最初の点に戻って輪郭を閉じる
    gcode.append(f'G01 X{start_point[0]:.3f} Y{start_point[1]:.3f}')

    # 退避
    gcode.append(f'G00 Z{safe_z:.3f}')
    gcode.append('M05') # 主軸停止
    gcode.append('M30') # プログラム終了
    gcode.append('%')
    
    return {
        "status": "success",
        "gcode": "\n".join(gcode) # 改行で連結した文字列
    }

if __name__ == "__main__":
    if len(sys.argv) > 4:
        try:
            toolpath_str = sys.argv[1]
            feed_rate = float(sys.argv[2])
            safe_z = float(sys.argv[3])
            step_down = float(sys.argv[4])
            
            toolpath = json.loads(toolpath_str)
            
            result = generate_gcode(toolpath, feed_rate, safe_z, step_down)
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
