# 1億の観測者 — Agent Observer

1 億体の 0 次元エージェントが curl-noise 位相空間で創発する世界を観測する WebGL2 GPGPU 装置。

![Agent Observer](https://img.shields.io/badge/agents-1M%20to%2067M-cyan)
![WebGL2](https://img.shields.io/badge/WebGL2-GPGPU-blue)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)

## 概要

各エージェントは点として存在し、共通の curl-noise 流れ場に沿って運動します。
種ごとに流れへの感受性が異なるため、自発的に **群れ・レーン・分離** が創発します。
観測者として、あなたは世界を眺めるだけ — 干渉は最小限、観察が主役。

## 技術

- **WebGL2 GPGPU**: エージェント状態は RGBA32F テクスチャに格納、ping-pong で更新
- **Curl-noise 流れ場**: simplex noise の curl から得た divergence-free ベクトル場
- **密度レンダリング**: POINTS プリミティブを加算合成で密度テクスチャに scatter
- **ACES トーンマップ + bloom**: 観察向けに最適化された発光表現
- **スケーラブル人口**: 1K² (1M) 〜 8K² (67M) エージェントまで GPU 最大テクスチャサイズに追従

## 操作

- **ドラッグ**: 平行移動
- **ホイール**: ズーム
- **Space**: 一時停止 / 再開
- **R**: リセット
- **G**: グリッド表示トグル
- **H**: UI 表示トグル

## 開発

```bash
bun install
bun run dev    # http://localhost:3000
```

## ライセンス

MIT

<!-- ecosystem:begin (自動生成: gentaron/infocollect の ecosystem/registry.json から。手で直さない) -->

## つながり

gentaron のリポジトリ群のうち **遊びと実験** の一つ。1億の観測者 — 1億体のエージェントが創発する世界を観測する WebGL2。

- **同じ島**: [fpsgame](https://github.com/gentaron/fpsgame)、[hennanotes](https://github.com/gentaron/hennanotes)、[minagal](https://github.com/gentaron/minagal)、[game-of-mina](https://github.com/gentaron/game-of-mina)、[OCAI](https://github.com/gentaron/OCAI)

全体の地図 → [ecosystem](https://github.com/gentaron/infocollect/blob/HEAD/ecosystem/README.md)

<!-- ecosystem:end -->
