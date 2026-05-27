import { Router, Request, Response } from 'express';
import { prisma } from '../server.js';

export const planRoutes = Router();

planRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const plans = await prisma.plan.findMany({ orderBy: { price: 'asc' } });
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar planos' });
  }
});
