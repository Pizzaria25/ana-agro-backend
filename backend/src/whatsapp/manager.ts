import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';

import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { EventEmitter } from 'events';

import { prisma } from '../server.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const waEvents = new EventEmitter();

const activeSockets = new Map<string, any>();
const recentBotMessages = new Set<string>();

function getSessionPath(connectionId: string) {
  const dir = path.join(process.cwd(), 'sessions', connectionId);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

function normalizeModel(model?: string | null) {
  const value = String(model || '')
    .trim()
    .toLowerCase();

  if (!value) return 'gpt-4o-mini';
  if (value === 'gpt-4' || value === 'gpt4') return 'gpt-4o-mini';

  return value;
}

function getOpenAIFallback(err: any) {
  const code = err?.code;
  const status = err?.status;
  const message = String(err?.message || '').toLowerCase();

  if (code === 'insufficient_quota' || message.includes('quota')) {
    return 'No momento o atendimento automático está temporariamente indisponível por limite da API. 📝 Sua mensagem foi registrada para o Rodolfo verificar.';
  }

  if (code === 'invalid_api_key' || status === 401) {
    return 'O atendimento automático está temporariamente indisponível. 📝 Sua mensagem foi registrada para o Rodolfo.';
  }

  if (status === 429) {
    return 'Estou recebendo muitas mensagens no momento. 📝 Sua mensagem foi registrada e o Rodolfo verificará assim que possível.';
  }

  return 'No momento estou com instabilidade para responder automaticamente. 📝 Já registrei sua mensagem para o Rodolfo verificar assim que possível.';
}

function isIgnoredChat(jid: string) {
  return (
    jid.endsWith('@g.us') ||
    jid === 'status@broadcast' ||
    jid.includes('broadcast') ||
    jid.includes('@newsletter')
  );
}

function extractText(msg: any) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.buttonsResponseMessage?.selectedDisplayText ||
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.listResponseMessage?.title ||
    ''
  ).trim();
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function isHumanModeToday(conversation: { humanMode: boolean; humanRequestedAt: Date | null }) {
  return Boolean(
    conversation.humanMode &&
    conversation.humanRequestedAt &&
    conversation.humanRequestedAt >= startOfToday()
  );
}

function botMessageKey(remoteJid?: string | null, messageId?: string | null) {
  if (!remoteJid || !messageId) return '';
  return `${remoteJid}:${messageId}`;
}

function rememberBotMessage(remoteJid: string, sent: any) {
  const key = botMessageKey(remoteJid, sent?.key?.id);
  if (!key) return;

  recentBotMessages.add(key);

  setTimeout(() => {
    recentBotMessages.delete(key);
  }, 2 * 60 * 1000);
}

async function upsertConversation(connectionId: string, contact: string, lastMessage: string) {
  return prisma.conversation.upsert({
    where: {
      connectionId_contact: {
        connectionId,
        contact,
      },
    },
    create: {
      connectionId,
      contact,
      lastMessage,
      lastMessageAt: new Date(),
    },
    update: {
      lastMessage,
      lastMessageAt: new Date(),
    },
  });
}

async function saveInboundMessage(connectionId: string, conversationId: string, from: string, text: string) {
  const message = await prisma.message.create({
    data: {
      from,
      content: text,
      direction: 'inbound',
      status: 'delivered',
      connectionId,
      conversationId,
    },
  });

  waEvents.emit(`message:${connectionId}`, {
    from,
    content: text,
    direction: 'inbound',
  });

  return message;
}

async function saveHumanOutboundMessage(connectionId: string, contact: string, text: string) {
  const conversation = await prisma.conversation.upsert({
    where: {
      connectionId_contact: {
        connectionId,
        contact,
      },
    },
    create: {
      connectionId,
      contact,
      humanMode: true,
      humanRequestedAt: new Date(),
      lastMessage: text,
      lastMessageAt: new Date(),
      intent: 'humano',
      tags: JSON.stringify(['humano']),
    },
    update: {
      humanMode: true,
      humanRequestedAt: new Date(),
      lastMessage: text,
      lastMessageAt: new Date(),
      intent: 'humano',
      tags: JSON.stringify(['humano']),
    },
  });

  await prisma.message.create({
    data: {
      from: 'rodolfo',
      content: text,
      direction: 'outbound',
      status: 'sent',
      aiGenerated: false,
      connectionId,
      conversationId: conversation.id,
    },
  });

  waEvents.emit(`message:${connectionId}`, {
    from: 'rodolfo',
    content: text,
    direction: 'outbound',
  });

  console.log(`[WA] Rodolfo respondeu ${contact}. Ana pausada até amanhã.`);
}

