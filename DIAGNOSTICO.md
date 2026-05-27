# Diagnóstico: Bot não responde automaticamente

## Causa raiz identificada

### Problema 1 — CRÍTICO: Chave OpenAI errada no .env do backend
O arquivo `backend/.env` tinha `OPENAI_API_KEY="COLOQUE_SUA_NOVA_CHAVE_OPENAI_AQUI"` (placeholder).
O backend carrega APENAS o `backend/.env`, não o `.env` da raiz.
Isso fazia o `aiReply` detectar chave inválida e retornar `null`, silenciosamente.

**Correção aplicada:** A chave real foi copiada para `backend/.env`.

### Problema 2 — Fuso horário incorreto
O horário de atendimento era calculado com `new Date()` usando UTC do servidor.
Se o servidor roda em UTC e seu horário está configurado como `08:00-18:00` (Brasília),
o bot ignorava mensagens entre 00:00-03:00 e 21:00-24:00 UTC desnecessariamente.

**Correção aplicada:** Agora usa `America/Sao_Paulo` via `process.env.TIMEZONE`.

### Problema 3 — Bot pode não estar vinculado à conexão
O bot precisa ter `connectionId` igual ao da conexão ativa.
Se você criou o bot ANTES de conectar o WhatsApp, o vínculo pode não ter sido feito.

**Como verificar:** Olhe os logs do servidor — agora aparece a lista de todos os bots ativos.
Se o `connectionId` do bot for `null`, vá no painel e edite o bot vinculando-o à conexão.

---

## Checklist de verificação

1. [ ] `backend/.env` tem a `OPENAI_API_KEY` real (não placeholder)
2. [ ] O bot tem `active = true` e `autoReply = true`
3. [ ] O bot tem `connectionId` apontando para a conexão correta
4. [ ] A conexão está com status `connected`
5. [ ] O horário atual de Brasília está dentro de `workingHoursStart` e `workingHoursEnd`
      (ou deixe esses campos vazios para atender 24h)
