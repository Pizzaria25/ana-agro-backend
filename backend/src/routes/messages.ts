import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../server.js';

export const messageRoutes = Router();
messageRoutes.use(authenticate);

messageRoutes.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { connectionId, page = '1', limit = '50' } = req.query;
    if (!connectionId) return res.status(400).json({ error: 'connectionId é obrigatório' });

    const connection = await prisma.whatsAppConnection.findFirst({
      where: { id: connectionId as string, tenantId: req.tenantId },
    });
    if (!connection) return res.status(404).json({ error: 'Conexão não encontrada' });

    const skip = (Number(page) - 1) * Number(limit);
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { connectionId: connectionId as string },
        orderBy: { createdAt: 'desc' },
        skip, take: Number(limit),
      }),
      prisma.message.count({ where: { connectionId: connectionId as string } }),
    ]);
    res.json({ messages, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

messageRoutes.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [totalMonth, totalToday, aiGenerated, inbound, outbound] = await Promise.all([
      prisma.message.count({ where: { connection: { tenantId: req.tenantId }, createdAt: { gte: startOfMonth } } }),
      prisma.message.count({ where: { connection: { tenantId: req.tenantId }, createdAt: { gte: startOfDay } } }),
      prisma.message.count({ where: { connection: { tenantId: req.tenantId }, aiGenerated: true, createdAt: { gte: startOfMonth } } }),
      prisma.message.count({ where: { connection: { tenantId: req.tenantId }, direction: 'inbound', createdAt: { gte: startOfMonth } } }),
      prisma.message.count({ where: { connection: { tenantId: req.tenantId }, direction: 'outbound', createdAt: { gte: startOfMonth } } }),
    ]);
    res.json({ totalMonth, totalToday, aiGenerated, inbound, outbound });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});
