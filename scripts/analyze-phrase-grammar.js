"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_LOG = "C:\\Users\\Glutt\\OneDrive\\デスクトップ\\burontlog.txt";
const logPath = path.resolve(process.argv[2] || process.env.BURONT_LOG_PATH || DEFAULT_LOG);
const logCorpus = require("../data/log-corpus.json");
const quoteCorpus = require("../data/quote-corpus.json");
const novelModel = require("../data/novel-model.json");
const { normalizeForSearch, tokenize } = require("../lib/text-analysis");

const speechActs = [
  { id: "gratitude", label: "感謝・返礼", pattern: /感謝|ありがと|お礼|礼を言/ },
  { id: "agreement", label: "同意・陣営化", pattern: /賛成|同意|禿同|同じ意見|激しく同意|支持|確かにな/ },
  { id: "attention_call", label: "注意喚起・呼び止め", pattern: /おいィ|聞こえたか|見ろ[、,]|ほらみた|何いきなり|先に言っておく|覚えておけ/ },
  { id: "apology_contract", label: "謝罪・約束・契約", pattern: /謝罪|謝る|あやま|約束|誓い|改心|許して|守られなければ/ },
  { id: "grievance", label: "不公平・被害の訴え", pattern: /ずるい|卑怯|ヒキョウ|汚い|きたない|不公平|おかしい|恥知らず|非常に人をふるかい/ },
  { id: "opponent_evaluation", label: "相手の格下げ・類型化", pattern: /馬鹿|バカ|雑魚|ザコ|偽者|弱かった|弱々しい|烏合|浅はか|愚か|醜い|必死だな|反乱者|カス猿|口だけ/ },
  { id: "social_typing", label: "人物・陣営の類型化", pattern: /チーム|四天王|タイプ|ミニオン|使う奴|使いがいた|性格が悪|反乱者|人気者|孤高の|○○美|不良界|一般人/ },
  { id: "pseudo_logic", label: "擬似論理・因果の増築", pattern: /公式が成り立|＝|=|だから|なので|なぜなら|ようするに|というのが|という事|結果だった|つまり|同然|証拠/ },
  { id: "paradox_repetition", label: "矛盾・反復による強調", pattern: /稀にだがよく|普通は普通|唯一ぬに|パワーの力|破壊力.{0,12}破壊力|最強.{0,16}最強|前門の.{0,12}前門の/ },
  { id: "lexical_reanalysis", label: "語の取り違え・再解釈", pattern: /名誉既存|真骨董|多勢に風情|ぎゃくりん|だんぺん|ぜいいん|じょうずく|ヨミヨミ|ホイッスル|役不足|確信犯|太公望は釣竿|女王の守りというのが女/ },
  { id: "withdrawal_closure", label: "撤退・話題の打ち切り", pattern: /一歩引く|シャッタアウト|じゃあな|闇系の仕事|このスレはしんだ|もう来なくて|幕を閉じ|これで終わり/ },
  { id: "fear_submission", label: "恐怖・降伏・反論不能", pattern: /怖い|震え|完敗|言い返す言葉|泣き|諦め|なす術なし|グーの音|黙った/ },
  { id: "challenge_retort", label: "挑発への返答", pattern: /牙抜いて|ライバル視|張り合|勝負|相手になら|何いきなり|口だけ|カウンター/ },
  { id: "threat_warning", label: "威嚇・警告", pattern: /死ぬ|殺|殴|蹴|骨になる|病院|幕を閉じ|ボコ|危険|手遅れ|注意|謝るべき|やめろ馬鹿|仏の顔|バラバラ|ズタズタ/ },
  { id: "denial_disclaimer", label: "否認・切断", pattern: /ではない|じゃない|関係ない|偽者|捏造|無実|ノーなんで|違う|話は別|ノーダメージ|はげていない/ },
  { id: "evidence", label: "証拠・事実化", pattern: /証拠|証明|明らか|見ろ|ノンフィクション|事実|決定打|信頼性|見ればわか/ },
  { id: "self_rank", label: "自己格付け・自慢", pattern: /一級|最高|最強|ナンバー[１1]|Ｐ[ｽス]キル|憧れ|人気者|伝説|唯一ぬに|格が違|一般人|頼りにされる|誘いがあっては一人の時間/ },
  { id: "power_action", label: "能力・攻撃の誇張", pattern: /パワー|攻撃|パンチ|破壊|加速|雷属性|ホーリ|論破|封印|鉄の塊|防御|盾|武器|スウィフト|スウィスト|キラーマッシン|強すぎ|つよすぎ/ },
  { id: "victory_result", label: "勝利・結果確定", pattern: /勝つる|勝率|圧勝|勝利|完全.{0,4}(?:解決|論破)|倒し|返した|終了|成功/ },
  { id: "praise_humility", label: "称賛・謙遜", pattern: /それほどでもない|謙虚|誉め|褒め|感心|関心|見事|憧れ|すごいですね|心が広大|心配り|人気の秘訣|god job/ },
  { id: "lament_crisis", label: "悲嘆・危機", pattern: /悲し|絶望|寿命|手遅れ|いくえ不明|ゲームオーバー|ｹﾞｰﾑｵｰﾊﾞｰ|一巻の終わり|顔面蒼白/ },
  { id: "prediction_certainty", label: "予知・必然化", pattern: /予知夢|わかってた|目に見えて|シュミレート|確定的|最初から|間違いなく|決まって/ },
  { id: "instruction", label: "命令・教訓", pattern: /するべき|すべき|するな|やめろ|注意|謝るべき|改心|見習|覚えておけ|知らないか/ },
  { id: "reaction_inference", label: "他者反応の推測", pattern: /びび|ギク|黙った|笑顔|表情|驚|グーの音|肩に暖か|泣き|恐怖|諦め|拳を上げ|誰それ|外人|歌[？?]/ },
  { id: "metalinguistic", label: "言葉・意味の再定義", pattern: /英語でいう|って意味|という意味|読み方|文字|名前|名誉既存|役不足|確信犯/ },
  { id: "repair_correction", label: "訂正・自己修復", pattern: /間違|勘違い|訂正|だった馬鹿|ちょっとミス|焦ってれば|言い間違/ },
];

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts, ([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "ja"));
}

