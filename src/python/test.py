import json
import sys
import time

def main():
    # 何か時間がかかる処理をシミュレート
    time.sleep(0.5)
    
    # フロントエンドに返すデータ
    data = {
        "status": "success",
        "message": "Hello from Python!"
    }
    
    # JSON形式で標準出力に出力
    print(json.dumps(data))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
