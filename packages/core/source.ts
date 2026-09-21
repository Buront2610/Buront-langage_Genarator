import { createHash } from 'node:crypto';
import type { SourceDocument, Span, ProtectedValue } from '../contracts';
import { quantities } from './quantities';
export const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const slice = (text: string, span: Span) => [...text].slice(span.start, span.end).join('');
export const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;
export function sourceDocument(raw: string): SourceDocument {
  if (!raw.isWellFormed() || !raw.trim() || [...raw].length > 5000) throw new Error('INVALID_SOURCE');
  const scalarToUtf16 = [0];
  for (const char of raw) scalarToUtf16.push(scalarToUtf16.at(-1)! + char.length);
  const utf16ToScalar = new Map(scalarToUtf16.map((position, i) => [position, i]));
  const normalizationMap: Span[] = [];
  let normalized = '';
  // Normalize grapheme clusters together, including combining marks and halfwidth kana.
  for (const segment of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(raw)) {
    const value = segment.segment.normalize('NFKC');
    const span = { start: utf16ToScalar.get(segment.index)!, end: utf16ToScalar.get(segment.index + segment.segment.length)! };
    normalized += value;
    for (const _ of value) normalizationMap.push(span);
  }
  const protectedValues: ProtectedValue[] = [];
  const patterns: [string, RegExp][] = [
    ['url', /https?:\/\/[^\s「」『』<>。]+/gu], ['email', /[\w.+%-]+@[\w.-]+\.[A-Za-z]{2,}/gu],
    ['anchor', /(?:>>|＞＞)\s*[0-9０-９]+/gu],
    ['identifier', /(?<![0-9０-９A-Za-zＡ-Ｚａ-ｚ])[A-Za-zＡ-Ｚａ-ｚ][A-Za-zＡ-Ｚａ-ｚ0-9０-９_-]*/gu],
    ['unsupported_numeral', /[一二三四五六七八九十百千万億兆]+(?:円|個|人|件|台|回)/gu],
  ];
  for (const [kind, pattern] of patterns) for (const match of raw.matchAll(pattern)) {
    const span = { start: utf16ToScalar.get(match.index!)!, end: utf16ToScalar.get(match.index! + match[0].length)! };
    if (protectedValues.some(value => overlaps(value.span, span))) continue;
    const suffix = raw.slice(match.index! + match[0].length);
    const role = /^(から|より)/u.exec(suffix)?.[1] ?? (/^(を|に|が|は|で)/u.exec(suffix)?.[1] ?? 'unknown');
    protectedValues.push({ id: `pv-${span.start}`, kind, raw: match[0], span, role });
  }
  const existing = [...protectedValues];
  const parsedQuantities = quantities(raw, (start, end) => ({ start: utf16ToScalar.get(start)!, end: utf16ToScalar.get(end)! }));
  const excluded = new Set(parsedQuantities.filter(value => existing.some(other => overlaps(other.span, value.span))).map(value => value.id));
  protectedValues.push(...parsedQuantities.filter(value => !excluded.has(value.id) && (!value.parentId || !excluded.has(value.parentId))));
  const opaqueSpans: Span[] = [];
  for (const match of raw.matchAll(/「[^」]*」|『[^』]*』|"[^"\n]*"/gu)) opaqueSpans.push({ start: utf16ToScalar.get(match.index!)!, end: utf16ToScalar.get(match.index! + match[0].length)! });
  const document = { raw, inputHash: hash(raw), scalarToUtf16, normalized, normalizationMap, protectedValues: protectedValues.sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end), opaqueSpans };
  const freeze = (value: any): void => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(document); return document;
}
