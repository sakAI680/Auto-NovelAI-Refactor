# Auto-NovelAI-Refactor 日本語 UI

右上の言語セレクターで **日本語 / 简体中文** を切り替えられます。初期表示は日本語です。選択はブラウザーの `localStorage` (`anr-ui-language`) に保存されます。保存領域が使えない場合も、そのセッション内では切り替えられます。

ページの再読み込みは不要です。入力中のプロンプト、Token、パラメータ、プラグインの選択値は切り替え時に保持されます。言語選択によってサーバーの個人設定は変更されません。

## 起動

Python 3.10 以上で、従来どおり起動できます。Node.js やフロントエンドのビルドは不要です。

```sh
python -m pip install -r requirements.txt
python -X utf8 main.py
```

クラウドなどデスクトップのない環境では、リポジトリのルートから次の方法でも起動できます。

```sh
python -X utf8 -m uvicorn main:app --host 127.0.0.1 --port 11451
```

## 翻訳の範囲

メニュー、設定、ボタン、説明、通知・エラーの表示、画像編集・キュー、プラグインの UI メタデータを翻訳します。ストアに登録されている7種類のプラグインの既知の文言を辞書に収録しています。プラグイン本体のインストールや更新は行いません。

NovelAI のプロンプト、生成タグ、モデルID、APIキー、APIの送信値・レスポンス、ファイル名・パス、ユーザーの入力、ログの原文は変更しません。画像メタデータの内容もそのまま表示します。パスのテンプレートに使う `<类型>` などの識別子も保持します。既存の「プロンプトを翻訳」操作は UI の言語切り替えとは独立しています。

新しい本家・プラグインの文言で辞書にないものは元の言語で表示されます。外部サービスが返す未知の診断やプラグインの任意の出力も原文を保持します。

## 翻訳の追加・更新

- `web/js/i18n.js`: 言語選択、表示専用の翻訳、再読み込みなしの更新。
- `web/js/locales/ja.js`: 本体の中国語原文 → 日本語の辞書。
- `web/js/locales/plugins-ja.js`: プラグインの表示文言の辞書。

本家の中国語原文をキーとして残し、翻訳を辞書に分離しています。バックエンドのモデル定義やAPIスキーマの変更は不要です。中国語は原文をそのまま使います。

表示を追加するときは `m` (`uiMessage` という別名で import) と既存の `el` を使います。

```js
import { m as uiMessage, setText } from "./i18n.js";
el("button", { text: uiMessage("保存") });
setText(status, uiMessage("已保存 <{0}:{1}>!", category, name));
```

`{0}` などの引数は原文のまま挿入されます。引数自体が UI 文言である場合のみ、明示的に `uiMessage` で包んでください。ユーザーのプロンプト、ファイル名、出力内容を翻訳関数へ渡さないでください。DOM 全体の自動翻訳や部分文字列の一括置換は使いません。初期HTMLの固定ラベルだけは起動時に登録します。

プラグインでは表示用の `label` / `title` / `description` / `placeholder` と選択肢のラベルだけを翻訳します。`id` / `default` / `value` / `data-value` / `show_if` / アクションの入力は原文のままです。`info` 型の説明HTMLは表示専用のため翻訳できます。

## 検証

リポジトリのルートから実行します。

```sh
python -X utf8 tests/test_contracts.py
node --test web/js/__tests__/crop_contract.test.mjs web/js/__tests__/i18n.test.mjs
ruff check . --no-cache
ruff format --check . --no-cache
```

ブラウザーテストには、テスト用として別途 Playwright と Chromium を用意します。アプリ本体の npm 依存は追加していません。ローカルサーバーを起動し、次のように実行できます。

```sh
ANR_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
ANR_CHROMIUM=/usr/bin/chromium \
node --test web/js/__tests__/i18n.browser.mjs
```

サーバーのURLは `ANR_TEST_URL` で指定できます。生成リクエスト・プラグインの書き込みはテスト内でモック化し、実生成・ポイント消費・個人設定の保存は行いません。テストは全画面とタブの操作、通知・エラーの翻訳、言語選択の保持、言語切り替え前後の生成・プラグインAPI送信値の一致を確認します。

`settings.json`、`last.json`、`.env`、`data/`、`outputs/` は引き続き Git 管理対象外です。Token や個人設定をコミットしないでください。
