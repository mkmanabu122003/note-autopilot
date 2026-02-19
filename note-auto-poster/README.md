# note AutoPoster

note.com への記事投稿を自動化するデスクトップアプリケーション。Google Sheets でテーマを管理し、Claude AI で記事を生成、レビュー後に投稿するワークフローを提供します。

## 技術スタック

- **Electron** + **React 18** + **Vite** (デスクトップアプリ)
- **Tailwind CSS** (UI)
- **Claude API** (@anthropic-ai/sdk) (記事生成)
- **Google Sheets API** (googleapis) (テーマ管理)
- **electron-store** (暗号化された設定保存)
- **Vitest** + **Testing Library** (テスト)

## セットアップ

### 前提条件

- Node.js 18+
- npm

### インストール

```bash
cd note-auto-poster
npm install
```

### 開発モード

```bash
# Electron + Vite 同時起動
npm run electron:dev

# Vite のみ (ブラウザ確認用)
npm run dev
```

`electron:dev` で起動すると、Vite dev server (localhost:5173) を待ってから Electron ウィンドウが開きます。DevTools も自動で開きます。

### テスト

```bash
npm test
```

## ビルド

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux

# 全プラットフォーム
npm run build

# インストーラなし (ディレクトリのみ)
npm run pack
```

ビルド成果物は `release/` ディレクトリに出力されます。

| プラットフォーム | 形式 | アーキテクチャ |
|:---:|:---:|:---:|
| macOS | DMG | x64, arm64 |
| Windows | NSIS インストーラ | x64 |
| Linux | AppImage | x64 |

> macOS でコード署名なしの場合、初回起動時に「開発元を確認できません」と表示されます。「システム設定 > プライバシーとセキュリティ」から許可してください。

## 初期設定

アプリ起動後、**設定** ページで以下を設定します。

### 1. Anthropic API Key

- **設定 > API設定** で Anthropic API Key (`sk-ant-...`) を入力して保存

### 2. Google Sheets 連携

Google Sheets からテーマ (トピック) を読み込むために、サービスアカウントの設定が必要です。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Google Sheets API を有効化
3. サービスアカウントを作成し、JSON 鍵ファイルをダウンロード
4. **設定 > Google Sheets接続** の「選択」ボタンから JSON 鍵ファイルを選択
5. ステータスが「認証済み」になれば成功

### 3. アカウント設定

**アカウント** ページで note.com アカウントを登録します。

- 「アカウント追加」でアカウント ID と表示名を入力
- Google Sheets のスプレッドシート ID とシート名を設定
- note.com のログイン情報を入力
- コンテンツの柱 (ピラー) を追加

### Google Sheets のフォーマット

スプレッドシートの1行目はヘッダー、2行目以降がデータです。

| A列 (topic) | B列 (status) | C列 (article_path) |
|:---:|:---:|:---:|
| テーマのタイトル | pending | (自動入力) |

- `status` は `pending` → `generating` → `generated` と自動更新されます

## 使い方

### 記事生成

1. **受信箱** ページでアカウントを選択
2. 「テーマ」タブで Google Sheets から読み込んだテーマ一覧を確認
3. 「バッチ生成」ボタンで pending 状態のテーマから記事を一括生成
4. 生成完了後、「記事」タブで結果を確認

### 記事レビュー

1. 生成された記事をクリックしてプレビュー
2. タイトル・本文を編集 (Markdown 対応)
3. 「承認」または「却下」で記事のステータスを更新

## プロジェクト構造

```
note-auto-poster/
├── electron/                  # Electron メインプロセス
│   ├── main.js               # IPC ハンドラ定義
│   ├── preload.js            # セキュアな IPC ブリッジ
│   ├── services/
│   │   ├── generator.js      # Claude AI 記事生成
│   │   └── account-manager.js
│   └── utils/
│       ├── config.js         # electron-store 設定管理
│       ├── sheet-manager.js  # Google Sheets 連携
│       └── logger.js         # ファイルロギング
├── src/                       # React フロントエンド
│   ├── pages/
│   │   ├── InboxPage.jsx     # 受信箱 (メイン画面)
│   │   ├── AccountsPage.jsx  # アカウント管理
│   │   ├── SettingsPage.jsx  # 設定
│   │   └── DashboardPage.jsx # ダッシュボード (準備中)
│   ├── components/
│   │   ├── settings/         # 設定サブコンポーネント
│   │   ├── inbox/            # 受信箱サブコンポーネント
│   │   ├── accounts/         # アカウントサブコンポーネント
│   │   └── common/           # 共通コンポーネント
│   └── contexts/
│       └── AccountContext.jsx # アカウント状態管理
├── data/                      # ローカルデータ (Git 管理外)
│   ├── logs/
│   └── accounts/{id}/articles/
├── electron-builder.yml       # ビルド設定
├── vite.config.js
└── package.json
```

## 設定の保存場所

アプリの設定は electron-store により OS のアプリデータディレクトリに暗号化保存されます。

| OS | パス |
|:---:|:---|
| macOS | `~/Library/Application Support/note-auto-poster/config.json` |
| Windows | `%APPDATA%/note-auto-poster/config.json` |
| Linux | `~/.config/note-auto-poster/config.json` |

## ライセンス

Private
