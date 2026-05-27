import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../server.js';
import { generateToken } from '../middleware/auth.js';

export const authRoutes = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  tenantName: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoutes.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: data.tenantName,
          slug: data.tenantName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
          plan: 'free',
        },
      });
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: await bcrypt.hash(data.password, 10),
          role: 'admin',
          tenantId: tenant.id,
        },
      });
      return { tenant, user };
    });

    const token = generateToken(result.user.id, result.tenant.id, result.user.role);
    res.status(201).json({
      token,
      user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role },
      tenant: { id: result.tenant.id, name: result.tenant.name, plan: result.tenant.plan },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

authRoutes.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email }, include: { tenant: true } });
    if (!user || !user.active) return res.status(401).json({ error: 'Credenciais inválidas' });
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (!user.tenant.active) return res.status(403).json({ error: 'Conta desativada' });

    const token = generateToken(user.id, user.tenantId, user.role);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});
