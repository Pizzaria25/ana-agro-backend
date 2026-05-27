import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../server.js';
import { z } from 'zod';

export const botRoutes = Router();
botRoutes.use(authenticate);

const botSchema = z.object({
  name: z.string().min(2),
  active: z.boolean().optional(),
  prompt: z.string().optional(),
  model: z.enum(['gpt-3.5-turbo', 'gpt-4', 'gpt-4o', 'gpt-4o-mini']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(50).max(4000).optional(),
  autoReply: z.boolean().optional(),
  workingHoursStart: z.string().optional(),
  workingHoursEnd: z.string().optional(),
  ignoreKeywords: z.string().optional(),
  greetingMessage: z.string().optional(),
  connectionId: z.string().optional(),
});

botRoutes.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const bots = await prisma.botConfig.findMany({
      where: { tenantId: req.tenantId },
      include: { connection: { select: { id: true, name: true, phoneNumber: true, status: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(bots);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erro ao buscar bots' });
  }
});

botRoutes.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = botSchema.parse(req.body);
    const bot = await prisma.botConfig.create({
      data: { ...data, tenantId: req.tenantId! },
    });
    res.status(201).json(bot);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    console.error(err); res.status(500).json({ error: 'Erro ao criar bot' });
  }
});

botRoutes.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = botSchema.partial().parse(req.body);
    const bot = await prisma.botConfig.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });
    const updated = await prisma.botConfig.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    console.error(err); res.status(500).json({ error: 'Erro ao atualizar bot' });
  }
});

botRoutes.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const bot = await prisma.botConfig.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });
    await prisma.botConfig.delete({ where: { id: req.params.id } });
    res.json({ message: 'Bot removido' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erro ao remover bot' });
  }
});
