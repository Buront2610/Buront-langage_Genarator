# 人手注釈

`npm run evaluate` は生成前に投稿・スレッド・近似重複・family単位の分割を固定し、`artifacts/v1-evaluation/comparisons-blind.json` を生成します。比較方法・順位・自動点数は別のprivateファイルに置きます。S（語り口）、Q（句の魅力）、C（意味保持）を独立に、left/right/tie/both_bad/cannot_judgeから選び、評価者IDと理由を記録してください。

画面での評価はセッション中に保持され、明示操作でJSONへ出力できます。画面の試用データはpilotです。保留試験へ勝手に昇格しません。モデル学習用には生成前に固定した分割を含む比較ファイルと、人が回答したpreferencesを合わせて使います。

`npm run train:preferences -- comparisons-with-labels.json evaluators.json` はS/Qを別々に学習し、係数JSONと保留精度を出します。最低件数はプログラムの起動条件であり、品質承認基準ではありません。一人の回答ならpersonal=trueです。注釈がない現状では学習済みと表示しません。

原ログの概念写像・操作妥当性の人手注釈、pilotによる閾値凍結、family保留評価は未完了です。

学習済み係数は `assets/annotations/evaluators.json` に置いて `npm run build:assets` で取り込みます。資産に係数・学習ラベルのハッシュを記録し、画面では相対選好点として表示します。同一比較・評価者の重複回答は最後の回答を使い、評価者間の不一致率もレポートします。個人選好モデルや最低件数の達成だけで公開品質を承認したとは扱いません。
