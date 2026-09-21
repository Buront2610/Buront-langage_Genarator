import type { FastifyInstance } from 'fastify';
import { ReviewStore } from './review-store';
export function reviewRoutes(app: FastifyInstance, root: string) {
  const store = new ReviewStore(root);
  app.get('/api/v1/review', async (request, reply) => {
    try { return store.read((request.query as any)?.annotator ?? 'local-reviewer') ?? reply.code(404).send({ error: 'REVIEW_NOT_PREPARED' }); }
    catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
  app.post('/api/v1/review/ratings', async (request, reply) => {
    try { return store.save(request.body); }
    catch (error) { const message = (error as Error).message; return reply.code(message === 'REVIEW_BATCH_CHANGED' ? 409 : 400).send({ error: message }); }
  });
  app.get('/api/v1/review/export', async (request, reply) => {
    try { return store.export((request.query as any)?.annotator ?? 'local-reviewer'); }
    catch (error) { return reply.code(409).send({ error: (error as Error).message }); }
  });
}
