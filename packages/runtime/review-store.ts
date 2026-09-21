import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from '../core/source';
import { reviewChoices, reviewDimensions, type ReviewPack, type ReviewAnswer, type PublicReview } from '../evaluation/review-types';

export class ReviewStore {
  constructor(private root: string) {}
  private pack(): ReviewPack | null {
    const filename = path.join(this.root, 'artifacts/vector-style-audit/review-pack.json');
    if (!fs.existsSync(filename)) return null;
    if (fs.statSync(filename).size > 2_000_000) throw new Error('INVALID_REVIEW_PACK');
    const pack = JSON.parse(fs.readFileSync(filename, 'utf8')) as ReviewPack;
    const { batchId, ...body } = pack;
    if (pack.schemaVersion !== 1 || !/^[a-f0-9]{64}$/u.test(batchId) || hash(body) !== batchId || !Array.isArray(pack.items) || !pack.items.length || pack.items.length > 100 || new Set(pack.items.map(item => item.id)).size !== pack.items.length || pack.items.some(item => !item || ['id', 'source', 'left', 'right'].some(key => typeof (item as any)[key] !== 'string' || (item as any)[key].length > 12000))) throw new Error('INVALID_REVIEW_PACK');
    return pack;
  }
  private filename(batchId: string) { return path.join(this.root, '.runtime/reviews', `${batchId}.json`); }
  private history(batchId: string): ReviewAnswer[] {
    const filename = this.filename(batchId);
    if (!fs.existsSync(filename)) return [];
    const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (saved.batchId !== batchId || !Array.isArray(saved.answers)) throw new Error('INVALID_REVIEW_HISTORY');
    return saved.answers;
  }
  private latest(batchId: string, annotator: string) {
    const latest = new Map<string, ReviewAnswer>();
    for (const answer of this.history(batchId)) if (answer.annotatorId === annotator) latest.set(answer.itemId, answer);
    return [...latest.values()];
  }
  read(annotator = 'local-reviewer'): PublicReview | null {
    this.validateAnnotator(annotator);
    const pack = this.pack(); if (!pack) return null;
    const answers = this.latest(pack.batchId, annotator);
    return { batchId: pack.batchId, title: pack.title, engineHash: pack.engineHash,
      items: pack.items.map(({ id, source, left, right }) => ({ id, source, left, right })), answers,
      humanApproval: answers.length === pack.items.length ? 'rated_not_automatically_approved' : 'pending' };
  }
  private validateAnnotator(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !value.trim() || value.length > 64 || /[\x00-\x1f]/u.test(value)) throw new Error('INVALID_REVIEW_ANSWER');
  }
  save(input: any) {
    const pack = this.pack(); if (!pack || input?.batchId !== pack.batchId) throw new Error('REVIEW_BATCH_CHANGED');
    this.validateAnnotator(input.annotatorId);
    if (Object.keys(input).some(key => !['batchId', 'itemId', 'annotatorId', 'ratings', 'reason'].includes(key)) || !pack.items.some(item => item.id === input.itemId) || typeof input.reason !== 'string' || input.reason.length > 2000 || !input.ratings || Object.keys(input.ratings).length !== 3 || reviewDimensions.some(dimension => !reviewChoices.includes(input.ratings[dimension]))) throw new Error('INVALID_REVIEW_ANSWER');
    const answers = this.history(pack.batchId);
    if (answers.length >= 2000) throw new Error('REVIEW_CAPACITY');
    const answer: ReviewAnswer = { itemId: input.itemId, annotatorId: input.annotatorId, ratings: { S: input.ratings.S, Q: input.ratings.Q, C: input.ratings.C }, reason: input.reason,
      revision: answers.length + 1, savedAt: new Date().toISOString(), origin: 'explicit_user' };
    const filename = this.filename(pack.batchId); fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, batchId: pack.batchId, answers: [...answers, answer] }, null, 2), { flag: 'wx' }); fs.renameSync(temporary, filename); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return { saved: true, answer, completed: this.latest(pack.batchId, input.annotatorId).length, total: pack.items.length };
  }
  export(annotator = 'local-reviewer') {
    const publicView = this.read(annotator), pack = this.pack();
    if (!publicView || !pack || publicView.answers.length !== pack.items.length) throw new Error('REVIEW_INCOMPLETE');
    return { schemaVersion: 1, pack, answers: publicView.answers, history: this.history(pack.batchId).filter(answer => answer.annotatorId === annotator), containsUserText: true, releaseApproved: false };
  }
}
