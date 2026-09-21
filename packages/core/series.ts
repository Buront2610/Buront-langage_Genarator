import type { SurfacePlan, RhetoricProgram } from '../contracts';
import type { Evidence } from './assets';
import { hash } from './source';

export type SeriesProfile = { id: string; originalPosts: number; constructions: { id: string; marker: string; support: number; evidenceIds: string[]; condition: string }[]; discourse: { id: 'mapping_first' | 'criterion_first'; support: number; evidenceIds: string[]; operators: string[] }[] };
// Only the grammatical frame is generalized. These examples are not a source
// citation for the newly composed core or an assertion of human approval.
const constructions = [
  { id: 'be_question', marker: 'べ？', pattern: /べ[？?]/u },
  { id: 'explanation', marker: 'という', pattern: /という/u },
  { id: 'digression', marker: 'なんだが', pattern: /なんだが/u },
  { id: 'inference', marker: 'つまり', pattern: /つまり/u },
  { id: 'parenthetical', marker: '括弧による補足', pattern: /[（(][^）)\n]{1,12}[）)]/u },
  { id: 'question', marker: 'だろ', pattern: /だろ/u },
];
export function compileSeriesProfiles(evidence: Evidence[], series: string[]): SeriesProfile[] {
  return series.map(id => {
    const records = evidence.filter(item => item.sourceType === 'original_post' && (id === 'all' || item.series.includes(id)));
    const originalPosts = new Set(records.map(item => item.postId)).size;
    const profiles = constructions.flatMap(construction => {
      const matching = records.filter(item => construction.pattern.test(item.text));
      const uniquePosts = [...new Map(matching.map(item => [item.postId, item])).values()];
      return matching.length ? [{ id: construction.id, marker: construction.marker, support: uniquePosts.length,
        evidenceIds: [...matching].sort((a, b) => a.text.length - b.text.length || a.id.localeCompare(b.id)).slice(0, 2).map(item => item.id), condition: '新規の比喩節の表記・説明枠だけに適用。事実・引用・アンカーには適用しない。' }] : [];
    });
    const discourse = ([
      { id: 'mapping_first' as const, pattern: /(?:なら|と比べ|に比べ|より).+(?:だ|なる|ない|強)/u, operators: ['OP-01', 'OP-02', 'OP-06', 'OP-07'] },
      { id: 'criterion_first' as const, pattern: /.+(?:だ|ない|いる).+(?:なぜなら|何故なら)/u, operators: ['OP-02', 'OP-06'] },
    ]).flatMap(rule => {
      const matches = records.filter(item => rule.pattern.test(item.text));
      const unique = [...new Map(matches.map(item => [item.postId, item])).values()];
      return unique.length ? [{ id: rule.id, support: unique.length, operators: rule.operators, evidenceIds: unique.sort((a, b) => a.text.length - b.text.length || a.id.localeCompare(b.id)).slice(0, 2).map(item => item.id) }] : [];
    });
    return { id, originalPosts, constructions: profiles.sort((a, b) => b.support - a.support || a.id.localeCompare(b.id)), discourse };
  });
}
export function frameRhetoric(core: string, constructionId: string) {
  const body = core.replace(/。$/u, '');
  switch (constructionId) {
    case 'be_question': return `たとえるなら、${body}という話だべ？`;
    case 'explanation': return `たとえるなら、${body}という話。`;
    case 'digression': return `たとえるなら、${body}という話なんだが、説明の順番まで重くする必要はない。`;
    case 'inference': return `たとえるなら、つまり${core}`;
    case 'parenthetical': return `たとえるなら、${core}（比喩）`;
    case 'question': return `たとえるなら、${body}という話だろう。`;
    case 'plain': return `たとえるなら、${core}`;
    default: throw new Error('UNKNOWN_CONSTRUCTION');
  }
}
export function selectSurface(profile: SeriesProfile | undefined, coreText: string, intensity: number, variant: number): SurfacePlan {
  // Equal consideration among the selected constructions. Duplicate spellings
  // and raw occurrence counts are never sampling weights.
  const pool = profile?.constructions.slice(0, 3) ?? [];
  const selected = intensity === 1 || profile?.id === 'all' ? undefined : pool[variant % Math.max(1, pool.length)];
  return { seriesId: profile?.id ?? 'all', profileHash: hash(profile ?? null), constructionId: selected?.id ?? 'plain', evidenceIds: selected?.evidenceIds ?? [], coreText };
}
export function selectDiscourse(profile: SeriesProfile | undefined, program: RhetoricProgram, intensity: number, variant: number): Pick<RhetoricProgram, 'discourse' | 'discourseEvidenceIds'> {
  const eligible = intensity > 1 && profile?.id !== 'all' ? profile?.discourse.filter(rule => rule.operators.includes(program.operator)) ?? [] : [];
  const selected = eligible[variant % Math.max(1, eligible.length)];
  return { discourse: selected?.id ?? 'mapping_first', discourseEvidenceIds: selected?.evidenceIds ?? [] };
}
export function validateDiscourse(program: RhetoricProgram, profile: SeriesProfile | undefined) {
  if (program.discourse === 'mapping_first' && !program.discourseEvidenceIds.length) return true;
  return !!profile?.discourse.some(rule => rule.id === program.discourse && rule.operators.includes(program.operator) && hash(rule.evidenceIds) === hash(program.discourseEvidenceIds));
}
export function validateSurface(surface: SurfacePlan, text: string, profiles: SeriesProfile[], references: Map<string, string>) {
  const profile = profiles.find(item => item.id === surface.seriesId);
  if (!profile || surface.profileHash !== hash(profile)) return false;
  if (surface.constructionId === 'plain' && surface.evidenceIds.length) return false;
  const construction = profile.constructions.find(item => item.id === surface.constructionId);
  if (surface.constructionId !== 'plain' && (!construction || hash(surface.evidenceIds) !== hash(construction.evidenceIds) || surface.evidenceIds.some(id => !references.has(id)))) return false;
  try { return text === frameRhetoric(surface.coreText, surface.constructionId); } catch { return false; }
}
