import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../server.js';

export const conversationRoutes = Router();
conversationRoutes.use(authenticate);

conversationRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const { connectionId, intent, humanMode } = req.query;
  const where: any = { connection: { tenantId: req.tenantId } };
  if (connectionId) where.connectionId = connectionId as string;
  if (intent) where.intent = intent as string;
  if (humanMode === 'true') where.humanMode = true;
  const conversations = await prisma.conversation.findMany({
    where,
    include: { connection: { select: { id: true, name: true, phoneNumber: true } }, _count: { select: { messages: true } } },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
  });
  res.json(conversations.map(c => ({ ...c, tags: safeJson(c.tags), dayMemory: safeJson(c.dayMemory) })));
});

conversationRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, connection: { tenantId: req.tenantId } },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 }, connection: { select: { id: true, name: true } } },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
  res.json({ ...conversation, tags: safeJson(conversation.tags), dayMemory: safeJson(conversation.dayMemory) });
});

conversationRoutes.put('/:id', async (req: AuthRequest, res: Response) => {
  const conversation = await prisma.conversation.findFirst({ where: { id: req.params.id, connection: { tenantId: req.tenantId } } });
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
  const { humanMode, internalNotes, intent, priority, tags } = req.body;
  const updated = await prisma.conversation.update({
    where: { id: req.params.id },
    data: {
      ...(typeof humanMode === 'boolean' ? { humanMode, humanRequestedAt: humanMode ? new Date() : null } : {}),
      ...(typeof internalNotes === 'string' ? { internalNotes } : {}),
      ...(typeof intent === 'string' ? { intent } : {}),
      ...(typeof priority === 'string' ? { priority } : {}),
      ...(Array.isArray(tags) ? { tags: JSON.stringify(tags) } : {}),
    },
  });
  res.json({ ...updated, tags: safeJson(updated.tags), dayMemory: safeJson(updated.dayMemory) });
});

function safeJson(value: string) {
  try { return JSON.parse(value || '[]'); } catch { return []; }
}
