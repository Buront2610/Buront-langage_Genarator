import type { Rule, Span } from '../contracts';
import { overlaps } from './source';
// All matches are taken from one immutable snapshot. Insertions are never scanned.
export function applyDictionary(text: string, rules: Rule[], protectedSpans: Span[] = [], maximum = 12000) {
  const input = [...text];
  const ordered = rules.map(rule => ({ ...rule, chars: [...rule.from] })).sort((a, b) => b.chars.length - a.chars.length || b.priority - a.priority || a.id.localeCompare(b.id, 'en'));
  const pieces: string[] = [], edits: { sourceSpan: Span; outputSpan: Span; ruleId: string }[] = [];
  let length = 0;
  for (let offset = 0; offset < input.length;) {
    const rule = ordered.find(rule => rule.chars.every((char, i) => input[offset + i] === char) && !protectedSpans.some(span => overlaps(span, { start: offset, end: offset + rule.chars.length })));
    const replacement = rule ? rule.to : input[offset];
    const size = [...replacement].length;
    if (length + size > maximum) throw new Error('CAPACITY_EXCEEDED');
    if (rule) edits.push({ sourceSpan: { start: offset, end: offset + rule.chars.length }, outputSpan: { start: length, end: length + size }, ruleId: rule.id });
    pieces.push(replacement); length += size; offset += rule?.chars.length ?? 1;
  }
  return { text: pieces.join(''), edits };
}
