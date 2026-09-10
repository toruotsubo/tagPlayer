# tagPlayer

## 概要
アルバムと曲にタグをつけられるWindows用音楽プレイヤー。

## 技術スタック
- Tauri
- Rust
- React
- TypeScript
- tailwindcss

## 機能
- 指定したディレクトリ内の音楽データを読み込む。
- アルバムカバー、アルバム名、アルバムアーティスト名、トラック名、トラックアーティスト名、作曲者名、ジャンル、リリース年、ディスク番号、曲番号を自動的に取得。
- ジャンル、アルバムアーティスト名、リリース年をデフォルトのタグとしてアルバムにつける。
- トラックアーティスト名、作曲者名、デフォルトのタグとして曲につける。
  - アルバムアーティスト名とトラックアーティスト名が同じ場合、トラックアーティスト名のタグづけは省略。
  - トラックアーティスト名と作曲者名が同じ場合、作曲者名のタグづけは省略。
- ユーザーが作成した任意のタグをアルバムと曲につけることができる。
- タグの指定によりプレイリストを作成し、音楽をプレイできる。
- wmaデータ対応のためWindows Media Foundationを使った再生エンジンを組み込む。 

## ディレクトリ構造
```text
tagPlayer/
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
│   ├── components/             # UIコンポーネント (今後の実装)
│   ├── hooks/                  # 再生制御・IPCカスタムフック (今後の実装)
│   └── types/                  # データ型定義 (今後の実装)
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
