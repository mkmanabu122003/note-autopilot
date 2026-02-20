# 要件定義: GitHub連携 + AIリライト

## 背景

現在、記事は Electron アプリのローカルストレージ（`data/accounts/{accountId}/articles/*.md`）にのみ保存されている。
移動中にスマホから記事を確認・編集・AIリライトできるようにするため、GitHub をハブとした同期・編集・リライト機能を追加する。

---

## 機能2: GitHub連携（記事の同期 + モバイル編集）

### 2.1 概要

Electron アプリで生成した記事を GitHub リポジトリに同期し、GitHub Mobile から閲覧・編集できるようにする。

### 2.2 前提条件

- ユーザーが GitHub アカウントを持っていること
- 記事保存用の GitHub リポジトリ（private）が存在すること
- GitHub Personal Access Token（PAT）を発行済みであること

### 2.3 リポジトリ構成

```
{repository}/
├── {accountId}/
│   ├── drafts/              # ステータス: generated（AI生成直後）
│   │   ├── {topic}_{timestamp}.md
│   │   └── ...
│   ├── reviewing/           # ステータス: reviewing（レビュー中）
│   │   └── ...
│   ├── approved/            # ステータス: reviewed（承認済み）
│   │   └── ...
│   └── rejected/            # ステータス: rejected（却下・要リライト）
│       └── ...
└── {別のaccountId}/
    └── ...
```

- ステータスの変更はディレクトリ移動で表現する
- ファイル名は現行と同じ: `{sanitized_topic}_{timestamp}.md`

### 2.4 記事ファイルのフォーマット変更

現在の記事は純粋な Markdown だが、GitHub 同期にあたりメタデータの保持が必要になる。
ファイル先頭に YAML frontmatter を追加する。

```markdown
---
topic_id: 3
account_id: tokken
pillar: AI活用
is_paid: true
price: 500
generated_at: 2026-02-20T10:30:00Z
model: claude-sonnet-4-5-20250929
status: generated
tags:
  - AI
  - 副業
---

# 記事タイトル

本文...
<!-- paid-line -->
有料部分...
```

- Electron アプリ側も frontmatter の読み書きに対応する（既存の記事は frontmatter なしとして後方互換を保つ）

### 2.5 機能要件

#### 2.5.1 設定画面（Electron アプリ）

- GitHub PAT の入力・保存（暗号化ストレージ）
- リポジトリ名の入力（`owner/repo` 形式）
- 同期の有効/無効トグル
- 接続テストボタン（リポジトリへの読み書き権限を確認）

#### 2.5.2 Push（ローカル → GitHub）

- **トリガー:** 以下のタイミングで自動 push
  - 記事生成完了時
  - 記事の編集保存時
  - 記事のステータス変更時（承認/却下）
- **処理内容:**
  - 変更された記事ファイルを git add → commit → push
  - コミットメッセージ: `[auto] {操作内容} - {記事タイトル}`
  - 例: `[auto] 記事生成 - AIの基礎`, `[auto] ステータス変更: approved - AIの基礎`
- **競合時:** ローカルの変更を優先（force push はしない。競合が検出された場合は pull → マージを試みる）

#### 2.5.3 Pull（GitHub → ローカル）

- **トリガー:**
  - アプリ起動時に自動 pull
  - Inbox 画面に「同期」ボタンを配置し手動 pull
- **処理内容:**
  - GitHub 上の変更（ファイル編集、ディレクトリ移動）をローカルに反映
  - frontmatter の `status` とディレクトリ位置が矛盾する場合、ディレクトリ位置を正とする
  - 新規ファイルがあればローカルに追加
  - 削除されたファイルがあればローカルからも削除
- **競合時:** GitHub 側の変更を優先（モバイルでの編集を尊重する）

#### 2.5.4 同期状態の表示

