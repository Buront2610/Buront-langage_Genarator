"use strict";

const quoteCorpus = require("../data/quote-corpus.json");

const patterns = {
  crisis: [
    { id: "crisis_deep_sorrow", source: "ブロントは深い悲しみに包まれた", marker: /深い悲しみに包まれ/, when: ({ hasInitialCrisis }) => hasInitialCrisis, render: ({ audience }) => `${audience}は深い悲しみに包まれていた` },
    { id: "crisis_unthinkable_sorrow", source: "想像を絶する悲しみがブロントを襲った", marker: /想像を絶する悲しみ/, when: ({ hasInitialCrisis }) => hasInitialCrisis, render: ({ audience }) => `想像を絶する悲しみが${audience}を襲った` },
    { id: "crisis_not_joke", source: "ちょとｓＹレならんしょこれは・・？", marker: /ｓＹレならん/, when: ({ hasDanger }) => hasDanger, render: ({ audience, object }) => `${audience}は「ちょとｓＹレならんしょこの${object}は・・？」と騒ぎ出した` },
    { id: "crisis_stop_fool", source: "おい、やめろ馬鹿", marker: /おい、やめろ馬鹿/, when: ({ hasDanger, hasChallenge }) => hasDanger || hasChallenge, render: ({ audience }) => `おい、やめろ馬鹿と止めても${audience}の混乱は止まらない` },
    { id: "crisis_too_late", source: "手遅れになるのではままるな", marker: /手遅れになるのではままる/, when: ({ hasDeadline }) => hasDeadline, render: ({ audience }) => `${audience}は手遅れになるのではままるなと顔面蒼白になった` },
    { id: "crisis_missing", source: "いくえ不明", marker: /いくえ不明/, when: ({ hasMissing }) => hasMissing, render: ({ object }) => `${object}の行方がいくえ不明になりかけていた` },
    { id: "crisis_game_over", source: "人生がｹﾞｰﾑｵｰﾊﾞｰになる", marker: /ｹﾞｰﾑｵｰﾊﾞｰ/, when: ({ hasDanger, hasDeadline }) => hasDanger || hasDeadline, render: ({ audience }) => `このままでは${audience}の仕事がｹﾞｰﾑｵｰﾊﾞｰになるのは目に見えていた` },
  ],
  contrast: [
    { id: "contrast_born_light", source: "ナイトは生まれもった光属性の者しか扱い切れない", marker: /生まれもった.*(?:者しか扱い切れない|属性なので.*を扱い切れる)/, render: ({ hero, object, persona }) => `${hero}は生まれもった${persona}属性なので${object}を扱い切れる` },
    { id: "contrast_skill_society", source: "Ｐｽｷﾙを上げただけで十分一般社会で頼りにされる", marker: /一般社会で頼りにされる/, render: ({ hero, persona }) => `${hero}ほどＰｽｷﾙを上げれば十分一般社会で頼りにされる${persona}になれる` },
    { id: "contrast_strongest_duty", source: "最強の義務は最強のプレッシャーとなって襲いかかってくる", marker: /最強の義務は最強のプレッシャー/, when: ({ hasInitialCrisis, hasDeadline, hasDanger, persona }) => hasInitialCrisis || hasDeadline || hasDanger || persona === "会社員", render: ({ hero }) => `最強の義務は最強のプレッシャーとなって${hero}に襲いかかる` },
    { id: "contrast_ordinary", source: "普通は普通お前が普通なら普通がわかるはず", marker: /普通は普通.*(?:普通が|普通なら).*わかるはず/, render: ({ audience, object, eventFrame, evaluationNoun }) => eventFrame === "observation" ? `普通は普通なので${audience}が普通なら状況の細部がわかるはず` : eventFrame === "evaluation" ? `普通は普通なので${audience}が普通なら${object}の${evaluationNoun}がわかるはず` : `普通は普通なので${audience}が普通なら${object}の難しさがわかるはず` },
    { id: "contrast_high_skill", source: "おれはＰスキルの高い最高のナイトだ", marker: /[ＰP](?:スキル|ｽｷﾙ)の高い最高の/, render: ({ hero, persona, eventFrame, evaluationNoun }) => eventFrame === "observation" ? `${hero}はＰスキルの高い最高の${persona}なので一般人が見落とす違いも一瞬で見切る` : eventFrame === "evaluation" ? `${hero}はＰスキルの高い最高の${persona}なので${evaluationNoun}を見誤らない` : `${hero}はＰスキルの高い最高の${persona}なので一般人と同じ苦戦はしない` },
  ],
  state: [
    { id: "state_iron_body", source: "黄金の鉄の塊で出来ているナイト", marker: /黄金の鉄の塊で出来ている/, render: ({ hero, topic }) => `${hero}は黄金の鉄の塊で出来ているので${topic}程度ではびくともしない` },
    { id: "state_no_damage", source: "俺は関係ないから何を言われても関係ないからノーダメージだから", marker: /関係ないからノーダメージだから/, render: ({ hero, topic }) => `${hero}にとって${topic}は関係ないからノーダメージだから` },
    { id: "state_hard_defense", source: "防御もかなりかたい", marker: /防御もかなりかたい/, render: ({ hero, topic }) => `${hero}は防御もかなりかたいので${topic}の方が先に諦める` },
    { id: "state_diamond_spirit", source: "ダイヤモンド・パワーの精神力", marker: /ダイヤモンド・パワーの精神力/, render: ({ hero, topic }) => `${hero}はダイヤモンド・パワーの精神力を持つので${topic}に動じる要素がない` },
    { id: "state_long_life", source: "本能的に長寿タイプ", marker: /本能的に長寿タイプ/, render: ({ hero, topic }) => `${hero}は本能的に長寿タイプなので${topic}くらいでは調子を崩さない` },
    { id: "state_holy_attribute", source: "ナイトは生まれもった光属性の者しか扱い切れない", marker: /生まれもった光属性/, render: ({ hero, topic }) => `${hero}は生まれもった光属性なので${topic}の闇属性は通用しない` },
  ],
  retort: [
    { id: "retort_fangs", source: "なんだ急に牙抜いてきた", marker: /なんだ急に牙抜いてきた[　 ]*>>[^\s\n]+/, when: ({ hasChallenge, replyTarget }) => hasChallenge && Boolean(replyTarget), render: ({ hero, replyTarget, replyCoda }) => `なんだ急に牙抜いてきた　>>${replyTarget}\n${replyCoda || `勝手にライバル視するな${hero}の圧倒的なＰｽｷﾙの前に勝負は長くない`}` },
    { id: "retort_opposition", source: "どちかというと大反対", marker: /どちかというと大反対/, when: ({ hasChallenge }) => hasChallenge, render: ({ hero }) => `${hero}はその言い分にどちかというと大反対だった` },
    { id: "retort_sudden_talk", source: "恥知らずなカイ使いがいた！！", marker: /何いきなり話かけて来てるわけ/, when: ({ hasChallenge, hasDialogue }) => hasChallenge || hasDialogue, render: ({ audience }) => `${audience}は「何いきなり話かけて来てるわけ？」と強がった` },
    { id: "retort_dekopin", source: "口だけデコピンで人を倒せると思ってるのか？", marker: /口だけ.*と思ってるのか/, when: ({ hasChallenge }) => hasChallenge, render: ({ hero, audience }) => `${hero}は${audience}に口だけで勝てると思ってるのか？と忠告した` },
  ],
  intervention: [
    { id: "intervention_unsealed", source: "封印がとけられた！", marker: /封印がとけられた/, render: ({ hero, payload }) => `ここで${hero}の封印がとけられた！\n${payload}` },
    { id: "intervention_counter", source: "見ろ、見事なカウンターで返した", marker: /見事なカウンター/, render: ({ hero, payload }) => `見ろ、${hero}が見事なカウンターで返した\n${payload}` },
    { id: "intervention_warmup", source: "まずは準備運動に軽く論破", marker: /準備運動に軽く/, render: ({ hero, payload }) => `${hero}はまず準備運動に軽く手を出した\n${payload}` },
    { id: "intervention_simulation", source: "常に自然と頭の中でシュミレートしてるくらい格闘に精通してる", marker: /頭の中でシュミレート/, render: ({ hero, payload }) => `${hero}は常に頭の中でシュミレートしていたので迷いがない\n${payload}` },
    { id: "intervention_no_risk", source: "ﾉｰﾘｽｸで加速する", marker: /ﾉｰﾘｽｸで加速/, render: ({ hero, payload }) => `${hero}がﾉｰﾘｽｸで加速すると\n${payload}` },
    { id: "intervention_clean_spirit", source: "おもわずいさぎよい武の心がでてしまった結果だった", marker: /いさぎよい武の心/, render: ({ hero, payload }) => `${hero}のおもわずいさぎよい武の心が出てしまった結果\n${payload}` },
    { id: "intervention_ten_percent", source: "お前が２番でもういいよ", marker: /１０％のパワー/, render: ({ hero, payload }) => `${hero}はまだ１０％のパワーも使っていないが\n${payload}` },
    { id: "intervention_hoh", source: "たまに危ない攻撃も「ほう・・」て刀で受け流す", marker: /「ほう・・」/, render: ({ hero, payload }) => `${hero}は「ほう・・」と状況を受け流してから一手だけ出した\n${payload}` },
    { id: "intervention_lightning", source: "雷属性の左", marker: /雷属性の/, render: ({ hero, payload }) => `${hero}が雷属性の速度で動くと\n${payload}` },
    { id: "intervention_holy_cleanup", source: "生半可なナイトでは使えないホーリを使って敵を掃除していたら３回連続見つめられた", marker: /生半可な.*では扱えない/, render: ({ hero, object, payload }) => `${hero}が生半可な一般人では扱えない技量で${object}を処理すると\n${payload}` },
  ],
  reaction: [
    { id: "reaction_no_sound", source: "おっととグーの音も出ないくらいに凹ませてしまった感", marker: /グーの音も出ない/, render: ({ audience }) => `${audience}はグーの音も出ないくらいに黙った` },
    { id: "reaction_mind_read", source: "なんで心を読まれたのかとギクッとしてびびっただろ", marker: /心を読まれたのかとギクッ/, when: ({ hasChallenge }) => hasChallenge, render: ({ audience }) => `${audience}はなんで心を読まれたのかとギクッとしてびびったらしい` },
    { id: "reaction_heard", source: "おいィ？お前らは今の言葉聞こえたか？", marker: /おいィ？.*今の.*(?:聞こえたか|見えたか)/, render: ({ audience }) => `おいィ？${audience}は今の結果が見えたか？` },
    { id: "reaction_complete", source: "完　　全　　論　　破", marker: /完\s*全\s*解\s*決/, render: () => `完　　全　　解　　決` },
    { id: "reaction_win", source: "これで勝つる！", marker: /これで勝つる/, render: ({ audience }) => `${audience}から「これで勝つる！」という声が上がった` },
    { id: "reaction_fist", source: "常識の人もいかついて拳を上げかけていたな", marker: /いかついて拳を上げかけ/, render: ({ audience }) => `${audience}もいかついて拳を上げかけていたな` },
    { id: "reaction_warm_shoulder", source: "肩に暖かなものを感じ振り向くとそこには笑顔でナイトが待っていた", marker: /肩に暖かなものを感じ/, when: ({ hasInitialCrisis }) => hasInitialCrisis, render: ({ hero, audience }) => `${audience}が肩に暖かなものを感じ振り向くとそこには笑顔で${hero}が待っていた` },
    { id: "reaction_god_job", source: "god job!", marker: /god job！/, render: ({ audience }) => `${audience}が思わず「god job！」と言った` },
    { id: "reaction_bared", source: "何故そんな必死なのかバレてる証拠に笑顔が出てしまう", marker: /必死(?:なのか|だったのか)バレてる証拠/, when: ({ hasChallenge }) => hasChallenge, render: ({ audience }) => `${audience}は何故そんなに必死だったのかバレてる証拠に笑顔が出てしまった` },
    { id: "reaction_unique", source: "名実ともに唯一ぬにの盾", marker: /唯一ぬにの/, render: ({ hero, persona }) => `${hero}が名実ともに唯一ぬにの${persona}だと証明された` },
  ],
  conclusion: [
    { id: "conclusion_step_back", source: "ここで一歩引くのが大人の醍醐味", marker: /一歩引くのが大人の醍醐味/, render: ({ hero }) => `だが${hero}はここで一歩引くのが大人の醍醐味だと何も言わなかった` },
    { id: "conclusion_broad_heart", source: "自分の心に広さが怖い", marker: /自分の心の広さが怖い/, render: ({ hero }) => `${hero}は怒るどころか助けてしまう自分の心の広さが怖いらしい` },
    { id: "conclusion_humble", source: "謙虚だからほめられても自慢はしない", marker: /ほめられても自慢はしない/, render: ({ hero }) => `${hero}は謙虚だからほめられても自慢はしない` },
    { id: "conclusion_not_much", source: "それほどでもない", marker: /それほどでもない/, render: ({ family }) => family === "self" ? `俺はそれほどでもないと言った` : `本人はそれほどでもないと言っていた` },
    { id: "conclusion_learn", source: "お前はまだ成長するﾌﾞﾛﾝﾄさんに少しでも近づけるように", marker: /少しでも近づけるように/, render: ({ audience, hero }) => `${audience}はまだ成長する${hero}に少しでも近づけるように` },
    { id: "conclusion_nonfiction", source: "英語でいうとノンフィクション", marker: /英語でいうとノンフィクション/, render: () => `これは作り話ではなく英語でいうとノンフィクション` },
    { id: "conclusion_hunter", source: "俺は狩る側であって狩られる側じゃない", marker: /狩る側であって狩られる側じゃない/, render: ({ hero }) => `${hero}は問題を狩る側であって狩られる側じゃない` },
    { id: "conclusion_rank", source: "おれはＰスキルの高い最高のナイトだ", marker: /[ＰP](?:スキル|ｽｷﾙ)の高い/, render: ({ hero, persona }) => `つまり${hero}はＰスキルの高い最高の${persona}という事になる` },
    { id: "conclusion_prediction", source: "最初から俺の勝率は１００％だった", marker: /最初から.*勝率は１００％/, render: ({ hero }) => `そもそも最初から${hero}の勝率は１００％だった` },
    { id: "conclusion_unrelated", source: "俺は関係ないから何を言われても関係ないからノーダメージだから", marker: /これは別に.*自身の事ではない/, render: ({ family }) => `言っておくけどこれは別に${family === "self" ? "俺" : "俺自身"}の事ではないので特に触れなくて良い` },
  ],
  opener: [
    { id: "opener_heard", source: "おいィ？お前らは今の言葉聞こえたか？", marker: /^おいィ？/, render: ({ audience }) => `おいィ？${audience}は今からする話が聞こえたか？` },
    { id: "opener_prophecy", source: "まぁわかってた（予知夢）", marker: /^まぁ(?:わかってた|こうなることはわかってた)/, render: () => `まぁこうなることはわかってた（予知夢）` },
    { id: "opener_nonfiction", source: "英語でいうとノンフィクション", marker: /^英語でいうとノンフィクション/, render: () => `英語でいうとノンフィクションの話なんだが` },
    { id: "opener_sudden", source: "恥知らずなカイ使いがいた！！", marker: /^何いきなり/, when: ({ hasChallenge, hasDialogue }) => hasChallenge || hasDialogue, render: ({ audience }) => `何いきなり話しかけて来てるわけ？と${audience}に言われた時の話` },
    { id: "opener_evidence", source: "どうやって○○って証拠だよ", marker: /^証拠から先に/, when: ({ hasNumbers }) => hasNumbers, render: () => `証拠から先に見せるが数字を見れば一瞬でわかる` },
    { id: "opener_dark_job", source: "闇系の仕事", marker: /^これは闇系の仕事/, when: ({ hasAchievement, hasDanger }) => hasAchievement || hasDanger, render: ({ object }) => `これは闇系の仕事と思われていた${object}を光属性に戻した話` },
  ],
};