async function getTodayMemory(conversationId: string) {
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      createdAt: {
        gte: startOfToday(),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 12,
  });

  return messages
    .reverse()
    .map((message) => ({
      role: message.direction === 'outbound' ? 'assistant' : 'user',
      content: message.content,
    }));
}

export async function startWhatsAppConnection(connectionId: string) {
  if (activeSockets.has(connectionId)) {
    console.log(`[WA] Conexão ${connectionId} já está ativa`);
    return;
  }

  const sessionPath = getSessionPath(connectionId);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  await prisma.whatsAppConnection.update({
    where: { id: connectionId },
    data: {
      status: 'connecting',
      qrCode: null,
    },
  });

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, console as any),
    },
    printQRInTerminal: false,
    browser: ['WhatsApp SaaS', 'Chrome', '1.0.0'],
  });

  activeSockets.set(connectionId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      await prisma.whatsAppConnection.update({
        where: { id: connectionId },
        data: {
          qrCode: qr,
          status: 'connecting',
        },
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
        data: {
          status: 'disconnected',
          qrCode: null,
        },
      });

      console.log(`[WA] Conexão ${connectionId} fechada. Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => {
          startWhatsAppConnection(connectionId).catch(console.error);
        }, 5000);
      } else {
        fs.rmSync(getSessionPath(connectionId), {
          recursive: true,
          force: true,
        });
      }
    }

    if (connection === 'open') {
      const phoneNumber = sock.user?.id?.split(':')[0] || null;

      await prisma.whatsAppConnection.update({
        where: { id: connectionId },
        data: {
          status: 'connected',
          qrCode: null,
          phoneNumber,
        },
      });

      waEvents.emit(`connected:${connectionId}`, phoneNumber);
      console.log(`[WA] Conexão ${connectionId} aberta! Número: ${phoneNumber}`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        const from = msg.key.remoteJid || '';
        if (!from) continue;

        if (isIgnoredChat(from)) {
          console.log('[WA] Conversa ignorada:', from);
          continue;
        }

        const text = extractText(msg);
        if (!text.trim()) continue;

        const recentKey = botMessageKey(from, msg.key.id);

        // Mensagem enviada manualmente pelo Rodolfo no celular/WhatsApp Web.
        // Quando isso acontece, a Ana para de responder esse contato até virar o dia.
        if (msg.key.fromMe) {
          if (recentKey && recentBotMessages.has(recentKey)) {
            continue;
          }

          await saveHumanOutboundMessage(connectionId, from, text);
          continue;
        }

        console.log(`[WA] Mensagem de ${from}: ${text}`);

        let conversation = await upsertConversation(connectionId, from, text);

        await saveInboundMessage(connectionId, conversation.id, from, text);

        if (isHumanModeToday(conversation)) {
          console.log(`[WA] Ana não respondeu ${from}: Rodolfo já falou com esse contato hoje.`);
          continue;
        }

        if (conversation.humanMode && !isHumanModeToday(conversation)) {
          conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              humanMode: false,
              humanRequestedAt: null,
            },
          });
        }

        const bot = await prisma.botConfig.findFirst({
          where: {
            connectionId,
            active: true,
            autoReply: true,
          },
        });

        if (!bot) continue;

        if (!process.env.OPENAI_API_KEY) {
          const fallback =
            'O atendimento automático ainda não está configurado. 📝 Sua mensagem foi registrada para o Rodolfo.';

          const sent = await sock.sendMessage(from, { text: fallback });
          rememberBotMessage(from, sent);

          await prisma.message.create({
            data: {
              from: 'bot',
              content: fallback,
              direction: 'outbound',
              status: 'sent',
              aiGenerated: false,
              connectionId,
              conversationId: conversation.id,
            },
          });

          continue;
        }

        if (bot.workingHoursStart && bot.workingHoursEnd) {
          const now = new Date();

          const [startH, startM] = bot.workingHoursStart.split(':').map(Number);
          const [endH, endM] = bot.workingHoursEnd.split(':').map(Number);

          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;

          if (nowMinutes < startMinutes || nowMinutes > endMinutes) {
            continue;
          }
        }

        if (bot.ignoreKeywords) {
          const keywords = bot.ignoreKeywords
            .split(',')
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean);

          if (keywords.some((k) => text.toLowerCase().includes(k))) {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                humanMode: true,
                humanRequestedAt: new Date(),
                intent: 'humano',
                tags: JSON.stringify(['humano']),
              },
            });

            console.log(`[WA] Palavra de humano detectada. Ana pausada para ${from}.`);
            continue;
          }
        }

        const safeModel = normalizeModel(bot.model);

        try {
          const memory = await getTodayMemory(conversation.id);

          const completion = await openai.chat.completions.create({
            model: safeModel,
            temperature: Number(bot.temperature ?? 0.7),
            max_tokens: Number(bot.maxTokens ?? 500),
            messages: [
              {
                role: 'system',
                content:
                  bot.prompt ||
                  'Você é uma assistente educada, objetiva e profissional.',
              },
              ...memory,
              {
                role: 'user',
                content: text,
              },
            ],
          });

          const reply = completion.choices[0]?.message?.content?.trim();

          if (!reply) {
            throw new Error('Resposta vazia da OpenAI');
          }

          const sent = await sock.sendMessage(from, { text: reply });
          rememberBotMessage(from, sent);

          await prisma.message.create({
            data: {
              from: 'bot',
              content: reply,
              direction: 'outbound',
              status: 'sent',
              aiGenerated: true,
              connectionId,
              conversationId: conversation.id,
            },
          });

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessage: reply,
              lastMessageAt: new Date(),
            },
          });

          waEvents.emit(`message:${connectionId}`, {
            from: 'bot',
            content: reply,
            direction: 'outbound',
          });
        } catch (err: any) {
          console.error('[WA] Erro ao gerar resposta IA:', {
            status: err?.status,
            code: err?.code,
            message: err?.message,
          });

          const fallback = getOpenAIFallback(err);

          const sent = await sock.sendMessage(from, { text: fallback });
          rememberBotMessage(from, sent);

          await prisma.message.create({
            data: {
              from: 'bot',
              content: fallback,
              direction: 'outbound',
              status: 'sent',
              aiGenerated: false,
              connectionId,
              conversationId: conversation.id,
            },
          });

          waEvents.emit(`message:${connectionId}`, {
            from: 'bot',
            content: fallback,
            direction: 'outbound',
          });
        }
      } catch (err) {
        console.error('[WA] Erro geral ao processar mensagem:', err);
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
    data: {
      status: 'disconnected',
      qrCode: null,
    },
  });
}

export async function disconnectAndWipeSession(connectionId: string) {
  await stopWhatsAppConnection(connectionId);

  fs.rmSync(getSessionPath(connectionId), {
    recursive: true,
    force: true,
  });
}

export function getActiveConnections() {
  return Array.from(activeSockets.keys());
}

export async function reconnectSavedSessions() {
  const sessionsDir = path.join(process.cwd(), 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    return;
  }

  const folders = fs.readdirSync(sessionsDir);

  for (const folder of folders) {
    const credsFile = path.join(sessionsDir, folder, 'creds.json');

    if (fs.existsSync(credsFile)) {
      const conn = await prisma.whatsAppConnection.findUnique({
        where: { id: folder },
      });

      if (conn && conn.status !== 'banned') {
        console.log(`[WA] Reconectando sessão salva: ${folder}`);

        startWhatsAppConnection(folder).catch(console.error);
      }
    }
  }
}

export const whatsappManager = {
  start: startWhatsAppConnection,
  startConnection: startWhatsAppConnection,

  stop: stopWhatsAppConnection,
  stopConnection: stopWhatsAppConnection,

  disconnectAndWipeSession,
  getActiveConnections,
  reconnectSavedSessions,
};
