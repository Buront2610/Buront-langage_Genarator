# 統合設計 v1.0 実装状況

2026-09-21。依頼範囲はM0〜M6全体。実装可能なローカル経路を接続した実験版であり、47タスクの全受入条件が完了したという報告ではない。

## 監査による訂正

2026-09-21の[実装実体監査](implementation-depth-audit-20260921.md)で、固定文型中心の創作、修辞検査の生成器依存、追加辞書の全案棄却、品質選択の不足、学習特徴の方式漏れを確認した。152テスト成功は基盤・保持処理の回帰結果であり、創作エンジンの完成度を保証しない。「人手待ち」だけでは解決しない実装上の不足がある。監査時点の再現資料は監査報告に保存。experimental.3での修正と残件は[監査対応](implementation-audit-fixes-20260921.md)を参照。

## 動く経路

`React/Vite → Fastify → bounded JobCoordinator → 常駐GiNZA → Piscina → IR / 5関係・条件付き操作 / AST / 逆解析検査 / 新規性 / 選択 → 0〜3候補`

Node 24.15.0 / Python 3.11.15 / GiNZA 5.2.1 / ja_ginza 5.2.0 / SudachiDict-core 20260723を実機で確認。標準入力の外部送信なし。experimental.2で自動152テスト成功、TypeScriptと画面の型検査、CLI・部分再生成replay、API、実ブラウザーで生成を確認。固定反例10件は旧・新双方で合格にしない。反例を生成器の出力から正解化していない。

## タスク別の状態

「実装」はコードと対応する自動検証を備える。「限定」は設計の一部までで、全受入条件の完了を意味しない。「人手待ち」はラベル・品質承認等を自動で偽装しない項目。「要修正」は動く経路に監査で不具合・要求の不足が確認された項目。

