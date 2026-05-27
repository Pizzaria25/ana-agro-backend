# 🚀 Passo a Passo — WhatsApp Bot SaaS

## ⚠️ ANTES DE TUDO — Segurança

Sua chave OpenAI foi exposta no zip. Faça isso agora:

1. Acesse https://platform.openai.com/api-keys
2. Delete a chave antiga
3. Crie uma nova chave
4. Copie e guarde — você vai precisar no Passo 2

---

## 📋 Pré-requisitos

- Node.js 18+ instalado → https://nodejs.org
- npm (vem com Node.js)

Verifique no terminal:
```
node --version   # deve ser 18 ou maior
npm --version
```

---

## Passo 1 — Entrar na pasta do backend

```bash
cd whatsapp-saas/backend
```

---

## Passo 2 — Configurar o arquivo .env

Abra o arquivo `backend/.env` e preencha:

```env
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="coloque-aqui-uma-senha-longa-aleatoria-ex-abc123xyz789"
OPENAI_API_KEY="sk-proj-sua-nova-chave-aqui"
PORT=3001
NODE_ENV=development
```

> ⚠️ Não use a chave antiga! Use a nova que você criou no pré-requisito.

---

## Passo 3 — Instalar dependências

```bash
npm install
```

Aguarde terminar (pode demorar 1-2 minutos).

---

## Passo 4 — Configurar o banco de dados

```bash
npm run db:push
npm run db:seed
```

O `db:push` cria as tabelas. O `db:seed` cria os planos (free, starter, pro, enterprise).

---

## Passo 5 — Iniciar o servidor

```bash
npm run dev
```

Você deve ver:
```
🚀 Backend rodando em http://localhost:3001
```

Deixe esse terminal aberto.

---

## Passo 6 — Criar conta e conexão (primeira vez)

Faça as chamadas abaixo via Postman, Insomnia ou curl.

### 6.1 — Criar tenant (empresa)
```
POST http://localhost:3001/api/auth/register
Content-Type: application/json

{
  "name": "Minha Empresa",
  "slug": "minha-empresa",
  "email": "admin@empresa.com",
  "password": "suasenha123"
}
```

### 6.2 — Fazer login
```
POST http://localhost:3001/api/auth/login
Content-Type: application/json

{
  "email": "admin@empresa.com",
  "password": "suasenha123"
}
```
Guarde o `token` da resposta.

### 6.3 — Criar conexão WhatsApp
```
POST http://localhost:3001/api/connections
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{
  "name": "WhatsApp Business"
}
```
Guarde o `id` da resposta (ex: `cmpef91x10007z2rt6icesytr`).

### 6.4 — Criar bot vinculado à conexão
```
POST http://localhost:3001/api/bots
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{
  "name": "Atendente IA",
  "active": true,
  "autoReply": true,
  "connectionId": "ID_DA_CONEXAO_DO_PASSO_6.3",
  "prompt": "Você é um assistente de atendimento. Responda em português, seja educado e objetivo.",
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "maxTokens": 500
}
```

---

## Passo 7 — Conectar o WhatsApp

### 7.1 — Iniciar a conexão (gera QR Code)
```
POST http://localhost:3001/api/connections/ID_DA_CONEXAO/connect
Authorization: Bearer SEU_TOKEN
```

### 7.2 — Buscar o QR Code
```
GET http://localhost:3001/api/connections/ID_DA_CONEXAO
Authorization: Bearer SEU_TOKEN
```

A resposta terá um campo `qrCode` com uma imagem base64.
Cole o valor em https://base64.guru/converter/decode/image para visualizar.

### 7.3 — Escanear
No celular com WhatsApp Business:
- Configurações → Aparelhos conectados → Conectar aparelho
- Escaneie o QR Code

Quando conectar, o terminal mostrará:
```
[ID] ✅ Conectado! Número: 5511999999999
```

---

## Passo 8 — Testar o bot

Envie uma mensagem de **outro número** para o número conectado.
O terminal deve mostrar:
```
[ID] 📩 Mensagem de 5511888888888@s.whatsapp.net: oi
[ID] 🤖 Gerando resposta...
[ID] ✅ Resposta enviada
```

---

## 🔧 Solução de problemas

### Bot não responde
Execute o script de diagnóstico:
```bash
node fix-bot-link.js
```
Ele verifica se o bot está vinculado à conexão correta e corrige automaticamente.

### QR Code não aparece / expira
- QR codes expiram em ~20 segundos
- Chame `/connect` novamente para gerar um novo

### Erro "Unauthorized"
- Confirme que está passando o header `Authorization: Bearer SEU_TOKEN`

### Mensagens de grupos
Por padrão, o bot ignora mensagens de grupos. Isso é intencional.

### Erro OpenAI
- Verifique se a `OPENAI_API_KEY` no `.env` é válida
- Verifique se sua conta OpenAI tem créditos

---

## 📁 Estrutura dos arquivos corrigidos

```
backend/
  src/
    server.ts              ← corrigido: reconecta sessões ao iniciar
    whatsapp/
      manager.ts           ← corrigido: browser Business + logs + auto-vincula bots
      aiReply.ts           ← sem alteração
  fix-bot-link.js          ← NOVO: script de diagnóstico/correção
  .env                     ← atualizado: chaves em branco para você preencher
```
