"use strict";

const { eraFrameDefinitions } = require("./era-grammar");

const QUOTED_CONTENT = /「[^」]*」|『[^』]*』/g;
const ERA_CONSTRUCTION_LINES = new Set(
  Object.values(eraFrameDefinitions)
    .flat()
    .flatMap((frame) => [
      frame.render("__BASE__"),
      frame.renderPending ? frame.renderPending("__BASE__") : "",
    ])
    .flatMap((value) => value.split(/\n/))
    .map((line) => line.trim())
    .filter((line) => line && line !== "__BASE__")
    .map((line) => line.normalize("NFKC")),
);

// A line only counts as converted when its narration contains an observed,
// distinctive Buront construction.  Common Japanese words such as 「結果」 or
// 「事実」 are intentionally not enough by themselves.
const BURONT_CONSTRUCTIONS = [
  /おいィ/,
  /なんだが/,
  /ｶｶッ/,
  /アワレにも/,
  /時既に/,
  /確定的に明らか/,
  /あもりにも/,
  /すぐる(?:でしょう|だろう|ぞ|$)/,
  /ばつ牛ﾝ/,
  /有頂天/,
  /唯一ぬに/,
  /稀によく/,
  /勝つる/,
  /遅れをとるはずは[無な]い/,
  /騒ぐと危険/,
  /どこもおかしくはない/,
  /それほどでもない/,
  /深い悲しみ/,
  /グーの音/,
  /生半可な(?:貧弱)?一般人/,
  /貧弱一般人/,
  /一般人(?:ども|なら|には扱え|では見切れ|と同じ)/,
  /見事なｶｳﾝﾀｰ/,
  /黄金の鉄の塊/,
  /ダイヤモンド・パワー/,
  /致命的な致命傷/,
  /封印がとけ/,
  /武の心/,
  /ﾅｲﾄ/,
  /雷属性|光属性|闇属性/,
  /破壊力/,
  /一級(?:ﾌﾟﾚｲﾔｰ|プログラマー|と言われ)/,
  /Ｐ?ｽｷﾙ|Ｐスキル|Pスキル/,
  /ﾉｰﾘｽｸ/,
  /ｹﾞｰﾑｵｰﾊﾞｰ/,
  /本人はそれほどでもない/,
  /まぁこうなることはわかってた（予知夢）/,
  /英語でいうと/,
  /という(?:話|事|現実|真相)なんだが/,
  /(?:という|この)時点ですでに格が違う/,
  /という会話が出た時点ですでに格が違う/,
  /(?:という|これが)圧倒的な結果/,
  /(?:という|これが)見事な(?:仕事|結果|ｶｳﾝﾀｰ)/,
  /という有様/,
  /勝負はついていた/,
  /未来は確定的に明らか/,
  /後日談はノンフィクション/,
  />>[^\s\n、。！？!?]{1,24}(?:感謝|に賛成|に同意|が証明|の意見に)/,
  ...Object.values(eraFrameDefinitions)
    .flat()
    .map((frame) => frame.marker),
];

const ROLE_TEMPLATES = Object.freeze({
  setting: [
    (line) => `${line}という話なんだが`,
    (line) => `英語でいうと${line}　そういう事になる`,
    (line) => `${line}　この時点ですでに格が違う`,
  ],
  problem: [
    (line) => `アワレにも${line}という有様`,
    (line) => `${line}とかあもりにも異変が露骨すぐるでしょう？`,
    (line) => `${line}ので貧弱一般人ならリアルでビビる`,
  ],
  reveal: [
    (line) => `${line}という真相が確定的に明らかになった`,
    (line) => `${line}という事実まで確定的に明らか`,
    (line) => `英語でいうと${line}　これが真相になる`,
  ],
  action: [
    (line) => `ｶｶッっと${line}`,
    (line) => `${line}　これが見事なｶｳﾝﾀｰ`,
    (line) => `${line}　この動きは生半可な一般人には扱えない技量`,
  ],
  result: [
    (line) => `${line}　これが圧倒的な結果`,
    (line) => `${line}となった時点で勝負はついていた`,
    (line) => `${line}　これがグーの音も出ない結果`,
  ],
  aftermath: [
    (line) => `因みに${line}という後日談まであるんだが`,
    (line) => `${line.replace(/らしい$/, "")}らしいぞ？この後日談はノンフィクション`,
    (line) => `後から聞くと${line}という話なんだが`,
  ],
  future: [
    (line) => `${line}　これで未来は確定的に明らか`,
    (line) => `因みに次の一手は${line}という話なんだが`,
    (line) => `英語でいうと今後は${line}　そういう事になる`,
  ],
  evaluation: [
    (line) => `${line}と感心はするがどこもおかしくはない`,
    (line) => `${line}なのは確定的に明らか`,
    (line) => `英語でいうと${line}　そういう評価になる`,
  ],
  dialogue: [
    (line) => `おいィ？${line}`,
    (line) => `${line}という会話が出た時点ですでに格が違う`,
    (line) => `${line}とか言ってくるので貧弱一般人ならここで帰る`,
  ],
  background: [
    (line) => `因みに${line}という話なんだが`,
    (line) => `${line}　この時点ですでに格が違う`,
    (line) => `英語でいうと${line}　そういう事になる`,
  ],
});