function classifySpeechActs(value) {
  const normalized = String(value ?? "").normalize("NFKC");
  const condensed = normalized.replace(/[\s　]+/g, "");
  return speechActs.filter((act) => act.pattern.test(normalized) || act.pattern.test(condensed)).map((act) => act.id);
}

function primarySpeechAct(value) {
  return classifySpeechActs(value)[0] || "unclassified";
}

function compactExample(value, maximum = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function localContextForHeading(heading, post) {
  const lines = post.content.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const headingNormalized = normalizeForSearch(heading);
  const headingTokens = new Set(tokenize(heading, { contentOnly: true }));
  const ranked = lines.map((line, index) => {
    const normalized = normalizeForSearch(line);
    const lineTokens = new Set(tokenize(line, { contentOnly: true }));
    const overlap = Array.from(headingTokens).filter((token) => lineTokens.has(token)).length;
    const exact = normalized.includes(headingNormalized) || headingNormalized.includes(normalized) ? 20 : 0;
    return { index, score: exact + overlap / Math.max(1, headingTokens.size) };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  const bestIndex = ranked[0]?.index || 0;
  return lines.slice(Math.max(0, bestIndex - 1), bestIndex + 2).join("\n");
}

function classifyAnchor(line, match) {
  const before = line.slice(0, match.index).trim();
  const after = line.slice(match.index + match[0].length).trim();
  const anchorCount = (line.match(/(?:>>|＞＞)\s*\d+/g) || []).length;
  if (anchorCount > 1) return "coordination";
  if (!before && !after) return "standalone_reply";
  if (/^(?:感謝|ありがとう|乙|謝罪|祝福)(?:\b|$)/.test(after)) return "fused_performative";
  if (/^(?:に|の意見に)(?:超)?(?:賛成|同意|禿同)/.test(after) || /(?:賛成|同意|禿同)$/.test(line)) return "agreement_target";
  if (/^(?:に|で|が|を|の).{0,24}(?:証拠|証明|言うように|見て|内容|信頼性)/.test(after)) return "evidence_source";
  if (/^(?:は|が|お前).{0,32}(?:賢|馬鹿|バカ|偽者|嘘|死ぬ|能力|雑魚|必死)/.test(after)) return "evaluation_target";
  if (/^(?:よ[、,]?|お前)/.test(after)) return "vocative";
  if (before && after) return "embedded_argument";
  if (!before) return "prefixed_clause";
  return "sentence_tail_reference";
}

function analyzeAnchors(rawLog) {
  const rows = [];
  const lines = rawLog.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const matcher = /(?:>>|＞＞)\s*(\d+)/g;
    let match;
    while ((match = matcher.exec(line))) {
      const before = line.slice(0, match.index).trim();
      const after = line.slice(match.index + match[0].length).trim();
      const placement = !before && !after
        ? "standalone"
        : !before ? "prefix" : !after ? "suffix" : "inline";
      rows.push({
        lineNumber: lineIndex + 1,
        target: match[1],
        placement,
        construction: classifyAnchor(line, match),
        before: compactExample(before, 80),
        after: compactExample(after, 100),
        line: compactExample(line, 220),
      });
    }
  }
  const constructionCounts = countBy(rows.map((row) => row.construction));
  return {
    occurrences: rows.length,
    lines: new Set(rows.map((row) => row.lineNumber)).size,
    placementCounts: countBy(rows.map((row) => row.placement)),
    constructionCounts,
    examplesByConstruction: Object.fromEntries(constructionCounts.map(({ value }) => [
      value,
      rows.filter((row) => row.construction === value).slice(0, 8),
    ])),
    fusedPerformativeExamples: rows.filter((row) => row.construction === "fused_performative"),
  };
}

function analyzeQuoteFunctions() {
  const postById = new Map(logCorpus.posts.map((post) => [post.id, post]));
  const rows = quoteCorpus.headings.map((heading) => {
    const contexts = (heading.contexts || []).map((context) => postById.get(context.postId)).filter(Boolean);
    const localContexts = contexts.map((post) => localContextForHeading(heading.text, post));
    const contextText = localContexts.join("\n");
    const acts = classifySpeechActs(`${heading.text}\n${contextText}`);
    return {
      id: heading.id,
      heading: heading.text,
      acts,
      contextCount: contexts.length,
      contexts: contexts.slice(0, 3).map((post, index) => ({
        responseNumber: post.responseNumber,
        threadTitle: post.threadTitle,
        postUrl: post.postUrl,
        excerpt: compactExample(localContexts[index], 260),
      })),
    };
  });
  const actCounts = speechActs.map((act) => ({
    id: act.id,
    label: act.label,
    count: rows.filter((row) => row.acts.includes(act.id)).length,
    examples: rows.filter((row) => row.acts.includes(act.id)).slice(0, 10).map((row) => row.heading),
  })).sort((left, right) => right.count - left.count);
  const excerptRows = quoteCorpus.excerpts.map((excerpt) => ({
    id: excerpt.id,
    text: excerpt.text,
    acts: classifySpeechActs(excerpt.text),
  }));
  const excerptActCounts = speechActs.map((act) => ({
    id: act.id,
    label: act.label,
    count: excerptRows.filter((row) => row.acts.includes(act.id)).length,
    examples: excerptRows.filter((row) => row.acts.includes(act.id)).slice(0, 8).map((row) => row.text),
  })).sort((left, right) => right.count - left.count);
  const exactContextMatches = quoteCorpus.headings.filter((heading) => (heading.contexts || []).some((context) => {
    const post = postById.get(context.postId);
    return post && normalizeForSearch(post.content).includes(normalizeForSearch(heading.text));
  })).length;
  return {
    headingCount: rows.length,
    contextBackedCount: rows.filter((row) => row.contextCount).length,
    exactContextMatches,
    unclassifiedCount: rows.filter((row) => !row.acts.length).length,
    actCounts,
    headings: rows,
    excerptCount: excerptRows.length,
    unclassifiedExcerptCount: excerptRows.filter((row) => !row.acts.length).length,
    excerptActCounts,
  };
}

function analyzeMoveSequences() {
  const transitions = [];
  const sequences = [];
  for (const post of logCorpus.posts) {
    const lines = post.content.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const moves = lines.map(primarySpeechAct).filter((move) => move !== "unclassified");
    if (moves.length < 2) continue;
    const collapsed = moves.filter((move, index) => index === 0 || move !== moves[index - 1]);
    sequences.push({
      postId: post.id,
      responseNumber: post.responseNumber,
      postUrl: post.postUrl,
      threadTitle: post.threadTitle,
      moves: collapsed,
      excerpt: compactExample(post.content, 240),
    });
    for (let index = 1; index < collapsed.length; index += 1) {
      transitions.push(`${collapsed[index - 1]} -> ${collapsed[index]}`);
    }
  }
  return {
    postsWithMultipleMoves: sequences.length,
    topTransitions: countBy(transitions).slice(0, 40),
    examples: sequences.slice(0, 120),
  };
}

function analyzeSurface(corpusText) {
  const parentheticals = Array.from(corpusText.matchAll(/[（(]([^（）()\n]{1,30})[）)]/g), (match) => match[1].trim());
  const discourseMarkers = ["しかも", "だが", "だから", "つまり", "なぜなら", "ところが", "ちなみに", "因みに", "そもそも", "やはり", "まぁ"];
  const contentLines = corpusText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const finalPunctuation = contentLines.filter((line) => /[。！？!?…]$/.test(line)).length;
  return {
    parentheticalCount: parentheticals.length,
    topParentheticals: countBy(parentheticals).slice(0, 40),
    discourseMarkers: discourseMarkers.map((marker) => ({
      marker,
      count: (corpusText.match(new RegExp(marker, "g")) || []).length,
    })).sort((left, right) => right.count - left.count),
    contentLineCount: contentLines.length,
    finalPunctuationCount: finalPunctuation,
    finalPunctuationRate: Number((finalPunctuation / Math.max(1, contentLines.length)).toFixed(6)),
    firstPersonCounts: countBy(Array.from(corpusText.matchAll(/俺|おれ|オレ|自分|私|僕/g), (match) => match[0])),
    secondPersonCounts: countBy(Array.from(corpusText.matchAll(/お前ら|おまえら|お前|おまえ|貴様/g), (match) => match[0])),
  };
}

function renderMarkdown(analysis) {
  const anchorLabels = {
    standalone_reply: "独立返信",
    fused_performative: "アンカー直後の圧縮発話行為",
    agreement_target: "同意先",
    evidence_source: "証拠・根拠元",
    evaluation_target: "評価対象",
    vocative: "呼びかけ",
    embedded_argument: "文中の項",
    prefixed_clause: "アンカー始まりの節",
    sentence_tail_reference: "文末参照",
    coordination: "複数アンカーの並列",
  };
  const lines = [
    "# ブロント語・語録構文分析",
    "",
    "## 結論",
    "",
    "語録は単語置換表ではなく、発話行為と段落遷移の部品として扱う必要がある。特に `>>` は単なる宛先記号ではない。独立返信、文中の名詞句、評価対象、同意先、証拠元、複数対象の並列、発話行為の圧縮という複数の統語機能を持つ。",
    "",
    "`今回のでそれが良くわかったよ>>199感謝` は「牙抜いてきた」と同じ宛先型ではない。前文で認識更新を述べ、`>>199` で情報源を指し、助詞を省略した `感謝` を直結する圧縮発話行為である。したがって生成単位は `>>感謝` ではなく、`認識更新 + >>参照先 + 感謝` の全体になる。",
    "",
    "## 資料範囲",
    "",
    `- 実ログ投稿: ${analysis.sources.logPosts}件`,
    `- 実ログ文: ${analysis.sources.logSentences}件`,
    `- 名言見出し: ${analysis.sources.quoteHeadings}件`,
    `- 原投稿へ接続できた見出し: ${analysis.sources.contextBackedHeadings}件`,
    `- 改変集: ${analysis.sources.novelChapters}章`,
    "",
    "## `>>` 構文",
    "",
    `生ログ中の数値アンカーは${analysis.anchors.occurrences}件、${analysis.anchors.lines}行に現れる。位置だけを見ると ${analysis.anchors.placementCounts.map((row) => `${row.value} ${row.count}件`).join("、")}。`,
    "",
    "| 機能 | 件数 | 役割 |",
    "|---|---:|---|",
    ...analysis.anchors.constructionCounts.map((row) => {
      const descriptions = {
        standalone_reply: "前投稿全体への返信枠",
        fused_performative: "助詞を落とし、感謝などをアンカーへ直結",
        agreement_target: "賛成・同意する相手を指定",
        evidence_source: "証拠、証言、観察の出所を指定",
        evaluation_target: "賢い、偽者、馬鹿などの評価対象",
        vocative: "相手への直接呼びかけ",
        embedded_argument: "文中で主語・目的語・引用元として使用",
        prefixed_clause: "アンカーを主題にして節を開始",
        sentence_tail_reference: "結論の後ろへ参照先を追置",
        coordination: "複数レスを一つの陣営・評価へ束ねる",
      };
      return `| ${anchorLabels[row.value] || row.value} | ${row.count} | ${descriptions[row.value] || ""} |`;
    }),
    "",
    "代表例:",
    "",
    "```text",
    "なんだ急に牙抜いてきた>>60",
    "今回のでそれが良くわかったよ>>199感謝",
    ">>318と>>320は賢い",
    "つまり>>450さんの圧勝が決定",
    "これは>>1さんの言うようにバーバリアンが大量に出回ってる証拠だべな",
    "```",
    "",
    "ここから、アンカー生成は最低でも `reply`、`vocative`、`evaluation`、`agreement`、`evidence`、`coordination`、`fused-performative` に分ける必要がある。",
    "",
    "## 語録の発話機能",
    "",
    `現在の名言集分類では「general」が大きすぎるため、見出しに最も近い原投稿の前後行を合わせて複数ラベルで再分類した。原投稿へ接続できた${analysis.quoteFunctions.contextBackedCount}見出しは、すべて実投稿内の表記と一致した。残る${analysis.quoteFunctions.headingCount - analysis.quoteFunctions.contextBackedCount}見出しは出典文脈未確認なので生成材料から外すべきである。件数は見出し165件に対する重複集計。`,
    "",
    "| 発話機能 | 該当見出し数 | 例 |",
    "|---|---:|---|",
    ...analysis.quoteFunctions.actCounts.map((row) => `| ${row.label} | ${row.count} | ${row.examples.slice(0, 3).join(" / ")} |`),
    "",
    `規則で未分類の見出しは${analysis.quoteFunctions.unclassifiedCount}件。強調語録${analysis.quoteFunctions.excerptCount}件のうち未分類は${analysis.quoteFunctions.unclassifiedExcerptCount}件。強調部分には再利用可能な構文だけでなく、固有の装備名・人物・その投稿だけの物語内容が混在する。未分類を無理にテンプレート化せず、構文と話題ペイロードを分離すべきである。`,
    "",
    "強調語録側の上位機能:",
    "",
    ...analysis.quoteFunctions.excerptActCounts.slice(0, 10).map((row) => `- ${row.label}: ${row.count}件（${row.examples.slice(0, 2).join(" / ")}）`),
    "",
    "## 段落としての基本構造",
    "",
    "実ログと改変集を合わせると、語録は次のような遷移で成立する。単独フレーズを感情タグから引く方式では、この順序と役割を失う。",
    "",
    "1. 対抗型: 相手の挑発・主張 → アンカー付き返答 → 相手の格下げ → 自分の能力列挙 → 勝敗の必然化",
    "2. 証明型: 結論 → `>>` で証言・証拠元を指定 → 擬似論理 → 反論不能の宣言",
    "3. 感謝型: 新しい理解・利益の確認 → `>>情報源` → 助詞なしの感謝 → 対象の価値を長く称揚",
    "4. 救援自慢型: 周囲の危機 → 主人公の介入 → 数値を伴う成果 → 周囲の反応推測 → 謙遜または当然化",
    "5. 称賛否認型: 他者からの称賛 → `それほどでもない` → 謙虚さ自体を二次的な自慢へ変換",
    "6. 訂正防御型: 誤記・勘違い → 小さなミスとして限定 → 相手の読解力不足へ責任転嫁 → 元の主張を維持",
    "7. 状態比較型: 状況の提示 → 一般人への影響 → ナイトには通用しない理由 → 格差の確定",
    "",
    "## 表層上の制約",
    "",
    `- 内容行${analysis.surface.contentLineCount}行のうち句点・感嘆符・疑問符などで終わる行は${analysis.surface.finalPunctuationCount}行（${(analysis.surface.finalPunctuationRate * 100).toFixed(2)}%）`,
    `- 括弧内挿は${analysis.surface.parentheticalCount}件。上位は ${analysis.surface.topParentheticals.slice(0, 10).map((row) => `${row.value}(${row.count})`).join("、")}`,
    `- 接続標識の上位は ${analysis.surface.discourseMarkers.slice(0, 8).map((row) => `${row.marker}(${row.count})`).join("、")}`,
    "- 句点の少なさだけでなく、改行が文境界と話の加速を兼ねる",
    "- 括弧は説明ではなく、感情・現実性・予知・立場を後付け認定する",
    "- `しかも`、`だが`、`だから`は論理的接続より、列挙を止めず自分に有利な結論へ進める装置として働く",
    "",
    "## 生成器へ落とす際のデータ単位",
    "",
    "語録を一行のテンプレートにせず、次の形で保存する必要がある。",
    "",
    "```text",
    "construction: fused_performative",
    "precondition: 新しい理解や利益が直前にある",
    "target_role: 情報源・同意先",
    "surface: <認識更新文>>>><target><performative>",
    "example: 今回のでそれが良くわかったよ>>199感謝",
    "forbidden: 危機、対抗者、無関係な対象への単独挿入",
    "continuation: 対象の価値を説明・称揚する段落",
    "```",
    "",
    "候補比較では、語彙の一致だけでなく `precondition`、`target_role`、前後の遷移、禁止条件を検証する。",
    "",
    "## 次に行うべきこと",
    "",
    "1. 165見出しを原投稿単位で読み直し、複数ラベルと前後条件を人間可読の台帳へする",
    "2. 投稿内の各行へ発話機能を付け、頻出数ではなく使用可能条件を抽出する",
    "3. `>>` を上記7構文へ分離し、数値・文字・文中融合を別々に生成する",
    "4. 改変集23章は語録の出典ではなく、長文へ展開する順序の検証資料として使う",
    "5. 実装前に、各構文について適合例・不適合例を最低5件ずつ固定テストにする",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  if (!fs.existsSync(logPath)) throw new Error(`ログが見つかりません: ${logPath}`);
  const rawLog = fs.readFileSync(logPath, "utf8").replace(/^\uFEFF/, "");
  const analysis = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      logPath,
      logPosts: logCorpus.comparison.archivePosts,
      logSentences: logCorpus.comparison.archiveSentences,
      quoteHeadings: quoteCorpus.counts.headings,
      quoteExcerpts: quoteCorpus.counts.excerpts,
      contextBackedHeadings: quoteCorpus.counts.headingsWithContext,
      novelChapters: novelModel.chapters.length,
    },
    anchors: analyzeAnchors(rawLog),
    quoteFunctions: analyzeQuoteFunctions(),
    moveSequences: analyzeMoveSequences(),
    surface: analyzeSurface(logCorpus.posts.map((post) => post.content).join("\n")),
    novelStructure: {
      totals: novelModel.totals,
      structure: novelModel.structure,
      motifs: novelModel.motifs,
    },
  };
  const dataPath = path.join(ROOT, "data", "phrase-grammar-analysis.json");
  const reportPath = path.join(ROOT, "docs", "phrase-grammar-analysis.md");
  fs.writeFileSync(dataPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, renderMarkdown(analysis), "utf8");
  console.log(`アンカー: ${analysis.anchors.occurrences}件`);
  console.log(`語録見出し: ${analysis.quoteFunctions.headingCount}件`);
  console.log(`未分類見出し: ${analysis.quoteFunctions.unclassifiedCount}件`);
  console.log(`出力: ${dataPath}`);
  console.log(`出力: ${reportPath}`);
}

main();
