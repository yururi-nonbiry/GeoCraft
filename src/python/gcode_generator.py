import json
import sys

def generate_gcode(toolpaths, feed_rate, safe_z, step_down):
    """
    複数のツールパスのリストから、パス間移動を考慮したGコードを生成する
    """
    gcode = []
    gcode.append('%')
    gcode.append('O0001')
    gcode.append('G90 G21 G17') # 絶対座標系, mm単位, XY平面
    gcode.append('M03 S1000') # 主軸正転 (回転数は仮)
    
    # 各ツールパスを処理
    for i, path in enumerate(toolpaths):
        if not path:
            continue

        # パスの開始点
        start_point = path[0]
        
        # 安全高さまで移動
        gcode.append(f'G00 Z{safe_z:.3f}')

        # パスの開始点上空へ早送り
        gcode.append(f'G00 X{start_point[0]:.3f} Y{start_point[1]:.3f}')

        # 切り込み
        gcode.append(f'G01 Z{step_down:.3f} F{feed_rate / 2:.0f}')

        # パスに沿って加工
        for point in path[1:]:
            gcode.append(f'G01 X{point[0]:.3f} Y{point[1]:.3f} F{feed_rate:.0f}')
        
        # 輪郭を閉じる（もし開いていれば）
        if path[0] != path[-1]:
             gcode.append(f'G01 X{start_point[0]:.3f} Y{start_point[1]:.3f}')

    # 最終的な退避
    gcode.append(f'G00 Z{safe_z:.3f}')
    gcode.append('M05') # 主軸停止
    gcode.append('M30') # プログラム終了
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
            
            toolpaths = json.loads(toolpaths_str)
            
            result = generate_gcode(toolpaths, feed_rate, safe_z, step_down)
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