- Inbox 画面のステータスバーに同期状態を表示
  - `同期済み`（最終同期時刻）
  - `同期中...`
  - `未同期の変更あり`（ローカルに未 push の変更がある）
  - `同期エラー`（ネットワークエラー等）

### 2.6 GitHub Mobile での操作

ユーザーが GitHub Mobile で行える操作（アプリ側の実装は不要、リポジトリ構成で自然に可能になる）:

- 記事の閲覧（Markdown プレビュー）
- 記事の直接編集（GitHub のファイル編集機能）
- ファイルの移動によるステータス変更（例: `drafts/` → `approved/`）

### 2.7 実装方針

- Git 操作には `simple-git`（npm パッケージ）を使用する
- ローカルの `data/accounts/{accountId}/articles/` ディレクトリ自体を git リポジトリとして管理するのではなく、別途同期用ディレクトリを用意してコピー＆同期する
  - 理由: 既存のローカルファイル管理を壊さない
- 同期用ディレクトリ: `{userData}/github-sync/{owner}_{repo}/`

---

## 機能3: PRコメントによるAIリライト（GitHub Actions）

### 3.1 概要

GitHub 上で PR コメントに `/rewrite` コマンドを書くと、GitHub Actions が Claude API を呼び出して記事をリライトし、結果を同じ PR にコミットする。

### 3.2 前提条件

- 機能2（GitHub 連携）が動作していること
- リポジトリの Secrets に `ANTHROPIC_API_KEY` が設定されていること
- GitHub Actions が有効であること

### 3.3 ワークフロー全体像

```
1. Electron アプリで記事を生成 → GitHub に push（機能2）
2. 自動で PR が作成される（対象: 新規記事 or 変更された記事）
3. ユーザーが GitHub Mobile で PR を開く
4. コメントに /rewrite コマンドを書く
5. GitHub Actions が起動
6. Claude API でリライト実行
7. 結果を同じブランチにコミット & push
8. ユーザーが差分を確認
9. 問題なければ PR をマージ → main ブランチに反映
10. 次回アプリ起動時に pull で同期（機能2）
```

### 3.4 ブランチ戦略

```
main                          ← 確定した記事（approved）
  └── edit/{accountId}/{date} ← 編集中の記事をまとめた PR ブランチ
```

- 記事生成時、`edit/{accountId}/{YYYY-MM-DD}` ブランチに push
- 同日に生成された記事は同じブランチにまとめる
- PR タイトル例: `[tokken] 2026-02-20 の記事（3件）`
- PR が作成されていなければ自動作成、既存なら追加コミット

### 3.5 /rewrite コマンド仕様

#### 基本構文

```
/rewrite [対象指定] [指示内容]
```

#### 対象指定のパターン

| 書き方 | 意味 | 例 |
|---|---|---|
| （省略） | PR内の変更ファイル全体 | `/rewrite もっとカジュアルに` |
| `ファイル名` | 特定の記事ファイル | `/rewrite AIの基礎.md 具体例を増やして` |
| `L10-L25` | 行範囲（PRの差分内） | `/rewrite L10-L25 この段落を書き直して` |
| `「...」` | 引用テキスト検索 | `/rewrite 「この部分」をもっと分かりやすく` |

#### 指示の例

```
/rewrite もっとカジュアルな文体にしてください
/rewrite 冒頭の段落にフックを追加して
/rewrite L15-L30 具体的な数値やデータを入れて説得力を上げて
/rewrite AIの基礎.md 読者が「自分にもできそう」と思える書き方に変えて
/rewrite 「AIツールを使えば簡単です」この部分に具体的な手順を追記して
```

#### 特殊コマンド

| コマンド | 説明 |
|---|---|
| `/rewrite undo` | 直前のリライトを取り消す（`git revert`） |
| `/rewrite diff` | リライト前後の差分をコメントで表示する（実際のコミットはしない） |

### 3.6 GitHub Actions ワークフロー

ファイル: `.github/workflows/ai-rewrite.yml`

