"use strict";

const { pick } = require("./random-utils");

const QUOTE_TOKEN = /QZX(\d+)XZQ/g;

// These are surface alternatives, not scenario templates.  They are deliberately
// phrased as reusable verbs and discourse expressions so the same pass can be
// used for work reports, travel accounts, accidents, conversations, and stories.
const lexicalRules = [
  [/という事実/g, ["という現実", "という真相"]],
  [/ということ/g, ["という話", "という事"]],
  [/ことにした/g, ["と決めた", "方を選んだ"]],
  [/事にした/g, ["と決めた", "方を選んだ"]],
  [/キャンセルになった/g, ["潰れた", "中止になった"]],
  [/間に合いそうにない/g, ["時既に時間切れになりかけた", "間に合う気配が消えた"]],
  [/できそうになかった/g, ["できる見込みがなかった", "成功する気配が消えていた"]],
  [/まったくまとまらなかった/g, ["収拾がつかなかった", "結論がいくえ不明になった"]],
  [/出かけた/g, ["足を運んだ", "向かった"]],
  [/導入した/g, ["投入した", "現場へ入れた"]],
  [/確認していた/g, ["点検していた", "調べていた"]],
  [/作成している/g, ["作っている", "組み立てている"]],
  [/遅れていた/g, ["遅延していた", "遅れが出ていた"]],
  [/完了した/g, ["片付いた", "終了した"]],
  [/提出できた/g, ["提出まで終えた", "提出に成功した"]],
  [/保存できない/g, ["保存不能な", "保存に失敗する"]],
  [/短縮され/g, ["短くなり", "縮まり"]],
  [/特定できた/g, ["突き止めた", "見つけ出した"]],
  [/公開する/g, ["公開へ回す", "公開状態にする"]],
  [/追加する/g, ["加える", "増設する"]],
  [/自動作成する/g, ["自動で組み立てる", "自動生成する"]],
  [/CSVから/g, ["CSVを元に", "CSVを材料に"]],
  [/始まった/g, ["幕を開けた", "開始された"]],
  [/放課後に/g, ["授業が終わった後に", "学校が終わった夕方に"]],
  [/案が出ていた/g, ["案が並んでいた", "候補が挙がっていた"]],
  [/誰も譲らず/g, ["ぜいいんが一歩も引かず", "誰一人として退かず"]],
  [/時間だけが過ぎていった/g, ["時間だけを消費する有様だった", "結論なしで時間を失っていた"]],
  [/時間だけが過ぎた/g, ["時間だけを消費する有様だった", "結論なしで時間を失った"]],
  [/意見が衝突し/g, ["意見同士の衝突で", "主張がぶつかった結果"]],
  [/話が(?:まったく)?まとまらなかった/g, ["結論がいくえ不明になった", "収拾がつかなかった"]],
  [/表に整理した/g, ["一覧へまとめた", "表へ落とし込んだ"]],
  [/数字を確認して/g, ["数値を照合し", "数字を見比べ"]],
  [/実現できる部分/g, ["実行可能な部分", "現実に使える箇所"]],
  [/組み合わせた/g, ["合体させた", "一つにまとめた"]],
  [/担当を分けて/g, ["役割分担して", "担当を割り振って"]],
  [/準備を始めた/g, ["準備へ移った", "作業を開始した"]],
  [/楽しんだ/g, ["満喫していた", "堪能していた"]],
  [/その日も良く釣れ/g, ["その日も釣果は上々で", "その日も獲物が続き"]],
  [/その日もかなり釣れ/g, ["その日も釣果は上々で", "その日も獲物が続き"]],
  [/しばらくした頃/g, ["しばらく経ったところ", "少し時間が過ぎた時"]],
  [/楽しむ(?!格好|姿)/g, ["満喫する", "味わう"]],
  [/離れる/g, ["立ち去る", "後にする"]],
  [/振り返る/g, ["背後へ目を向ける", "後ろを確認する"]],
  [/振り返った/g, ["背後へ目を向けた", "後ろを確認した"]],
  [/上を見上げた/g, ["頭上へ目を向けた", "上方を確認した"]],
  [/上を見上げる/g, ["頭上へ目を向ける", "上方を確認する"]],
  [/見上げた/g, ["頭上へ目を向けた", "上を確認した"]],
  [/見上げる/g, ["頭上へ目を向ける", "上を確認する"]],
  [/聞こえてきた/g, ["耳に届いた", "飛んできた"]],
  [/声をかけられた/g, ["声が飛んできた", "呼び止められた"]],
  [/話をしていた/g, ["会話していた", "言葉を交わしていた"]],
  [/話していくうちに/g, ["言葉を交わすほど", "会話を続けるうち"]],
  [/言っていた/g, ["口にしていた", "示していた"]],
  [/そう言って/g, ["そう言い残して", "その言葉を置いて"]],
  [/そう尋ねると/g, ["そう問うと", "その問いを投げると"]],
  [/尋ねると/g, ["問うと", "質問を投げると"]],
  [/囁いている/g, ["声を浴びせてきた", "囁きを重ねてきた"]],
  [/気が付くと/g, ["我に返ると", "認識した時には"]],
  [/気付くと/g, ["我に返ると", "認識した時には"]],
  [/気が付いた/g, ["ようやく理解した", "そこで認識した"]],
  [/気付いた/g, ["ようやく理解した", "そこで認識した"]],
  [/目印を見失い/g, ["目印がいくえ不明になり", "目印を見切れなくなり"]],
  [/戻る道も分からなくなった/g, ["帰路まで見切れなくなった", "戻る方角まで不明になった"]],
  [/聞こえる/g, ["耳へ届く", "聞き取れる"]],
  [/基準に/g, ["手掛かりに", "判断材料に"]],
  [/進む方角/g, ["進路", "向かう方向"]],
  [/歩く/g, ["移動する", "足を進める"]],
  [/予定していた/g, ["目指していた", "当初決めていた"]],
  [/安全な道/g, ["危険の少ない経路", "安全を確保した道"]],
  [/通って下山した/g, ["選んで山を下りた", "使って下山を終えた"]],
  [/急に濃霧が出て/g, ["いきなり濃い霧が発生し", "突然霧が一帯を覆い"]],
  [/視界が悪くなった/g, ["周囲を見切れなくなった", "視界を奪われた"]],
  [/違和感を感じた/g, ["違和感を覚えた", "不自然さを見切った"]],
  [/釣りを楽しむ格好じゃない/g, ["釣り用の装備には見えない", "釣りをする姿ではない"]],
  [/かなり釣り用の装備には見えない/g, ["どう考えても釣り用の装備ではない", "釣りの装備からほど遠い"]],
  [/かなり釣りをする姿ではない/g, ["どう考えても釣りをする姿ではない", "釣り人の装備からほど遠い"]],
  [/恐怖に震え/g, ["恐怖で身体を固め", "リアルでビビり"]],
  [/吊り上げられそうな/g, ["吊られかけた", "吊り上げ寸前の"]],
  [/今にも/g, ["すでに", "時既に"]],
  [/前に来ると/g, ["前へ割り込むと", "正面へ出ると"]],
  [/自前の/g, ["自分の", "持参した"]],
  [/ある程度/g, ["ひとしきり", "十分に"]],
  [/振り払うと/g, ["退けると", "掃除すると"]],
  [/呪文によって/g, ["呪文を受けて", "術の力で"]],
  [/周りには光が走り/g, ["周囲を光が駆け", "辺りへ閃光が走り"]],
  [/聞いたことのある声/g, ["聞き覚えのある声", "記憶にある声"]],
  [/恐い/g, ["不気味だ", "嫌な感じだ"]],
  [/怖い/g, ["不気味だ", "嫌な感じだ"]],
  [/そう思いつつも/g, ["そう警戒しながらも", "そう考えた一方で"]],
  [/その場を離れる気にもならず/g, ["そこを捨てる判断もできず", "その場所を後にする気も起きず"]],
  [/入れ食い状態/g, ["当たりが止まらない状態", "獲物が連続する状況"]],
  [/寒気が走った/g, ["冷気が全身を抜けた", "身体が一気に冷えた"]],
  [/火が上がった/g, ["炎が噴き出した", "火の手が立った"]],
  [/別の料理を切っていると/g, ["別の食材へ刃を入れている間に", "別の調理へ手を出した時に"]],
  [/鍋から煙が出て/g, ["鍋が煙を噴き", "鍋から煙が立ち上り"]],
  [/濡れた布を持ってきて/g, ["水を含ませた布を手にして", "濡らした布を装備して"]],
  [/火元を止めた/g, ["火元を封じた", "燃焼を止めた"]],
  [/火が消え/g, ["炎が沈黙し", "火の手が消滅し"]],
  [/現れた/g, ["姿を見せた", "参戦した"]],
  [/取り出した/g, ["装備を構えた", "手元に出した"]],
  [/振り回した/g, ["縦横にさばいた", "豪快に操った"]],
  [/振り回し/g, ["縦横にさばき", "豪快に操り"]],
  [/引き裂いてゆく/g, ["切り捨てていく", "次々と両断する"]],
  [/引き裂いた/g, ["切り捨てた", "両断した"]],
  [/全滅した/g, ["一匹残らず消滅した", "跡形もなく片付いた"]],
  [/飛び乗り/g, ["乗り込み", "ｶｶッっと乗車し"]],
  [/笑ってみせ/g, ["余裕の笑みを浮かべ", "涼しい顔を見せ"]],
  [/到着した/g, ["辿り着いた", "到達した"]],
  [/確認した/g, ["確かめた", "見直した"]],
  [/作成した/g, ["組み上げた", "完成させた"]],
  [/作った/g, ["組み上げた", "用意した"]],
  [/修正した/g, ["直した", "手直しした"]],
  [/決まった/g, ["結論になった", "採用された"]],
  [/評価した/g, ["太鼓判を押した", "認めた"]],
  [/([^\s、]{1,24})を指差し/g, ["$1へ指を向け", "$1の方を示し"]],
  [/指差し/g, ["指を向け", "こちらを示し"]],
  [/帰り道で聞いた話によると/g, ["帰路で事情を聞くと", "帰る途中で種明かしを聞いたところ"]],
  [/あそこは自殺の名所で/g, ["その場所は自殺で知られており", "その橋は自殺者の多い場所で"]],
  [/首吊りが首吊りを呼ぶ/g, ["吊られた者が次の犠牲を招く", "首を吊った者が新たな犠牲を呼ぶ"]],
  [/俺はいろんな意味で思った/g, ["俺の中では色々な意味で確信に変わった", "俺は様々な意味で理解した"]],
  [/教えてくれた/g, ["事情を明かした", "説明を寄越した"]],
  [/連絡があった/g, ["知らせが飛んできた", "連絡を寄越した"]],
  [/見つけた/g, ["発見した", "見切った"]],
  [/泣き叫んでるっぽいの/g, ["騒いでいる様子", "悲鳴を上げている姿"]],
  [/良く/g, ["かなり", "上々に"]],
  [/よく/g, ["かなり", "高確率で"]],
  [/とても/g, ["かなり", "あもりにも"]],
  [/少し(?!ずつ)/g, ["わずかに", "若干"]],
  [/段々と/g, ["徐々に", "少しずつ"]],
  [/明らかに/g, ["確定的に", "どう考えても"]],
  [/どう見ても/g, ["どう考えても", "外見だけで判断しても"]],
  [/すごい/g, ["破壊力ばつ牛ﾝ", "格が違う"]],
  [/スゴイ/g, ["破壊力ばつ牛ﾝ", "格が違う"]],
  [/素晴らしい/g, ["見事な", "かなりの"]],
];

