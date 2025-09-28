## 言語
このアプリケーションは日本語としてください
ユーザーへのメッセージは日本語で送信してください

## コマンド実行について
コマンドを実行するときは docker compose run を使用してください

## 仕様について
readme.mdに仕様が書かれているので最初に把握してください
readme.mdに不足している内容があったら修正してください

## Python環境について
このプロジェクトのPythonスクリプトは、`.venv`という名前の仮想環境で実行します。
環境のセットアップと依存関係のインストールは、以下のコマンドで行ってください。

**Windows:**
```shell
python -m venv .venv
.venv\Scripts\activate
pip install -r src/python/requirements.txt
```

**macOS / Linux:**
```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r src/python/requirements.txt
```
