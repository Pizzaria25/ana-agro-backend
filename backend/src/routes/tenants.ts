import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../server.js';

export const tenantRoutes = Router();
tenantRoutes.use(authenticate);

tenantRoutes.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      include: { _count: { select: { connections: true, users: true } } },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    res.json(tenant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dados da conta' });
  }
});

tenantRoutes.put('/me', async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId },
      data: { ...(name && { name }) },
    });
    res.json(tenant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar dados' });
  }
});

tenantRoutes.get('/usage', async (req: AuthRequest, res: Response) => {
  try {
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
    const [messages, connections, users, tenant] = await Promise.all([
      prisma.message.count({ where: { connection: { tenantId: req.tenantId }, createdAt: { gte: startOfMonth } } }),
      prisma.whatsAppConnection.count({ where: { tenantId: req.tenantId } }),
      prisma.user.count({ where: { tenantId: req.tenantId } }),
      prisma.tenant.findUnique({ where: { id: req.tenantId } }),
    ]);
    const plan = await prisma.plan.findUnique({ where: { name: tenant?.plan || 'free' } });
    res.json({ messagesUsed: messages, messagesLimit: plan?.maxMessages || 500, connectionsUsed: connections, connectionsLimit: plan?.maxConnections || 1, usersUsed: users, usersLimit: plan?.maxUsers || 1, plan: tenant?.plan || 'free' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar uso' });
  }
});

tenantRoutes.get('/users', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});
