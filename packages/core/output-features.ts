// Text-only baseline, not parser-derived syntax and not a trained quality model.
// Every method uses the same dense shape, including zero-valued coordinates.
export const featureVersion = 'output-text-dense-v2';
export function outputFeatures(raw: string): Record<string, number> {
  const text = raw.normalize('NFKC'), chars = [...text], length = Math.max(1, chars.length);
  const sentences = text.split(/[。！？!?]/u).filter(part => part.trim());
  const clauses = text.split(/[、,。！？!?]/u).filter(part => part.trim());
  const values: Record<string, number> = {
    length: chars.length / 240, sentences: sentences.length / 10, clauses: clauses.length / 10,
    longestClause: Math.max(0, ...clauses.map(part => [...part].length)) / 120,
    meanSentence: chars.length / Math.max(1, sentences.length) / 120,
    repetition: /(.{3,12})\1/u.test(text) ? 1 : 0,
    kanaRatio: (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length / length,
    kanjiRatio: (text.match(/\p{Script=Han}/gu) ?? []).length / length,
    punctuationRatio: (text.match(/[、。！？!?（）「」]/gu) ?? []).length / length,
    comparison: (text.match(/より|と比べ|見立て|と同じ/gu) ?? []).length / 10,
    conditional: (text.match(/なら|れば|たら/gu) ?? []).length / 10,
    explanation: (text.match(/だから|つまり|という|なぜなら/gu) ?? []).length / 10,
  };
  for (let i = 0; i < 32; i++) values[`shape:${i}`] = 0;
  const abstract = [...text.replace(/[\p{Script=Han}\p{Script=Katakana}ー]+/gu, '語').replace(/[0-9]+/gu, '数')];
  for (let i = 0; i + 1 < abstract.length; i++) {
    const bucket = ((abstract[i].codePointAt(0)! * 31 + abstract[i + 1].codePointAt(0)!) >>> 0) % 32;
    values[`shape:${bucket}`] += 1 / Math.max(1, abstract.length - 1);
  }
  return values;
}
