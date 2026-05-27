import QRCode from 'qrcode';
import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../server.js';
import { z } from 'zod';
import { whatsappManager } from '../whatsapp/manager.js';

export const connectionRoutes = Router();

connectionRoutes.use(authenticate);

const createSchema = z.object({
  name: z.string().min(2),
});

connectionRoutes.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const connections = await prisma.whatsAppConnection.findMany({
      where: {
        tenantId: req.tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    res.json(
      connections.map(({ sessionData, ...connection }) => ({
        ...connection,
        hasSession: !!sessionData,
      }))
    );
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erro ao buscar conexões',
    });
  }
});

connectionRoutes.post(
  '/',
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const data = createSchema.parse(req.body);

      const tenant = await prisma.tenant.findUnique({
        where: {
          id: req.tenantId,
        },
      });

      const plan = await prisma.plan.findUnique({
        where: {
          name: tenant?.plan || 'free',
        },
      });

      const count = await prisma.whatsAppConnection.count({
        where: {
          tenantId: req.tenantId,
        },
      });

      if (count >= (plan?.maxConnections || 1)) {
        return res.status(403).json({
          error: `Limite de ${plan?.maxConnections || 1} conexão(ões) atingido`,
        });
      }

      const connection = await prisma.whatsAppConnection.create({
        data: {
          name: data.name,
          status: 'disconnected',
          tenantId: req.tenantId!,
        },
      });

      res.status(201).json(connection);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: err.errors,
        });
      }

      console.error(err);

      res.status(500).json({
        error: 'Erro ao criar conexão',
      });
    }
  }
);

connectionRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const connection = await prisma.whatsAppConnection.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.tenantId,
      },
      include: {
        botConfigs: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    if (!connection) {
      return res.status(404).json({
        error: 'Conexão não encontrada',
      });
    }

    const { sessionData, ...safeConnection } = connection;

    res.json({
      ...safeConnection,
      hasSession: !!sessionData,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Erro ao buscar conexão',
    });
  }
});

// Iniciar conexão WhatsApp e gerar QR Code
connectionRoutes.post(
  '/:id/connect',
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const connection = await prisma.whatsAppConnection.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.tenantId,
        },
      });

      if (!connection) {
        return res.status(404).json({
          error: 'Conexão não encontrada',
        });
      }

      await whatsappManager.startConnection(connection.id, req.tenantId!);

      res.json({
        message: 'Iniciando conexão, aguarde o QR Code...',
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Erro ao iniciar conexão',
      });
    }
  }
);

// Buscar QR Code em imagem base64
connectionRoutes.get(
  '/:id/qr',
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const connection = await prisma.whatsAppConnection.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.tenantId,
        },
      });

      if (!connection) {
        return res.status(404).json({
          error: 'Conexão não encontrada',
        });
      }

      if (!connection.qrCode) {
        return res.status(404).json({
          error: 'QR Code ainda não disponível',
          status: connection.status,
        });
      }

      const qrImage = await QRCode.toDataURL(connection.qrCode);

      res.json({
        qrCode: connection.qrCode,
        qrImage,
        status: connection.status,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Erro ao gerar imagem do QR Code',
      });
    }
  }
);

// Desconectar
connectionRoutes.post(
  '/:id/disconnect',
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const connection = await prisma.whatsAppConnection.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.tenantId,
        },
      });

      if (!connection) {
        return res.status(404).json({
          error: 'Conexão não encontrada',
        });
      }

      await whatsappManager.stopConnection(connection.id);

      res.json({
        message: 'Desconectado com sucesso',
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Erro ao desconectar',
      });
    }
  }
);

connectionRoutes.delete(
  '/:id',
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const connection = await prisma.whatsAppConnection.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.tenantId,
        },
      });

      if (!connection) {
        return res.status(404).json({
          error: 'Conexão não encontrada',
        });
      }

      await whatsappManager.stopConnection(connection.id);

      await prisma.whatsAppConnection.delete({
        where: {
          id: req.params.id,
        },
      });

      res.json({
        message: 'Conexão removida',
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Erro ao remover conexão',
      });
    }
  }
);