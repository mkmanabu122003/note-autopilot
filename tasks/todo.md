# 長文編集・レビューワークフロー

## 設計方針
- Telegram ベースの「レビューセッション」概念を導入
- API呼び出しを最大3-4回に制限（構造マップ + 一括リライト + 追加修正1回）
- Phase 0: 構造マップ（Haiku）→ Phase 1: 指示蓄積（コストゼロ）→ Phase 2: 一括実行（Sonnet/Opus 1回）

## 実装タスク

### Phase 0: 構造マップ生成
- [x] `electron/services/structure-map.js` 新規作成
  - Haiku で記事を分析し、セクション構造・文字数・品質指標を返す
  - 読みやすさと販売力の両面でチェック
  - Telegram 向けフォーマットで出力
- [x] `telegram.js` の `sendArticleForReview` に構造マップ自動送信を統合

### Phase 1: レビューセッション（指示蓄積）
- [x] `electron/services/review-session.js` 新規作成
  - セッション状態管理: idle → collecting → executing → done
  - 指示の蓄積（セクション指定 `S4 具体例追加` 形式のパース）
  - /done, /cancel, /undo, /status, /retry コマンド処理
- [x] `telegram.js` の `_handleTopicMessage` を改修
  - レビューセッション中は指示を蓄積、/done で一括実行
  - /edit で従来の即時編集モードにフォールバック

### Phase 2: 一括リライト
- [x] `electron/services/batch-rewriter.js` 新規作成
  - 全指示を1プロンプトにまとめて1回で実行
  - モデル選択: /done sonnet（デフォルト）/ /done opus（最高品質）
  - セクション単位の差分サマリー生成
  - Telegram / GitHub への結果反映

### テスト
- [x] review-session.test.js（18テスト全合格）
- [ ] 実環境での E2E テスト（Telegram Bot + Claude API）

## Telegram コマンド一覧

| コマンド | 説明 |
|---------|------|
| `S4 具体例を追加` | セクション4への指示を蓄積 |
| `全体 文体を統一` | 記事全体への指示を蓄積 |
| `/done` | 蓄積した指示を一括実行（Sonnet） |
| `/done opus` | Opus 4.6 で一括実行（最高品質） |
| `/undo` | 最後の指示を取消 |
| `/cancel` | 全指示をクリア |
| `/status` | セッション状態を確認 |
| `/retry S6 もう少し具体的に` | 追加修正モード |
| `/map` | 構造マップを再生成 |
| `/edit [指示]` | 従来の即時編集（セッション経由しない） |
| `/approve` | 承認 |
| `/reject` | 却下 |