function clean(value) {
  return String(value ?? "")
    .trim()
    .replace(/[。！？!?]+$/g, "")
    .replace(/[ \t]+/g, " ");
}

function maskQuotes(value) {
  const quotes = [];
  const text = clean(value).replace(/「[^」]*」|『[^』]*』/g, (quote) => {
    const index = quotes.push(quote) - 1;
    return `QZX${index}XZQ`;
  });
  return { text, quotes };
}

function restoreQuotes(value, quotes) {
  return value.replace(QUOTE_TOKEN, (_, index) => quotes[Number(index)] || "");
}

function lexicalRewrite(value, random) {
  let result = value;
  for (const [pattern, alternatives] of lexicalRules) {
    result = result.replace(pattern, (match, ...args) => {
      const groups = args.slice(0, -2);
      return pick(random, alternatives).replace(/\$(\d+)/g, (_, index) => groups[Number(index) - 1] || "");
    });
  }
  return result;
}

function stripConnective(value) {
  return clean(value).replace(/^(?:ある日|その日も|すると|その結果|ところが|ただし|しかし|だが|そして|そこで|因みに)[、,]?/, "");
}

function completeFragment(value) {
  return String(value ?? "")
    .replace(/全身に寒気が$/, "冷気が全身を走り抜けた")
    .replace(/(?:男性|男|女性|女|人物|社員|担当者|先生|友人|[A-Za-z]さん)が$/, "$&立っていた")
    .replace(/には$/, "に存在した")
    .replace(/では$/, "で起きていた");
}

