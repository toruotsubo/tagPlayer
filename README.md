# tagPlayer 🎵

[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

**tagPlayer** は、アルバムやトラックごとに柔軟なタグ付けを行い、直感的なプレイリスト作成と音楽再生が可能な Windows 向けデスクトップ音楽プレイヤーです。  
Windows Media Foundation (WMF) をバックエンドに採用し、MP3 や FLAC だけでなく WMA などの形式にもネイティブ対応しています。

---

## ✨ 主な機能

- 📂 **音楽ライブラリの自動読み込み**
  - 指定したディレクトリ配下の音楽ファイルを高速スキャン
  - アルバムカバー、アルバム名、アルバムアーティスト名、トラック名、トラックアーティスト名、作曲者名、ジャンル、リリース年、ディスク番号、曲番号を自動取得
- 🏷️ **スマートな自動タグ付け**
  - **アルバム**: `ジャンル`、`アルバムアーティスト`、`リリース年` をデフォルトタグとして付与
  - **トラック**: `トラックアーティスト`、`作曲者` をデフォルトタグとして付与
  - *重複タグの自動省略*: アルバムアーティストとトラックアーティストが同一の場合はトラック側を省略、トラックアーティストと作曲者が同一の場合は作曲者を省略してタグ一覧をすっきり維持
- ✏️ **カスタムタグ**
  - ユーザーが自由に作成した任意のタグをアルバム・トラックへ自由に追加・編集可能
- 🔀 **タグベースのプレイリスト再生**
  - タグの組み合わせ・絞り込みにより、聴きたい気分の曲を瞬時にリストアップして再生
- 🪟 **Windows ネイティブ再生エンジン**
  - Windows Media Foundation API を直接制御し、WMA を含む幅広いオーディオフォーマットに対応

---

## 🛠️ 技術スタック

| 分類 | 技術 / ライブラリ |
| :--- | :--- |
| **デスクトップ基盤** | [Tauri v2](https://v2.tauri.app/) |
| **バックエンド言語** | [Rust](https://www.rust-lang.org/) |
| **再生エンジン** | [Windows Media Foundation](https://learn.microsoft.com/en-us/windows/win32/medfound/microsoft-media-foundation-sdk) (`windows` crate) |
| **メタデータ抽出** | [Lofty](https://github.com/Serial-ATA/lofty-rs) |
| **データベース** | SQLite ([rusqlite](https://github.com/rusqlite/rusqlite)) |
| **フロントエンド** | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/) |
| **スタイリング** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **アイコン** | [Lucide React](https://lucide.dev/) |

---

## 📁 ディレクトリ構造

```text
tagPlayer/
├── .gitignore
├── README.md
├── AGENTS.md
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── src/                        # フロントエンド (React + TypeScript + Tailwind CSS)
│   ├── App.css
│   ├── App.tsx
│   ├── main.tsx
│   ├── vite-env.d.ts
│   ├── assets/
│   ├── components/             # UIコンポーネント
│   ├── hooks/                  # 再生制御・IPCカスタムフック
│   └── types/                  # データ型定義
└── src-tauri/                  # バックエンド (Rust + Tauri v2)
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── lib.rs              # Tauri エントリーポイント / コマンドハンドラ
        └── main.rs
```

---

## 🚀 開発環境のセットアップ

### 前提条件

- **OS**: Windows 10 / 11 (64-bit)
- **Node.js**: v18 以上 (npm または pnpm)
- **Rust**: 最新の Stable ツールチェーン (`rustup`)
- **C++ ビルドツール**: Visual Studio Build Tools (C++ デスクトップ開発ワークロード)
- **WebView2**: Windows 10/11 標準搭載

### 手順

1. **リポジトリのクローン**
   ```powershell
   git clone https://github.com/toruotsubo/tagPlayer.git
   cd tagPlayer
   ```

2. **依存関係のインストール**
   ```powershell
   npm install
   ```

3. **開発モードで起動**
   ```powershell
   npm run tauri dev
   ```

4. **プロダクションビルド**
   ```powershell
   npm run tauri build
   ```
   ビルド成果物は `src-tauri/target/release/` またはインストーラーバンドル `src-tauri/target/release/bundle/` 配下に生成されます。

---

## 📄 ライセンス

本プロジェクトのライセンスについては [LICENSE](./LICENSE) をご確認ください。
