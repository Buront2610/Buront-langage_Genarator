// These are finite, reversible register changes. They do not delete negation,
// change tense, conjugate an unknown verb or invent a participant.
const pairs: [string, string][] = [
  ['していませんでした', 'していなかった'], ['しませんでした', 'しなかった'], ['していません', 'していない'],
  ['していました', 'していた'], ['しています', 'している'], ['しました', 'した'], ['しません', 'しない'], ['します', 'する'],
  ['ではありませんでした', 'ではなかった'], ['ではありません', 'ではない'], ['でした', 'だった'],
];
export function realizeRegister(text: string) {
  // An original snapshot and longest match prevent replacement chains.
  const protectedText = 'https?:\\/\\/[^\\s「」『』<>。]+|[\\w.+%-]+@[\\w.-]+\\.[A-Za-z]{2,}|「[^」]*」|『[^』]*』';
  const pattern = new RegExp(protectedText + '|' + pairs.map(([from]) => from).join('|'), 'gu');
  return text.replace(pattern, from => pairs.find(pair => pair[0] === from)?.[1] ?? from);
}
export function equivalentRegister(source: string, output: string) {
  // Accept only the original or exactly the finite register transform. A model or
  // dictionary cannot submit an additional free-form factual paraphrase here.
  return output === source || output === realizeRegister(source);
}
