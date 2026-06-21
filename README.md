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

---

# 改造ガイド（自分のAI会社に作り変える）

このゲームは「配布テンプレート」として、コードを触らず **`config/` の2ファイルを書き換えるだけ** で自分の会社に作り変えられる設計です。

## 1. キャラ・部署を変える — `config/characters.json`

部署とキャラの単一ソースです（ゲーム表示もチャットのペルソナも全部ここから生成）。`roster` の各要素を編集します。

| フィールド | 意味 |
|---|---|
| `id` | 内部ID（半角英数。重複不可） |
| `name` | 表示名（チャットで「○○ 来て」と呼ぶ名前） |
| `department` | 部署名（Notionタスクの「担当部署」と一致させると進捗連動） |
| `color` | テーマ色 `#rrggbb`（Box人型の体色・チャットの名前色） |
| `speechStyle` | `タメ口` or `敬語`（ペルソナ生成に使用） |
| `personality` | 性格の説明文（チャットAIのペルソナに反映） |
| `line` | 呼び出し・報告時のひとこと |
| `task` | 初期タスク名（Notion未接続時の表示） |
| `placement` | `radiusDeg`=オフィス中心からの角距離 / `angleDeg`=方位（0=北, 時計回り） |
| `vrmFile` | `public/models/` 内のVRMファイル名。`null` ならBox人型で表示 |

`player`（プレイヤー本人）も同じ形式で `vrmFile` を指定できます。

### 部署数を増やす / 減らす

`roster` の配列要素を追加・削除するだけです。配置が重ならないよう `placement` の `angleDeg`（方位）を散らしてください（既定は `±60°` の扇形に7部署）。`radiusDeg` は到達エリア内（おおむね `13` 以下）に収めます。机は各キャラの `placement` に自動で並びます。

## 2. VRMモデルを差し替える

1. [VRoid Studio](https://vroid.com/studio) などでVRM（VRM1.0 / MToon推奨）を書き出す
2. `public/models/` に置く（例: `public/models/myhero.vrm`）
3. `config/characters.json` の該当キャラの `vrmFile` をそのファイル名に変更
4. 大きさが合わなければ `app/game/vrmRig.ts` の `VRM_SCALE` を調整

`vrmFile` が `null` のキャラは自動でBox人型になります（VRMが無くても動きます）。

## 3. 見た目・雰囲気を変える — `config/theme.json`

色味・トーンの単一ソースです。値は `#rrggbb` 文字列。

- `sky.top` / `sky.bottom` … 空のグラデーション（上→下）
- `ground` … 地面の色
- `light.*` … 環境光・太陽光の色と強さ（トゥーンの陰影段差はここで変わる）
- `furniture.*` / `plant.*` … 机・椅子・観葉植物などの色
- `buildings.*` … 周囲の街並みの配色（`enabled:false` で街を消せる）
- `outline.*` … 輪郭線の色・太さ（`enabled:false` でアウトラインOFF）
- `toonSteps` … トゥーンの階調数（小さいほどくっきり、大きいほどなめらか）

例: 和風にするなら `ground` を畳色、`buildings.roof` を瓦色、`sky` を夕焼け系に。サイバーパンクなら全体を暗く・`outline.color` をネオン色に。

## 4. Notion DBを自分のものに差し替える

1. テンプレートの「タスクDB」「プロジェクトページ」を自分のNotionに複製
2. 自分のNotionインテグレーションを作成しトークンを発行、両方のDB/ページにそのインテグレーションを「接続」
3. `.env.local` の `NOTION_TOKEN` / `NOTION_PROJECT_PAGE_ID` / `NOTION_TASK_DB_ID` を自分の値に変更
4. タスクDBの「担当部署」の選択肢を `config/characters.json` の `department` と一致させる

> ⚠️ 配布時の注意: `.env.local` は `.gitignore` 済みです。トークンやpage_idを **コードやコミットに直書きしない** でください。購入者は自分のトークンを発行して `.env.local` に設定します。
