# 原資産と由来

原投稿は `data/log-corpus.json`、名言見出し・強調引用は `data/quote-corpus.json`、9系列と補完投稿は `data/archive-series.json` に分離されています。改変作品の統計は `data/novel-model.json` にあり、原投稿と混ぜて新規性の正解値にはしません。

生成用ビルドは `npm run build:assets`。全ファイルSHA-256、compiled evidence hash、辞書・規則・コード・依存版と既存データのsource metadataを含む不変snapshotを `.runtime/assets/<datasetId>.json` に保存し、検査後にactive pointerをatomicに更新します。権利確認状態は unverified-local-only。ローカル作業用bundleを公開配布承認とは扱いません。