function rolePrefix(role, random) {
  const prefixes = {
    setting: ["そもそもの発端だが", "話を最初まで戻すと", "事の始まりは"],
    problem: ["だがここから空気が変わる", "ところが一般人なら顔面蒼白になる異変", "この時点で嫌な予感はしていたんだが"],
    reveal: ["ここでようやく真相を見切った", "そして隠れていた事実が表に出る", "この後に判明した現実がひどい"],
    action: ["そこで行動に出た", "ここで黙って見ていないのがﾅｲﾄ", "次の瞬間にはもう動いていた"],
    result: ["勝負がついた時には", "結果だけ言うと", "最終的には"],
    aftermath: ["因みに後から分かった話なんだが", "この一件には後日談もある", "事が済んでから聞いたんだが"],
    future: ["さらに次の予定として", "まだ話は先へ続き", "今後の手まで決まっていて"],
    evaluation: ["これを見た俺の評価だが", "この結果を常識的に考えると", "最後に感想を言うなら"],
    background: ["状況を補足すると", "その間にも", "なお現場では"],
  };
  return `${pick(random, prefixes[role] || prefixes.background)}　`;
}

function rewriteCause(value, role, random) {
  const match = value.match(/^(.+?)(?:ため|ので)[、,]?(.+)$/);
  if (!match) return null;
  const cause = stripConnective(match[1]);
  const outcome = stripConnective(match[2]);
  if (/[うくぐすつぬぶむる]$/.test(cause)) {
    return `${cause}必要があったので${outcome}という流れ`;
  }
  if (/の$/.test(cause)) return `${cause.slice(0, -1)}を目的に${outcome}`;
  const reportedCause = /(?:た|だ|ない|なかった)$/.test(cause) ? `${cause}らしい` : `${cause}だったらしい`;
  return pick(random, [
    `${rolePrefix(role, random)}${outcome}　原因をたどると${reportedCause}`,
    `${cause}のが原因で${outcome}という有様`,
  ]);
}