class QuoteGrammar {
  constructor() {
    this.sourceTitles = new Set(quoteCorpus.headings
      .filter((item) => item.contexts?.length)
      .map((item) => item.text));
    this.active = Object.fromEntries(Object.entries(patterns).map(([category, entries]) => [
      category,
      entries.filter((entry) => this.sourceTitles.has(entry.source)),
    ]));
  }

  pick(category, context, random, avoided = new Set()) {
    const entries = (this.active[category] || []).filter((entry) => !entry.when || entry.when(context));
    const fresh = entries.filter((entry) => !avoided.has(entry.id));
    const pool = fresh.length ? fresh : entries;
    if (!pool.length) return { id: `${category}_fallback`, text: "" };
    const entry = pool[Math.floor(random() * pool.length) % pool.length];
    return { id: entry.id, text: entry.render(context), source: entry.source };
  }

  render(patternId, context) {
    const entry = Object.values(this.active).flat().find((item) => item.id === patternId);
    if (!entry || (entry.when && !entry.when(context))) return "";
    return entry.render(context);
  }

  signatures(text) {
    const found = [];
    const normalized = String(text ?? "").normalize("NFKC");
    for (const entries of Object.values(this.active)) {
      for (const entry of entries) {
        if (entry.marker.test(text) || entry.marker.test(normalized)) found.push(entry.id);
      }
    }
    return found;
  }

  roles(text) {
    const signatures = new Set(this.signatures(text));
    return Object.entries(this.active)
      .filter(([, entries]) => entries.some((entry) => signatures.has(entry.id)))
      .map(([category]) => category);
  }

  status() {
    return {
      sourceUrl: quoteCorpus.source.url,
      headings: quoteCorpus.counts.headings,
      excerpts: quoteCorpus.counts.excerpts,
      headingsWithContext: quoteCorpus.counts.headingsWithContext,
      contextLinks: quoteCorpus.counts.contextLinks,
      activePatterns: Object.values(this.active).reduce((sum, entries) => sum + entries.length, 0),
    };
  }
}

module.exports = { QuoteGrammar };
