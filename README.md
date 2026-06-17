# sanacode Lab Office Planet

Three.js と Next.js で動く、ローカル運用前提の小さな球体オフィスゲームです。

## 起動方法

```bash
cp .env.local.example .env.local
# .env.local の NOTION_TOKEN を設定
npm install
npm run dev
```

ブラウザで `http://localhost:3000/game` を開きます。

## 操作

- `WASD` / 矢印キー: 球体オフィス上を移動
- スマホ: 画面スワイプで移動
- 右下チャット:
  - `アオイ 来て`
  - `全員集合`
  - `ミーティング`
  - `アオイ 報告: 内容`
  - `進捗確認`
  - `解散`

## Notion 連携

`.env.local` に以下を設定します。

```bash
NOTION_TOKEN=your_integration_token
NOTION_PROJECT_PAGE_ID=08e96ff6-653e-4c4c-a0a5-0fd874d8bb95
NOTION_TASK_DB_ID=2ca863cd-8d0b-49a4-bf82-2e3e3029ccc4
```

`GET /api/notion/tasks` はタスクDBから `担当部署` と `ステータス` を読み、キャラ状態に反映します。
`POST /api/notion/report` はプロジェクトページ末尾へ `[YYYY-MM-DD HH:mm] character: content` 形式で追記します。