function rewriteContrast(value, role, random) {
  const match = value.match(/^(.{3,}?)(だった|していた|なかった|いる|ある)が[、,]?(.+)$/);
  if (match) return `${rolePrefix(role, random)}${match[3]}　にもかかわらずその前提は${match[1]}${match[2]}`;
  const pastContrast = value.match(/^(.+?た)が[、,]?(.+)$/);
  if (pastContrast) return `${rolePrefix(role, random)}${pastContrast[2]}　その前には${pastContrast[1]}`;
  return null;
}

function rewriteTopic(value, role, random, options = {}) {
  const rewritePart = options.aggressiveParticles ? rewriteAtom : (part) => part;
  const temporal = value.match(/^((?:翌朝|翌日|翌週|明日|明日の会議|来週|来月|次回|朝|昼|夕方|夜|数分後|最後))(?:は|には|では|から)(.+)$/);
  if (temporal) return `${rolePrefix(role, random)}${temporal[1]}を迎えたら${rewritePart(temporal[2])}`;
  const dewa = value.match(/^(.{1,50}?)では(.+)$/);
  if (dewa) return `${rolePrefix(role, random)}${dewa[1]}の様子は${dewa[2]}`;
  const location = value.match(/^(.{2,50}?)(?:では|には)(.+)$/);
  if (location) {
    if (/(?:すると|向けると|確認すると)そこ$/.test(location[1])) {
      return `${location[1]}　そこには${location[2]}`;
    }
    return pick(random, [
      `${location[1]}の内情を言うと${location[2]}という有様`,
      `${rolePrefix(role, random)}舞台は${location[1]}　そこには${location[2]}`,
    ]);
  }
  const topic = value.match(/^(.{1,64}?)は(.+)$/);
  if (topic && !/^(?:何|気|声|そこ|これ|それ)$/.test(topic[1])) {
    if (/^(?:俺|私|僕|自分)$/.test(topic[1])) {
      if (role === "action") return `${rolePrefix(role, random)}${rewritePart(`俺が${topic[2]}`)}`;
      if (role === "setting") {
        const rewritten = rewritePart(topic[2]);
        return rewritten === topic[2]
          ? `${rewritten}のが俺だった`
          : `${rewritten}　この場面を見たのが俺だった`;
      }
      if (role === "evaluation") return `${rolePrefix(role, random)}俺の結論は${topic[2]}`;
      return pick(random, [
        `${rolePrefix(role, random)}俺の側では${rewritePart(topic[2])}`,
        `俺に起きた変化は${rewritePart(topic[2])}`,
      ]);
    }
    if (/(?:俺|私|僕|自分)$/.test(topic[1])) {
      const temporalSubject = topic[1].match(/^(ある日[、,]?)(.+?)(俺|私|僕|自分)$/);
      if (temporalSubject) {
        if (/(?:方を選んだ|と決めた)$/.test(topic[2])) {
          return `${temporalSubject[1]}${temporalSubject[2]}${temporalSubject[3]}は${topic[2]}`;
        }
        return `${temporalSubject[1]}${temporalSubject[2]}${temporalSubject[3]}が取った行動は${topic[2]}`;
      }
      return `${rolePrefix(role, random)}${topic[1]}の側では${rewritePart(topic[2])}`;
    }
    if (role === "aftermath") return `${rolePrefix(role, random)}${topic[1]}の正体は${topic[2]}`;
    if (role === "action") return `${rolePrefix(role, random)}${rewritePart(`${topic[1]}が${topic[2]}`)}`;
    if (role === "result") return `${rolePrefix(role, random)}${topic[1]}に起きた結果は${topic[2]}`;
    if (role === "evaluation") return `${rolePrefix(role, random)}${topic[1]}への評価は${topic[2]}`;
    if (role === "problem") return `${rolePrefix(role, random)}${topic[1]}には${topic[2]}という事情があった`;
    if (role === "background" && /^(?:原因|理由|正体)$/.test(topic[1])) {
      return `${rolePrefix(role, random)}${topic[1]}を調べると${topic[2]}`;
    }
    return pick(random, [
      `${rolePrefix(role, random)}${topic[1]}は${rewritePart(topic[2])}`,
      `${rolePrefix(role, random)}${topic[1]}の話では${rewritePart(topic[2])}`,
    ]);
  }
  return null;
}

