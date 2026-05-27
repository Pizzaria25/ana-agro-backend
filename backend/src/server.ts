import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { authRoutes } from './routes/auth.js';
import { tenantRoutes } from './routes/tenants.js';
import { connectionRoutes } from './routes/connections.js';
import { botRoutes } from './routes/bots.js';
import { messageRoutes } from './routes/messages.js';
import { planRoutes } from './routes/plans.js';
import { conversationRoutes } from './routes/conversations.js';
import { siteChatRoutes } from './routes/siteChat.js';
import { errorHandler } from './middleware/errorHandler.js';
import { whatsappManager } from './whatsapp/manager.js';

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Public
app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);

// Protected
app.use('/api/tenants', tenantRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api', siteChatRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
  // ✅ FIX: Reconecta sessões salvas ao iniciar
  await whatsappManager.reconnectSavedSessions();
});

export default app;