#### トリガー

```yaml
on:
  issue_comment:
    types: [created]
```

- PR へのコメントのみ反応（issue コメントは無視）
- コメント本文が `/rewrite` で始まる場合のみ実行

#### 処理フロー

1. コメントをパース（対象指定 + 指示内容を分離）
2. PR のブランチをチェックアウト
3. 対象ファイルの内容を取得
4. Claude API を呼び出し
   - システムプロンプト: Electron アプリの `generator.js` と同じ SYSTEM_PROMPT を使用
   - ユーザーの writing_guidelines も適用（リポジトリ内の設定ファイルから読み込み）
   - ユーザープロンプト: 「以下の記事を指示に従ってリライトしてください」+ 対象テキスト + 指示内容
5. レスポンスで対象部分を差し替え
6. コミット & push
   - コミットメッセージ: `[rewrite] {指示内容の先頭30文字}`
7. PR にコメントでリライト完了を通知
   - 変更箇所のサマリー（何行変更されたか）
   - 差分のハイライト表示

#### エラーハンドリング

- パース失敗時: PR にコメントで使い方を返信
- API エラー時: PR にコメントでエラー内容を返信
- 対象ファイルが見つからない時: PR にコメントで候補ファイル名を返信

### 3.7 リポジトリ内の設定ファイル

リライト時に参照する設定をリポジトリのルートに配置する。

```
{repository}/
├── .rewrite-config.yml       ← リライト設定
├── {accountId}/
│   └── ...
```

`.rewrite-config.yml` の内容:

```yaml
# リライト時に適用するライティングガイドライン
writing_guidelines: |
  - 一文は60文字以内を目安にする
  - 専門用語には必ず補足説明を入れる
  - 具体的な数値や事例を含める

# 使用するモデル
model: claude-sonnet-4-5-20250929

# リライト時の追加システムプロンプト（オプション）
additional_prompt: |
  リライト時は元の記事の構成と主張を維持しつつ、
  指示された箇所のみを改善してください。
  <!-- paid-line --> の位置は変更しないでください。
```

- この設定は Electron アプリの設定画面から同期時に自動生成する
- GitHub 上で直接編集も可能

### 3.8 セキュリティ考慮事項

- `ANTHROPIC_API_KEY` は GitHub リポジトリの Secrets に保存（コードに含めない）
- リポジトリは必ず **private** にする（記事の内容が公開されないように）
- GitHub Actions の実行は PR コメント者がリポジトリの write 権限を持つ場合のみ
- API 呼び出し回数の上限: 1 PR あたり 1 日 20 回まで（意図しない連続実行の防止）

### 3.9 コスト見積もり

- **GitHub Actions:** private リポジトリは月 2,000 分まで無料（Free プラン）
  - 1 回のリライトに約 1〜2 分 → 月 1,000 回以上実行可能
- **Claude API:** リライト 1 回あたり約 $0.01〜0.03（Sonnet、記事 3,000〜5,000 文字の場合）
  - 月 100 回リライトしても $1〜3 程度

---

## 実装の優先順位

### Phase 1: GitHub 同期の基盤（機能2の最小構成）

1. 設定画面に GitHub PAT・リポジトリ名の入力欄を追加
2. frontmatter の読み書き対応
3. 記事生成時に自動 push
4. アプリ起動時に自動 pull
5. 同期状態の表示

### Phase 2: PR ベースの編集フロー（機能2 + 3の連携）

1. 記事 push 時に自動で PR 作成
2. GitHub Actions ワークフローの作成
3. `/rewrite` コマンドのパーサー実装
4. Claude API 呼び出しスクリプト
5. `.rewrite-config.yml` の自動生成

### Phase 3: 改善

1. `/rewrite undo` `/rewrite diff` の実装
2. 競合解決の改善
3. 同期の差分検出の最適化（変更があったファイルのみ push/pull）