| ID | 状態 | 実装と残る範囲 |
|---|---|---|
| M0-01 | 実装 | 変更前73テスト、Git差分、原資産SHA、実測をartifacts/m0-baseline-20260921に保存 |
| M0-02 | 限定 | T-01〜12・19〜24の固定/性質/API/障害試験。T-13〜18の品質判定は比較データを生成し人手待ち |
| M0-03 | 実装 | 三状態、0/1/2案、不足、fallback、選択ID。安全でない候補を補充しない |
| M0-04 | 実装 | 数量・主体交換・否定・未完了・伝聞の既知10反例。未知の一般文の意味同値性を保証するものではない |
| M0-05 | 実装 | 共有入力schema、scalar上限、辞書一回適用、展開前上限。旧HTTP APIも新ジョブへ接続 |
| M0-06 | 実装 | 入力revision、共有実行ガード、古い応答/旧finally抑止、サーバー取消 |
| M0-07 | 実装 | Host/Origin/session、built-web許可リスト、realpath、junction越境テスト |
| M0-08 | 実装 | 内容ハッシュ、系列/語録の注入、旧cache件数依存除去、新snapshot |
| M1-01 | 実装 | TypeScript型、TypeBox要求/解析/SourceDocument/IR/Plan/Check/Candidate/Result schema、Draft 2020-12をNode/Pythonで試験 |
| M1-02 | 限定 | 凍結した原文、scalar/UTF-16、NFKC写像、符号/10進文字列/単位/比較条件、範囲の親子/出現役割。全比較構文と日本語数詞の意味解析は限定 |
| M1-03 | 実装 | 実GiNZA解析、読み/品詞/依存/助動詞/原文範囲、版と通信契約 |
| M1-04 | 限定 | 述語/項/否定/完了/予定/伝聞話者、焦点/省略/topicOnly。明示主体と対応述語を持つ受身、過去/非過去を追加。曖昧な受身・二重否定・照応は不確実として扱う |
| M1-05 | 限定 | 出来事状態に加えて感謝/警告/反論/自己弁護の明示表現から意図・対象・相手・禁止効果を記録。暗黙の発話目的は未確定 |
| M1-06 | 限定 | 助力・寒さ・復旧/修理・停止・確認の5関係。役割/極性/時制/予定を束縛し、対象語の働きと操作条件を検査。OP-07は肯定の予定された確認だけ。未対応関係は原文fallback。一般的な概念操作は未完成 |
| M1-07 | 限定 | 単語単位で原ログと照合した19語、読み、概念型とAST。系列別に出典を保持し、先頭数件への偏りを解消。原典に新句があるとは表示しない |
| M1-08 | 限定 | 生成文字列の許可集合を廃止。比較節と効果節を別の有限文法で逆解析し、原文の役割/状態へ照合。任意の日本語修辞の意味検証ではない |
| M1-09 | 実装 | CLI、有界探索、段階seed、候補集合ハッシュ、資産/履歴版、取消・deadline |
| M1-10 | 限定 | 旧方式/新方式/普通文/貼付/冗談/誤文の盲検比較を出力。包括的な人手比較は未完了 |
| M2-01 | 限定 | 投稿/語録/改変統計を分離、hash/出典/権利状態、atomic snapshot。原文取得元全ファイルの再取得・公開配布権利確認は未完了 |
| M2-02 | 未対応 | 未承認の追加6操作は新しい関係文法では生成しない。モーラ距離の単体関数を、語呂操作の実装完了とは数えない |
| M2-03 | 人手待ち | 投稿/スレッド/近似/familyを連結して生成前分割。pilot回答、閾値凍結、注釈合意は未完了 |
| M2-04 | 限定・人手待ち | 全方式の実出力へ同じ44特徴を適用。方式/操作ID/入力由来構文を除外し、版違いデータ/学習器を拒否。候補の形態構文特徴や人手のSラベル・保留評価は未整備 |
| M2-05 | 限定・人手待ち | Cは原文関係へ戻せること、Rは有限文法での結合・節長・反復を検査。無関係な結論や意味不明の変異を棄却。Qは未学習で、面白さを認定しない |
| M2-06 | 限定 | N-text、N-structure、履歴のN-concept。原ログの概念注釈、family保留の精度検証は未完了 |
| M2-07 | 限定 | 規則品質の許容帯、S/Q別のPareto順位、多様性、新規性の順で選択。未校正S+Qの加算を廃止。S/Qがnullの間は文体の優劣を順位に使わない |
| M3-01 | 限定 | 成果/未解決/未来を述語scope別に分離、Entity/Mention/Time/Condition。明示された伝聞・条件・原因・対比を接続。時制/限定受身とアンカーの発話範囲・対象番号・用法を記録 |
| M3-02 | 限定 | 文境界と、明示主体を持つ限定した「停止中で、」等の出来事境界を分離。安全なfullは独立節へ閉じて状態別表示し再解析。引用/条件/原因/照応等は原文順。一般の複合文は未対応 |
| M3-03 | 限定 | 辞書の編集前後/spanを保持し、既知同義語は採用、未登録名詞は要確認、文挿入/実体改変は棄却。固定句には辞書を再適用しない。用例のある系列に比較先行/基準先行を適用。9系列の識別品質は未評価 |
| M3-04 | 限定 | 修辞の逆解析、辞書効果、事実節の原文/有限節変換/再解析を接続。既知の時制差を別事実のunknownで隠さない。解析器自体の誤りや任意表現の一般意味検査は未解決 |
| M3-05 | 限定 | 内容/用法/新規性のMiniSearch索引分離、同じtokenize、9系列とall補完を保持。旧TF-IDFとの人手検索比較は未完了 |
| M3-06 | 限定 | 旧エンジンを安全ガード付き比較基準に保存。入力型別の品質承認/feature flag移行は未完了 |
| M4-01 | 実装 | status/generations/preferences/regenerations、400/413/429/503、旧アダプター |
| M4-02 | 実装 | Piscina 1 worker、常駐Python JSONL、有限frame、起動/終了/不正stdout/再起動 |
| M4-03 | 実装 | 終端一回、queued/running cancel、deadline、session分離、競合試験 |
| M4-04 | 実装 | 待ち8、session1、結果20、TTL30分、byte/count cache、snapshot固定 |
| M4-05 | 実装 | React/Vite、ID一括切替、取消とrevision、由来/確認範囲/不足表示。構成と焦点、原文順、アンカー用途、語彙/語法の用例表示を追加 |
| M4-06 | 実装 | 署名analysisId、node固定、409競合、全体再検証。親候補を再構築する固定plan replayと改ざん拒否、連続19回の上限 |
| M4-07 | 実装 | 保存off、旧保存データ削除、履歴と明示比較、削除、本文を含むexport |
| M4-08 | 限定 | API/境界/障害とブラウザー操作、幅375pxでの表示・中心句固定・出典表示を検証。スクリーンリーダー実機を含む包括的accessibility認証は未実施 |
| M5-01 | 未採用 | ローカル限定e5比較script。モデル/追加依存を取得した実測と品質比較は未実施 |
| M5-02 | 限定 | 許可plan選択adapter、JSON/ID/容量/再試行拒否、非決定replay。自由文ModelBackendと基盤モデル比較は未実施 |
| M5-03 | 条件未成立 | 人手ラベルと未調整モデル比較がないため追加学習を実施しない |
| M6-01 | 限定 | 反例、全9系列の供給/出典、操作多様性、再解析込み速度、RSSの機械評価。creative yield/人手選好/ablationの品質判定は未完了 |
| M6-02 | 限定 | Windows setup、lockfile/hash、diagnose、local bundle。公開配布の権利・ライセンス確認は未完了 |
| M6-03 | 限定 | 資産検査、atomic切替、旧snapshot/巻戻し試験。エンジン/学習器を含む公開bundle全組合せの検証は未完了 |
| M6-04 | 実装 | 本文/tokenを含まない有界診断ログ、本文を含む明示replay export |
| M6-05 | 限定 | 現Windowsの別フォルダーで独立した依存/Python環境をオフラインフラグ付きで再構築・診断。別実機・実ネットワーク遮断・macOS/Linuxの認証は未実施 |