function completePredicate(value) {
  return String(value ?? "")
    .replace(/作り$/, "作った")
    .replace(/確認し$/, "確認した")
    .replace(/修正し$/, "修正した")
    .replace(/導入し$/, "導入した")
    .replace(/用意し$/, "用意した")
    .replace(/行い$/, "行った")
    .replace(/分類し$/, "分類した")
    .replace(/短縮され$/, "短くなった")
    .replace(/縮まり$/, "縮まった")
    .replace(/増え$/, "増えた")
    .replace(/減り$/, "減った")
    .replace(/切れ$/, "切れた")
    .replace(/終わり$/, "終わった");
}

function rewriteAtom(value) {
  const atom = stripConnective(value);
  const conditional = atom.match(/^(.{2,80}?)(すると|したら|ると)(.{2,100})$/);
  if (conditional) {
    const condition = conditional[2] === "ると"
      ? `${conditional[1]}ること`
      : conditional[2] === "すると"
        ? `${conditional[1]}すること`
        : `${conditional[1]}したこと`;
    return `${conditional[3]}　その引き金になったのは${condition}`;
  }
  const dewa = atom.match(/^(.{1,60}?)では(.{2,120})$/);
  if (dewa) return `${rewriteAtom(dewa[2])}　その場は${dewa[1]}`;
  const objectAction = atom.match(/^(.{2,120})を(.{2,80})$/);
  if (objectAction) {
    if (/(?:し[一-龠々ァ-ヶ]|して|て[一-龠々ァ-ヶ]|で[一-龠々ァ-ヶ]|ず[一-龠々ァ-ヶ]|ながら|つつ).{0,32}$/.test(objectAction[1])) {
      return atom;
    }
    const predicate = completePredicate(objectAction[2].replace(/と$/, ""));
    const actorObject = objectAction[1].match(/^(.+?)(?:は|が)(.+)$/);
    const hasReliableActor = actorObject
      && (actorObject[1].length >= 2 || /^(?:俺|私|僕|姉|兄|父|母)$/.test(actorObject[1]))
      && !/(?:なんだ|っぽい|で|に|へ|から|まで)$/.test(actorObject[1]);
    if (hasReliableActor) return `${predicate}のが${actorObject[1]}で、対象は${actorObject[2]}`;
    if (/予定だ$/.test(predicate)) return `${predicate.replace(/だ$/, "になった")}のは${objectAction[1]}`;
    return `${predicate}のは${objectAction[1]}`;
  }
  const topic = atom.match(/^(.{1,60}?)は(.{2,120})$/);
  if (topic) return `${completePredicate(topic[2])}　この変化が出たのは${topic[1]}`;
  const subject = atom.match(/^([^、,]{2,60}?)が([^、,]{2,80})$/);
  if (subject
    && !/[てでしずぬ]$/.test(subject[1])
    && !/(?:ながら|ため|ので|ところ|結果)$/.test(subject[1])
    && !/が/.test(subject[2])) {
    return `${completePredicate(subject[2])}のは${subject[1]}`;
  }
  return atom;
}

