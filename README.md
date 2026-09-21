# ブロント語生成器 — 統合設計 v1 実験版

[統合設計書 v1.0（元ZIP・本文）](docs/design/README.md)

日本語の原文を解析し、事実を保持した文と、操作台帳に基づく修辞から0〜3案を作るローカルアプリです。標準経路はLLMを使わず、本文を外部へ送信しません。語り口S・句の魅力Qは人手注釈がないため未学習です。

## 起動

検証環境は Windows x64、Node.js 24.15.0、Python 3.11.15、GiNZA 5.2.1 / ja_ginza 5.2.0 です。初回セットアップには Node.js 24 と uv が必要です。

```powershell
.\setup.ps1
npm start
```

[http://127.0.0.1:4173](http://127.0.0.1:4173) を開きます。セットアップ済みの環境では `npm start` だけで起動できます。通常起動時の依存・モデルの自動ダウンロードはありません。停止は Ctrl+C。再セットアップ時にローカルキャッシュが揃っていれば `./setup.ps1 -Offline` を使えます。

```powershell
npm run diagnose
npm run build
npm test
npm run typecheck
npm run audit:m0
```

依存は package-lock.json と services/japanese-analysis/requirements.lock.txt の版・ハッシュで固定しています。root の index.html/app.js は旧画面の比較資産です。常用画面は React/Vite の apps/web、配信は Fastify の apps/server です。

## 使い方

1. 原文、用途（全文/一句）、文脈、新規性、濃さ、系列を選びます。Ctrl+Enterでも生成できます。
2. 候補を選ぶと、本文・原文との対応・検査・語彙の出典が同時に切り替わります。
3. 部分再生成では事実節・中心句・結びを固定できます。固定内容と操作変更が衝突した場合は409で拒否します。
4. 生成中の編集・設定変更・消去はジョブを取り消し、遅い旧応答を表示しません。

不合格の候補で3案に補充しません。事実の任意の言い換えは未検証なので、原文保持と限定した丁寧形の変換に制限しています。fullでは修辞を先に置き、独立した出来事の節を成果・残件・状況・予定の順に構成できます。引用・照応・主体省略・文をまたぐ関係がある場合は原文順を保持します。「構成と焦点」で原文の順番と表示順を確認できます。未知主体や架空の対抗者は追加しません。一句の焦点が文の一部だけの場合はtopicOnlyとして明示します。

新規性は原ログ・語録・保存した履歴との比較です。名詞・数値を抽象化した構造照合も行いますが、原ログの概念注釈は未整備であり、N-conceptは保存履歴内のみです。「新作候補」は世界初の保証ではありません。助力・寒さ・復旧/修理・停止・確認の5関係に限定し、対応できない入力は原文を返します。適用できる操作だけを生成し、生成文とは別の有限文法で関係と効果を検査します。語り口の品質承認前の実験版です。9系列それぞれの原ログから語彙と語法の用例を選びます。系列の説明枠や語尾だけを変えても新規性の点数は増やしません。用例と操作条件が揃う場合に比較・結論の順を変えますが、系列識別の品質は未評価です。

追加辞書の「寒さ=冷え込み」は意味を保持する既知の置換として扱います。未登録の短い名詞置換は要確認に、人物の参照や文を変える置換は棄却します。学習比較は全方式の実出力へ共通の44特徴を適用し、旧版の比較データや係数とは混用しません。

## CLI・再現

```powershell
npm run generate -- examples/request.json
node dist/scripts/v1/generate.js examples/request.json > result.json
npm run replay -- result.json
npm run generate -- examples/request.json --experimental-operators
npm run generate -- examples/document-request.json
```

変更した事実節はGiNZAで再解析し、主体・否定・時制・伝聞・保護値を原文と別々に照合します。再解析に不確実性がある項目は未確認と明示し、限定変換の照合を併用します。生成・CLI・replayで同じ検査を行います。

JSON結果には原文/IR、0〜3候補、span provenance、検査、selectedCandidateId、fallback/不足理由、seed、候補集合ハッシュ、資産/解析器/エンジン版が含まれます。再現には同じ資産と解析器が必要です。部分再生成のexportには親候補の再現記録も含みます。replayは親候補を再構築してから固定planを照合し、自己申告の固定文をそのまま信頼しません。連続部分再生成は19回までで、新規生成により起点を作り直せます。

## APIと上限

同一originから `POST /api/v1/session` に `X-Buront-Client: 1` を付け、返されたtokenをAuthorization: Bearerで送ります。HttpOnly/SameSite cookieとの組でセッションを確認します。

- `GET /api/v1/status`
- `POST /api/v1/generations` → 202 / jobId
- `GET /api/v1/generations/:id`
- `DELETE /api/v1/generations/:id`
- `POST /api/v1/regenerations`
- `POST /api/v1/comparisons` / `POST /api/v1/preferences`
- `POST/DELETE /api/v1/history` / `GET /api/v1/export`
- 旧 `POST /api/convert` は同じ認証・検査・ジョブ経路へ変換します。

本文80,000 bytes、原文5,000 Unicode scalar、待ち8件、同一session未完了1件、実行30秒（待ち時間を除く）、結果20件/セッション・無操作30分、結果全体64 MiB。候補は12構成、36案以下、合計120,000文字以下。計算はPiscinaと常駐Pythonへ分離しています。

127.0.0.1にのみ待ち受け、Host/Origin/tokenを検査します。ビルド済みwebの許可ファイルだけを配信し、リポジトリ、データ、.env、symlink/junction経由の外部実体を配信しません。

## 保存・評価

入力のブラウザー保存は既定でoff。旧版の保存データは削除操作を提供します。採用履歴と比較回答は明示操作でのみ保持し、コピーを学習ラベルにしません。セッションの履歴・評価は削除でき、本文を含む再現資料/評価資料は明示操作で出力します。

```powershell
npm run evaluate
npm run evaluate:planning
npm run train:preferences -- comparisons-with-labels.json evaluators.json
```

比較データは方法・点数を隠してS/Q/C別に回答できます。学習は人の回答と生成前の固定分割が必要です。データ不足時は学習を拒否します。係数JSONを assets/annotations/evaluators.json に配置し資産を再ビルドすると、実験用の相対選好点と選択に反映します。品質承認は別途必要です。詳しくは [注釈手順](assets/annotations/README.md)。

任意の埋め込み検索比較は services/japanese-analysis/compare_embeddings.py にあります。ローカルモデルと追加依存を明示的に用意した場合だけ実行します。モデル案選択adapterは不正JSON・架空IDを拒否します。標準APIのmodel backendは未採用のため503を返します。モデルの実比較・追加学習・利用条件確認は済んでいません。

## 資産・配布

```powershell
npm run build:assets
npm run assets -- list
npm run assets -- rollback <datasetId>
npm run release:bundle
```

資産は内容ハッシュ付きの不変snapshotです。active pointerを検査後に切り替え、実行中ジョブは開始時のsnapshotを維持します。ログはjobId/状態/時間/エラーのみで、本文や認証tokenを含めません。ローカルbundleはartifacts配下に生成します。原資料の再配布条件が未確認のため、公開配布済みとは扱いません。

[実装状況と残件](docs/implementation-status-v1.0.md) / [47タスクの受入条件](docs/implementation-tasks-v1.0.md) / [監査対応](docs/implementation-audit-fixes-20260921.md) / [今回の検証](artifacts/v1-evaluation-experimental.3/report.json) / [構成・系列・再解析の実測](artifacts/v1-evaluation-experimental.2/report.json) / [初版の比較評価](artifacts/v1-evaluation/report.json) / [旧方式の仕様・資料](docs/legacy-readme.md)
