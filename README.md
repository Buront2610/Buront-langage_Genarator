# ブロント語変換機

通常の日本語から複数のブロント語候補を作り、実ログとの文章比較と検証を通して採用文を選ぶローカルWebアプリ

## 起動方法

Windowsでは `start.bat` をダブルクリックしてください。ブラウザで `http://127.0.0.1:4173` が開かれます。

コマンドから起動する場合:

```powershell
npm start
```

全文コーパスを利用するため、`index.html` の直接起動ではなくローカルサーバーから起動してください。

## テスト

Node.js 18以上で実行できます。通常の実行とテストに外部パッケージは不要です。

```powershell
npm test
```

## コーパスの再構築

手元ログとログ倉庫を再照合する場合:

```powershell
npm run build:corpus
```

別のログを使う場合はパスを引数に渡せます。

```powershell
node scripts/prepare-corpora.js "C:\path\to\burontlog.txt"
```

改変集の統計を再構築する開発用スクリプトは `scripts/analyze-novel.js` です。これは本文をブラウザで取得して統計化する工程だけPlaywrightを使用します。生成後の変換器はPlaywrightを必要としません。

名言集を再取得して分類する場合:

```powershell
npm run build:quotes
```

## ファイル構成

- `lib/corpus-engine.js`: 検索、候補生成、比較、検証
- `lib/text-analysis.js`: 文分割、特徴抽出、n-gram
- `lib/vector-space.js`: TF-IDF疎ベクトル、転置索引、コサイン検索、系列重心・近傍分類
- `lib/quote-grammar.js`: 名言集由来の展開型と反復検出
- `lib/grammar/context-model.js`: 入力事実、出来事型、参照対象の役割抽出
- `lib/grammar/anchor-grammar.js`: 10種のアンカー構文の条件判定、対象選択、表層化
- `lib/grammar/anchor-frames.js`: 感謝、賛同、証拠提示を段落へ組み込む構成器
- `lib/grammar/observation-frames.js`: 中立観察と評価を観察自慢へ再構成する専用構成器
- `lib/grammar/faithful-quote-grammar.js`: 原文寄りモード用の機能別構文、使用条件、検出
- `lib/era-profiles.js`: 倉庫9系列の部分コーパス、特徴量、n-gram、表記対応
- `lib/grammar/era-grammar.js`: 系列ごとの談話構文、検出、系列内根拠照合
- `lib/grammar/phrase-constructions.js`: 原ログで観測した構文台帳
- `lib/grammar/random-utils.js`: 重みづけしない抽選とシャッフル
- `data/log-corpus.json`: 構造化した実ログ
- `data/quote-corpus.json`: 名言集の見出し、強調語録、分類
- `data/style-model.json`: 実ログと段階比較から作った文体モデル
- `data/novel-model.json`: 長文改変の統計モデル
- `data/archive-series.json`: 倉庫9系列の出典URL、本文一致投稿ID、取得元ハッシュ
- `app.js`: 画面操作と比較結果の表示
- `server.js`: ローカルAPIと静的ファイル配信
- `test/`: コーパス、意味保持、変換、独立オラクル、負例検証の自動テスト
