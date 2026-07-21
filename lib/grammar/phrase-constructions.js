"use strict";

const anchorConstructions = Object.freeze({
  standalone_reply: {
    id: "standalone_reply",
    observedCount: 883,
    targetRoles: ["opponent", "speaker", "source", "any"],
    preconditions: ["参照対象が存在する"],
    example: ">>203",
  },
  prefixed_clause: {
    id: "prefixed_clause",
    observedCount: 29,
    targetRoles: ["opponent", "speaker", "source"],
    preconditions: ["参照対象を節の主題にする"],
    example: ">>123は口だけデコピンで人を倒せると思ってるのか？",
  },
  coordination: {
    id: "coordination",
    observedCount: 16,
    targetRoles: ["opponent", "supporter"],
    preconditions: ["同じ評価を受ける対象が二つ以上存在する"],
    example: ">>318と>>320は賢い",
  },
  evaluation_target: {
    id: "evaluation_target",
    observedCount: 15,
    targetRoles: ["opponent", "supporter"],
    preconditions: ["対象への評価が入力に存在する"],
    example: ">>161は賢い",
  },
  embedded_argument: {
    id: "embedded_argument",
    observedCount: 14,
    targetRoles: ["source", "speaker", "opponent"],
    preconditions: ["対象が主語・目的語・引用元になる"],
    example: "これは>>1さんの言うように証拠だべな",
  },
  evidence_source: {
    id: "evidence_source",
    observedCount: 7,
    targetRoles: ["source", "speaker"],
    preconditions: ["証拠・証言・確認結果が存在する"],
    example: ">>15に証拠が出てる",
  },
  agreement_target: {
    id: "agreement_target",
    observedCount: 5,
    targetRoles: ["supporter", "speaker"],
    preconditions: ["同意・賛成が入力に存在する"],
    example: "俺は>>1に賛成だな",
  },
  sentence_tail_reference: {
    id: "sentence_tail_reference",
    observedCount: 5,
    targetRoles: ["source", "speaker", "opponent"],
    preconditions: ["結論の後ろへ参照先を追置できる"],
    example: "つまり>>450さんの圧勝が決定",
  },
  vocative: {
    id: "vocative",
    observedCount: 4,
    targetRoles: ["opponent", "speaker"],
    preconditions: ["対象への直接呼びかけが必要"],
    example: ">>161よ、相手にしてるとﾊﾞｶがうつるぞ（苦笑）",
  },
  fused_performative: {
    id: "fused_performative",
    observedCount: 1,
    targetRoles: ["source", "supporter"],
    preconditions: ["新しい理解または利益がある", "感謝対象が特定できる"],
    forbidden: ["危機そのもの", "無関係な人物", "対象のない一般的成功"],
    example: "今回のでそれが良くわかったよ>>199感謝",
  },
});

function constructionList() {
  return Object.values(anchorConstructions);
}

module.exports = { anchorConstructions, constructionList };