## テスト仕様の変更

旧test/corpus-engine.test.jsの構造検証は残した。安全ガードにより候補がなくなる5項目だけ、原文・null採用ID・候補0・通過数0を確認する棄却分岐を追加した。架空の知人や一級プログラマーの生成を新経路の正解にはしない。新経路には別の肯定例・反例・数量/offset性質試験・API状態/上限/認証・parser故障・junction・資産巻戻しを追加した。

experimental.3では、全入力で4操作12案を要求する旧試験を、適用可能な操作だけの有界生成とOP-07の肯定/否定例に変更。fullの本文連続一致は、原文spanの全被覆・出来事ごとの限定変換・独立再解析に置き換えた。テストプロセスの並列数を2に固定し、複数GiNZA同時起動による資源競合を抑えた。

## 証拠と再実行

- `artifacts/v1-all-tests-experimental.3.txt`: 監査対応後の全試験。
- `artifacts/v1-evaluation-experimental.3/report.json`: 主体交換、辞書、偽主張、時制、出来事構成、共通特徴、系列、速度。
- `artifacts/v1-evaluation-experimental.3/comparisons-blind.json` / `series-ablations-blind.json`: 未回答の比較資料。品質合格の証拠ではない。
- `npm run evaluate:audit`: 上記の監査対応評価を再実行。

- `artifacts/v1-verification-experimental.2.json`: experimental.2のビルド版、152テスト、構成/出典画面、API再解析・取消・replayの記録。
- `artifacts/v1-evaluation-experimental.2/report.json`: 9系列＋allの供給、実解析の固定反例、500/5,000文字の再解析込み単回実測。
- `artifacts/v1-verification.json`: experimental.1の136テストと別フォルダー再セットアップの過去記録。新旧とも別実機の認証ではない。
- `artifacts/v1-all-tests-experimental.2.txt`: experimental.2の全自動試験の出力。
- `artifacts/v1-evaluation/report.json`: 実行環境の少数サンプル性能、供給、未学習/未評価を含む評価。
- `artifacts/v1-evaluation/comparisons-blind.json`: 人が回答する比較。privateファイルには生成条件/特徴を分離。
- `npm run audit:m0`: 既知反例10件。
- `npm run diagnose`: 実際のPython/model読込を含む診断。

初版の性能5回測定、今回の再解析込み単回測定を安定したp95や品質合格とは扱わない。残っている人手・一般化・任意モデル・公開配布の条件を通るまでは experimental 表示を維持する。

実装時に確認した一次資料: [Fastifyのschema検証](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)、[Piscina](https://github.com/piscinajs/piscina)、[GiNZA](https://github.com/megagonlabs/ginza)、[MiniSearch](https://github.com/lucaong/minisearch)。実際に使った版はlockfileを正本とする。
