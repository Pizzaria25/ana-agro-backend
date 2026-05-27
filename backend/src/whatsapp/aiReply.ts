import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type MemoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

function normalizeModel(model?: string | null) {
  const value = String(model || '')
    .trim()
    .toLowerCase();

  if (!value || value === 'gpt-4' || value === 'gpt4') {
    return 'gpt-4o-mini';
  }

  return value;
}

function fallbackMessage() {
  return 'No momento o atendimento automático está temporariamente indisponível. 📝 Sua mensagem foi registrada para o Rodolfo verificar.';
}

async function askOpenAI(
  prompt: string,
  userMessage: string,
  memory: MemoryMessage[],
  model: string,
  temperature: number,
  maxTokens: number
) {
  const completion = await openai.chat.completions.create({
    model,

    temperature,

    max_tokens: maxTokens,

    messages: [
      {
        role: 'system',
        content: prompt,
      },

      ...memory.slice(-12),

      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  return (
    completion.choices[0]?.message?.content?.trim() ||
    ''
  );
}

async function askClaude(
  prompt: string,
  userMessage: string,
  memory: MemoryMessage[]
) {
  const history = memory
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model:
      process.env.CLAUDE_MODEL ||
      'claude-haiku-4-5',

    max_tokens: 500,

    temperature: 0.7,

    system: prompt,

    messages: [
      {
        role: 'user',
        content: `
Histórico:
${history}

Mensagem atual:
${userMessage}
        `,
      },
    ],
  });

  const text =
    response.content[0]?.type === 'text'
      ? response.content[0].text
      : '';

  return text.trim();
}

export async function aiReply(
  prompt: string,
  userMessage: string,
  memory: MemoryMessage[] = [],
  model: string = 'gpt-4o-mini',
  temperature: number = 0.7,
  maxTokens: number = 500
): Promise<string> {
  try {
    const provider =
      process.env.AI_PROVIDER || 'openai';

    const safeModel = normalizeModel(model);

    if (provider === 'claude') {
      const claudeReply = await askClaude(
        prompt,
        userMessage,
        memory
      );

      if (claudeReply) {
        return claudeReply;
      }
    }

    const openaiReply = await askOpenAI(
      prompt,
      userMessage,
      memory,
      safeModel,
      temperature,
      maxTokens
    );

    if (openaiReply) {
      return openaiReply;
    }

    return fallbackMessage();
  } catch (err: any) {
    console.error('AI ERROR:', {
      provider: process.env.AI_PROVIDER,
      status: err?.status,
      code: err?.code,
      message: err?.message,
    });

    try {
      console.log(
        'Tentando fallback automático para Claude...'
      );

      const claudeReply = await askClaude(
        prompt,
        userMessage,
        memory
      );

      if (claudeReply) {
        return claudeReply;
      }
    } catch (claudeErr: any) {
      console.error('Claude fallback error:', {
        status: claudeErr?.status,
        message: claudeErr?.message,
      });
    }

    return fallbackMessage();
  }
}

export function detectIntentLocal(
  text: string
): string[] {
  const t = String(text || '').toLowerCase();

  const tags: string[] = [];

  if (
    t.includes('preço') ||
    t.includes('valor') ||
    t.includes('orçamento')
  ) {
    tags.push('orçamento');
  }

  if (
    t.includes('comprar') ||
    t.includes('contratar') ||
    t.includes('fechar')
  ) {
    tags.push('lead quente');
  }

  if (
    t.includes('erro') ||
    t.includes('problema') ||
    t.includes('ajuda')
  ) {
    tags.push('suporte');
  }

  if (
    t.includes('praga') ||
    t.includes('fungo') ||
    t.includes('lagarta')
  ) {
    tags.push('agro/pragas');
  }

  if (
    t.includes('solo') ||
    t.includes('adubo') ||
    t.includes('calcário')
  ) {
    tags.push('agro/solo');
  }

  if (
    t.includes('humano') ||
    t.includes('rodolfo')
  ) {
    tags.push('humano');
  }

  if (tags.length === 0) {
    tags.push('conversa');
  }

  return tags;
}