function rewriteClauses(value, role, random, options = {}) {
  const parts = value.split(/[、,]/)
    .map((part) => completeFragment(stripConnective(part)))
    .map((part) => options.aggressiveParticles ? rewriteAtom(part) : part)
    .filter(Boolean);
  if (parts.length < 2) return null;
  if (role === "setting" && /で$/.test(parts[0])) {
    return `舞台は${parts[0].replace(/で$/, "")}　${parts.slice(1).join("しかも")}という場所`;
  }
  if (role === "problem" && /(?:冷気|寒気|身体が.*冷)/.test(parts.at(-1))) {
    return `${parts.slice(0, -1).join("さらに")}　だがそこで${parts.at(-1)}`;
  }
  if (role === "reveal") {
    return `${rolePrefix(role, random)}${parts.at(-1)}　そこまでの違和感を並べると${parts.slice(0, -1).reverse().join("しかも")}`;
  }
  if (role === "problem") {
    return `${rolePrefix(role, random)}${parts.at(-1)}という有様　しかも${parts.slice(0, -1).join("さらに")}`;
  }
  if (role === "result") {
    return `${rolePrefix(role, random)}${parts.at(-1)}　そこへ至るまでに${parts.slice(0, -1).join("さらに")}`;
  }
  if (role === "action") {
    return `${rolePrefix(role, random)}${parts[0]}　そのまま${parts.slice(1).join("さらに")}`;
  }
  if (role === "background") return `${rolePrefix(role, random)}${parts.join("　しかも")}`;
  if (role === "evaluation") return `${rolePrefix(role, random)}${parts.slice(0, -1).join("しかも")}　この評価が${parts.at(-1)}`;
  return `${rolePrefix(role, random)}${parts.slice(1).join("しかも")}　話の前提は${parts[0]}`;
}