function stripQuotedContent(value) {
  return String(value ?? "").replace(QUOTED_CONTENT, "");
}

function normalizeLine(value) {
  return String(value ?? "")
    .trim()
    .replace(/[。]+$/g, "")
    .replace(/[ \t]+/g, " ");
}

function hasBurontConstruction(value) {
  const narration = stripQuotedContent(value).trim();
  if (!narration) return false;
  const normalized = narration.normalize("NFKC");
  return ERA_CONSTRUCTION_LINES.has(normalized)
    || BURONT_CONSTRUCTIONS.some((pattern) => pattern.test(narration) || pattern.test(normalized));
}

function inferSurfaceRole(value, index = 0) {
  const line = stripQuotedContent(value);
  if (/[「『]/.test(value)) return "dialogue";
  if (/翌朝|翌日|翌週|明日|来週|今後|これから|次回|次は/.test(line)) return "future";
  if (/感心|評価|思った|確信|理解した|見習|素晴ら|すばら|スゴイ|すごい/.test(line)) return "evaluation";
  if (/後日|帰り道|帰路|後から|聞いた話|そのあと|その後/.test(line)) return "aftermath";
  if (/真相|正体|判明|気[が付づ]|分かった|理解した|ではなく|首吊り死体|種明かし/.test(line)) return "reveal";
  if (/全滅|消滅|片付|完成|完了|成功|到着|復旧|間に合|勝利|決まった|落ち着いた|取り返|特定|突き止め|見つけ出|短くな|縮ま|減った|増えた/.test(line)) {
    return "result";
  }
  if (/恐怖|異変|違和感|危険|故障|障害|遅れ|間に合わ|混乱|衝突|迷|霧|煙|炎|火が|寒気|震え|叫|泣|見失|分からなく|できなく|停止|倒され|奪われ/.test(line)) {
    return "problem";
  }
  if (/作[っる]|作成|修正|実装|導入|用意|整理|確認|点検|投入|助け|止め|振り|構え|参戦|移動|歩|向か|決め|選ん|見上げ|取り出|乗り込|飛び乗/.test(line)) {
    return "action";
  }
  return index === 0 ? "setting" : "background";
}

function applyLexicalSurface(value) {
  return value
    .replace(/あまりにも/g, "あもりにも")
    .replace(/すぎる/g, "すぐる")
    .replace(/全員/g, "ぜいいん")
    .replace(/素早く|すばやく|急いで/g, "ｶｶッっと")
    .replace(/プレイヤー|プレーヤー/g, "ﾌﾟﾚｲﾔｰ")
    .replace(/スキル/g, "ｽｷﾙ")
    .replace(/ゲームオーバー/g, "ｹﾞｰﾑｵｰﾊﾞｰ");
}

function burontizeLine(value, random = Math.random, options = {}) {
  const line = applyLexicalSurface(normalizeLine(value));
  if (!line || hasBurontConstruction(line)) return line;
  const role = options.role || inferSurfaceRole(line, options.index || 0);
  const templates = ROLE_TEMPLATES[role] || ROLE_TEMPLATES.background;
  let selectedIndex = Math.floor(random() * templates.length) % templates.length;
  if (templates.length > 1 && selectedIndex === options.previousTemplateIndex) {
    selectedIndex = (selectedIndex + 1) % templates.length;
  }
  return normalizeLine(templates[selectedIndex](line));
}

function burontizeText(value, random = Math.random) {
  let previousTemplateIndex = -1;
  return String(value ?? "")
    .split(/\n/)
    .map((line, index) => {
      if (!line.trim()) return "";
      const role = inferSurfaceRole(line, index);
      const converted = burontizeLine(line, random, { index, role, previousTemplateIndex });
      const templates = ROLE_TEMPLATES[role] || ROLE_TEMPLATES.background;
      if (converted !== normalizeLine(line)) {
        previousTemplateIndex = templates.findIndex((template) => normalizeLine(template(normalizeLine(line))) === converted);
      }
      return converted;
    })
    .join("\n");
}

function burontLineCoverage(value) {
  const lines = String(value ?? "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const uncoveredLines = lines.filter((line) => !hasBurontConstruction(line));
  return {
    lineCount: lines.length,
    coveredLineCount: lines.length - uncoveredLines.length,
    coverage: lines.length ? (lines.length - uncoveredLines.length) / lines.length : 1,
    uncoveredLines,
  };
}

module.exports = {
  BURONT_CONSTRUCTIONS,
  burontLineCoverage,
  burontizeLine,
  burontizeText,
  hasBurontConstruction,
  inferSurfaceRole,
  stripQuotedContent,
};
