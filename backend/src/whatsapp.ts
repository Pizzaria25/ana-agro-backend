import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from './server.js';
import OpenAI from 'openai';
import { EventEmitter } from 'events';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Global event emitter para QR codes
export const waEvents = new EventEmitter();

// Map de sockets ativos: connectionId -> socket
const activeSockets = new Map<string, any>();

function getSessionPath(connectionId: string) {
  const dir = path.join(process.cwd(), 'sessions', connectionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function startWhatsAppConnection(connectionId: string) {
  // Evita duplicatas
  if (activeSockets.has(connectionId)) {
    console.log(`[WA] Conexão ${connectionId} já está ativa`);
    return;
  }

  const sessionPath = getSessionPath(connectionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  await prisma.whatsAppConnection.update({
    where: { id: connectionId },
    data: { status: 'connecting', qrCode: null },
  });

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, console as any),
    },
    printQRInTerminal: true,
    browser: ['WhatsApp SaaS', 'Chrome', '1.0.0'],
  });

  activeSockets.set(connectionId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Salva QR no banco e emite evento para SSE
      await prisma.whatsAppConnection.update({
        where: { id: connectionId },
        data: { qrCode: qr, status: 'connecting' },
      });
      waEvents.emit(`qr:${connectionId}`, qr);
      console.log(`[WA] QR Code gerado para conexão ${connectionId}`);
    }

    if (connection === 'close') {
      activeSockets.delete(connectionId);
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      await prisma.whatsAppConnection.update({
        where: { id: connectionId },
        data: { status: 'disconnected', qrCode: null },
      });

      console.log(`[WA] Conexão ${connectionId} fechada. Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => startWhatsAppConnection(connectionId), 5000);
      } else {
        // Logged out — apaga sessão
        fs.rmSync(getSessionPath(connectionId), { recursive: true, force: true });
      }
    }

    if (connection === 'open') {
      const phoneNumber = sock.user?.id?.split(':')[0] || null;
      await prisma.whatsAppConnection.update({
        where: { id: connectionId },
        data: { status: 'connected', qrCode: null, phoneNumber },
      });
      waEvents.emit(`connected:${connectionId}`, phoneNumber);
      console.log(`[WA] Conexão ${connectionId} aberta! Número: ${phoneNumber}`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const from = msg.key.remoteJid || '';
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      if (!text) continue;

      console.log(`[WA] Mensagem de ${from}: ${text}`);

      // Salva mensagem inbound
      await prisma.message.create({
        data: {
          from,
          content: text,
          direction: 'inbound',
          status: 'delivered',
          connectionId,
        },
      });

      // Emite evento para SSE
      waEvents.emit(`message:${connectionId}`, { from, content: text, direction: 'inbound' });

      // Verifica se há bot ativo para essa conexão
      const bot = await prisma.botConfig.findFirst({
        where: { connectionId, active: true, autoReply: true },
      });

      if (!bot) continue;

      // Verifica horário de funcionamento
      if (bot.workingHoursStart && bot.workingHoursEnd) {
        const now = new Date();
        const [startH, startM] = bot.workingHoursStart.split(':').map(Number);
        const [endH, endM] = bot.workingHoursEnd.split(':').map(Number);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        if (nowMinutes < startMinutes || nowMinutes > endMinutes) continue;
      }

      // Verifica palavras ignoradas
      if (bot.ignoreKeywords) {
        const keywords = bot.ignoreKeywords.split(',').map((k) => k.trim().toLowerCase());
        if (keywords.some((k) => text.toLowerCase().includes(k))) continue;
      }

      try {
        // Chama OpenAI
        const completion = await openai.chat.completions.create({
          model: bot.model,
          temperature: bot.temperature,
          max_tokens: bot.maxTokens,
          messages: [
            { role: 'system', content: bot.prompt },
            { role: 'user', content: text },
          ],
        });

        const reply = completion.choices[0]?.message?.content || '';
        if (!reply) continue;

        // Envia resposta
        await sock.sendMessage(from, { text: reply });

        // Salva mensagem outbound
        await prisma.message.create({
          data: {
            from: 'bot',
            content: reply,
            direction: 'outbound',
            status: 'sent',
            aiGenerated: true,
            connectionId,
          },
        });

        waEvents.emit(`message:${connectionId}`, { from: 'bot', content: reply, direction: 'outbound' });
      } catch (err) {
        console.error('[WA] Erro ao gerar resposta IA:', err);
      }
    }
  });

  return sock;
}

export async function stopWhatsAppConnection(connectionId: string) {
  const sock = activeSockets.get(connectionId);
  if (sock) {
    sock.end();
    activeSockets.delete(connectionId);
  }
  await prisma.whatsAppConnection.update({
    where: { id: connectionId },
    data: { status: 'disconnected', qrCode: null },
  });
}

export async function disconnectAndWipeSession(connectionId: string) {
  await stopWhatsAppConnection(connectionId);
  fs.rmSync(getSessionPath(connectionId), { recursive: true, force: true });
}

export function getActiveConnections() {
  return Array.from(activeSockets.keys());
}

// Reconecta conexões que tinham sessão salva ao iniciar o servidor
export async function reconnectSavedSessions() {
  const sessionsDir = path.join(process.cwd(), 'sessions');
  if (!fs.existsSync(sessionsDir)) return;

  const folders = fs.readdirSync(sessionsDir);
  for (const folder of folders) {
    const credsFile = path.join(sessionsDir, folder, 'creds.json');
    if (fs.existsSync(credsFile)) {
      const conn = await prisma.whatsAppConnection.findUnique({ where: { id: folder } });
      if (conn && conn.status !== 'banned') {
        console.log(`[WA] Reconectando sessão salva: ${folder}`);
        startWhatsAppConnection(folder).catch(console.error);
      }
    }
  }
}
