import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'whatsapp-saas-dev-secret';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
  userRole?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; tenantId: string; role: string };
    req.userId = decoded.userId;
    req.tenantId = decoded.tenantId;
    req.userRole = decoded.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function generateToken(userId: string, tenantId: string, role: string): string {
  return jwt.sign({ userId, tenantId, role }, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}