function rewriteNarration(value, role, random, options = {}) {
  const original = clean(value);
  if (!original) return "";
  const lexed = completeFragment(lexicalRewrite(original, random));
  const presentation = lexed.match(/^そこには[、,]?(.+?)が$/);
  if (presentation) return `${rolePrefix(role, random)}そこにあったのは${presentation[1]}`;
  const protectiveAction = lexed.match(/^(.+?)によって(.+?)(?:の前へ割り込むと|の正面へ出ると)[、,](.+)$/);
  if (protectiveAction) {
    return `${rolePrefix(role, random)}${protectiveAction[2]}を${protectiveAction[1]}から守る位置へ割り込み${protectiveAction[3]}`;
  }
  return rewriteCause(lexed, role, random)
    || rewriteContrast(lexed, role, random)
    || rewriteClauses(lexed, role, random, options)
    || rewriteTopic(lexed, role, random, options)
    || (options.aggressiveParticles && rewriteAtom(lexed) !== lexed
      ? `${rolePrefix(role, random)}${rewriteAtom(lexed)}`
      : null)
    || `${rolePrefix(role, random)}${stripConnective(lexed)}`;
}

function rewriteDialogue(masked, quotes, role, random, options = {}) {
  const rewrite = (text) => rewriteNarration(text, role, random, options);
  const narration = clean(masked.replace(QUOTE_TOKEN, " ").replace(/[ \t]+/g, " "));
  if (!narration) {
    if (quotes.length === 1) return `現場に響いた台詞は${quotes[0]}`;
    return `${quotes.map((quote, index) => `${index ? "返答は" : "最初の声が"}${quote}`).join("　")}という応酬`;
  }

  const lexed = lexicalRewrite(masked, random);
  const quoteContrast = lexed.match(/^(.*?)(?:QZX0XZQ)(.*?)(?:ではなく|じゃなく)(.*?)(?:QZX1XZQ)(.*)$/);
  if (quoteContrast && quotes.length >= 2) {
    const frame = `${quoteContrast[1]}${quoteContrast[2]}${quoteContrast[3]}${quoteContrast[4]}`
      .replace(/(?:が|は)?(?:口にしていた|示していた)のは/g, "")
      .replace(/(?:ではなく|じゃなく)?だったのだ/g, "")
      .replace(/なくだった/g, "")
      .trim();
    const lead = frame && !/^(?:男|男性|女|女性|人物)$/.test(frame)
      ? `${rewrite(frame)}　`
      : rolePrefix(role, random);
    return `${lead}男の言葉を訳すと意味は${quotes[0]}ではなく${quotes[1]}`;
  }
  if (/声が飛んできた|呼び止められた|声をかけ/.test(lexed)) {
    const remainder = lexed
      .replace(/QZX\d+XZQ/g, "")
      .replace(/(?:後ろ|背後)から(?:声が飛んできた|呼び止められた|声をかけられた)/g, "")
      .replace(/^[、,]+/, "");
    return `背後から飛んできた声が${quotes[0]}　${rewrite(remainder)}`.trim();
  }
  if (/問うと|質問を投げると|問いを投げると|尋ねると/.test(lexed)) {
    const response = quotes.slice(1).join("　");
    const remainder = lexed
      .replace(/QZX\d+XZQ/g, "")
      .replace(/(?:そう)?(?:問うと|質問を投げると|問いを投げると|尋ねると)/, "")
      .trim();
    if (response) {
      const actorAction = remainder.match(/^(.+?)(?:は|が)(.+)$/);
      const bridge = actorAction
        ? `${actorAction[1]}が${actorAction[2]
          .replace(/向け$/, "向けて")
          .replace(/示し$/, "示して")}から返したのが`
        : `${rewrite(remainder)}　返ってきた言葉が`;
      return `俺が投げた問いは${quotes[0]}　${bridge}${response}`;
    }
    return `俺が投げた問いは${quotes[0]}　${rewrite(remainder)}`;
  }
  if (/叫ぶ|叫んだ/.test(lexed)) {
    const remainder = lexed.replace(/QZX0XZQ(?:と)?叫(?:ぶ|んだ)[、,]?/, "").trim();
    return `${quotes[0]}の一声が合図になり${rewrite(remainder)}`;
  }
  if (quotes.length >= 2) {
    const bridge = rewrite(lexed.replace(/QZX\d+XZQ(?:と)?/g, ""));
    return `${quotes[0]}に${quotes.slice(1).join("　")}で応じる会話　${bridge}`.trim();
  }
  if (/^QZX0XZQ/.test(lexed)) {
    const remainder = lexed.replace(/^QZX0XZQ/, "").trim();
    if (/聞き覚えのある声|記憶にある声/.test(remainder)) {
      const identity = remainder.split(/[、,]/).slice(1).join("、").trim();
      return `${quotes[0]}と割り込んだのは聞き覚えのある声　声の主は${identity || "すでに現場へ来ていた"}`;
    }
    if (/上から(?:耳に届いた|飛んできた)/.test(remainder)) {
      const detail = remainder.replace(/(?:男性の声・・・いやおかしい[、,]?)?(?:どう考えても|確定的に)?上から(?:耳に届いた|飛んできた)/, "");
      return `${quotes[0]}という男の声　おかしいと思った時には声は頭上から届いていた${detail ? `　${rewrite(detail)}` : ""}`;
    }
    if (/^(?:俺|私|僕|自分)(?:は|が)/.test(remainder)) {
      return `${quotes[0]}という言葉を受けたが${rewrite(remainder)}`;
    }
    return `${quotes[0]}という発言が先に来た　${rewrite(remainder)}`;
  }
  const surrounded = lexed
    .replace(/QZX0XZQ(?:と)?/, "")
    .match(/^(?:我に返ると|認識した時には)(.+?)の目の前には(.+?)が(.+)$/);
  if (surrounded) {
    return `我に返った${surrounded[1]}の正面を${surrounded[2]}が埋めていた　そいつらが浴びせる声は${quotes[0]}`;
  }
  const bridge = rewrite(lexed.replace(/QZX\d+XZQ(?:と)?/g, ""));
  return `${bridge}　そこで重なった声が${quotes[0]}`;
}

function paraphraseFact(value, role = "background", random = Math.random, options = {}) {
  const { text, quotes } = maskQuotes(value);
  const rendered = quotes.length
    ? rewriteDialogue(text, quotes, role, random, options)
    : rewriteNarration(text, role, random, options);
  return clean(rendered)
    .replace(/QZX\d+XZQ/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/　{2,}/g, "　")
    .replace(/、{2,}/g, "、")
    .replace(/次々と([^\n]{0,24})次々と/g, "次々と$1")
    .replace(/(?:そう言い残して|その言葉を置いて)(.+?)([A-Za-z一-龠々ァ-ヶー]+さん)を見て$/, "$1$2を俺は目で追った")
    .replace(/(?:帰路で事情を聞くと|帰る途中で種明かしを聞いたところ)(?=その)/, "$&　")
    .trim();
}

module.exports = {
  lexicalRewrite,
  paraphraseFact,
  rewriteNarration,
};
