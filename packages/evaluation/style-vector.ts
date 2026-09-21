import { hash } from '../core/source';

export const vectorVersion = 'corpus-character-tfidf-audit-v1';
export type VectorView = 'raw' | 'script_masked' | 'phrase_masked';
// Ablations, not a complete Japanese morphological analysis. In particular,
// hiragana content words survive script masking and must not be called neutral.
const phrases = /確定的に明らか|それほどでもない|黄金の鉄の塊|おい[ィイ]+[?？]?|あもりにも|深い悲しみ|唯一ぬに|稀によく|勝つる|すぐるでしょう|べきそうすべき/gu;
export function vectorText(raw: string, view: VectorView) {
  let text = raw.normalize('NFKC').replace(/https?:\/\/\S+|>>\d+/gu, '□').replace(/\s+/gu, ' ').trim();
  if (view === 'phrase_masked') text = text.replace(phrases, '□');
  if (view !== 'raw') text = text.replace(/[\p{Script=Han}\p{Script=Katakana}ーA-Za-z0-9]+/gu, '□');
  return text;
}
function terms(text: string) {
  const chars = [...text], result = new Map<string, number>();
  for (const size of [2, 3, 4]) for (let i = 0; i + size <= chars.length; i++) {
    const term = chars.slice(i, i + size).join('');
    if (/^[□\s。、!?]+$/u.test(term)) continue;
    result.set(term, (result.get(term) ?? 0) + 1);
  }
  return result;
}
export function normalize(vector: Map<string, number>) {
  const norm = Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0));
  return new Map([...vector].map(([key, value]) => [key, norm ? value / norm : 0]));
}
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size > b.size) return cosine(b, a);
  return [...a].reduce((sum, [term, value]) => sum + value * (b.get(term) ?? 0), 0);
}
export type Reference = { id: string; text: string; thread: string; postId: string };
export class StyleVectorAudit {
  readonly vocabulary: Map<string, number>;
  readonly centroid: Map<string, number>;
  readonly vectors: Map<string, number>[];
  readonly modelId: string;
  constructor(readonly references: Reference[], readonly view: VectorView) {
    if (references.length < 2) throw new Error('REFERENCE_SAMPLE_TOO_SMALL');
    const rows = references.map(row => terms(vectorText(row.text, view))), df = new Map<string, number>();
    for (const row of rows) for (const term of row.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    this.vocabulary = new Map([...df].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6000).map(([term, n]) => [term, 1 + Math.log((rows.length + 1) / (n + 1))]));
    this.vectors = references.map(row => this.vector(row.text).values);
    const sums = new Map<string, number>();
    for (const vector of this.vectors) for (const [term, value] of vector) sums.set(term, (sums.get(term) ?? 0) + value);
    this.centroid = normalize(sums);
    this.modelId = hash({ vectorVersion, view, references, vocabulary: [...this.vocabulary] });
  }
  vector(raw: string) {
    const counts = terms(vectorText(raw, this.view)), weighted = new Map<string, number>();
    for (const [term, count] of counts) if (this.vocabulary.has(term)) weighted.set(term, (1 + Math.log(count)) * this.vocabulary.get(term)!);
    return { values: normalize(weighted), coverage: counts.size ? weighted.size / counts.size : 0 };
  }
  measure(text: string) {
    const vector = this.vector(text);
    const neighbors = this.vectors.map((reference, i) => ({ id: this.references[i].id, cosine: cosine(vector.values, reference) })).sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id)).slice(0, 3);
    return { cosine: vector.values.size ? cosine(vector.values, this.centroid) : null, coverage: vector.coverage, neighbors, modelId: this.modelId };
  }
}
export const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export function auc(positive: number[], negative: number[]) {
  return positive.length && negative.length ? mean(positive.flatMap(a => negative.map(b => a > b ? 1 : a === b ? .5 : 0))) : null;
}
