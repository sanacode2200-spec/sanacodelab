@AGENTS.md

# 球体オフィスゲーム (app/game/)

Three.js製の3D社内シミュレーター。`/game` ルート、クライアントコンポーネント中心。

- `sphere.ts` — 球面座標(lat/lon)⇔THREE.Vector3の変換と、`OFFICE_CENTER` を中心にした扇形エリア用ヘルパー(`pointOnDisc`, `bearingTo`)。`PLANET_RADIUS`(現在60)を変える場合、移動速度や配置半径などの定数も実際のメートル換算で見直すこと(過去に半径だけ変えて歩行速度が実質3倍になったことがある)。
- `characters.ts` — 7部署を `OFFICE_CENTER` から方位角±60度・半径8〜13度の扇形に配置。プレイヤー/NPC共通の人型メッシュ生成は `createHumanoid`。
- `officeMap.ts` — 机・会議テーブル・ラウンジ・観葉植物の配置。新しい備品は必ず `OFFICE_CENTER` 基準の到達可能エリア内(`OFFICE_AREA_SOFT_RADIUS` 付近まで)に置くこと。エリア外に置くと移動範囲制限で誰も到達できなくなる。
- `GameCanvas.tsx` — 入力・移動・カメラ・境界処理。境界は `OFFICE_AREA_SOFT_RADIUS`/`HARD_RADIUS` の間で外に進むほど抵抗が増す柔らかい壁(ハードスナップではない)。
- `toonShading.ts` — `MeshToonMaterial` 用の共有 gradientMap と、バックフェース法によるアウトライン(`addOutline`)。現状は惑星本体とプレイヤー/部署キャラの人型パーツのみが対象で、家具類は素の `MeshLambertMaterial` のまま(意図的なスコープ)。
- Notion連携: `notionClient.ts` → `/api/notion/...` 経由でタスク取得・進捗レポート追記。プロジェクト管理用のNotionページは別途あり(Notion内で「sanacode Lab」を検索)。
