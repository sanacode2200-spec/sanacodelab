# VRMモデル配置先

ここに以下の8ファイルを配置すると、`app/game/vrmRig.ts` が `/models/<ファイル名>` として読み込む。
未配置の間は404になり、自動でプリミティブの棒人間にフォールバックする(`app/game/characters.ts` の `attachHumanoidPrimitive`)。

- `player.vrm` — プレイヤー本人
- `aoi.vrm` — アオイ(開発部)
- `koyuki.vrm` — コユキ(品質保証部)
- `take.vrm` — タケ(商品企画部)
- `tsumugi.vrm` — ツムギ(編集部)
- `haru.vrm` — ハル(マーケティング部)
- `fuji.vrm` — フジ(デザイン部)
- `tsukasa.vrm` — ツカサ(リサーチ部)

モデルの見た目サイズが合わない場合は `app/game/vrmRig.ts` の `VRM_SCALE` を調整する。
