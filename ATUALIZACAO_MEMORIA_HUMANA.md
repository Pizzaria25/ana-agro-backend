# Atualização: memória diária Rodolfo x Ana

Esta versão adiciona uma regra importante no WhatsApp:

- Se Rodolfo responder manualmente um contato no WhatsApp no mesmo dia, a Ana pausa automaticamente para esse contato.
- A Ana volta a responder esse contato somente no dia seguinte.
- Mensagens de grupos, status, broadcast e canais continuam sendo ignoradas.
- As mensagens ficam vinculadas à conversa no banco para melhorar a central de conversas.
- A IA agora recebe memória das mensagens do dia para reduzir repetição e melhorar contexto.

## Arquivo principal alterado

backend/src/whatsapp/manager.ts

## Como testar

1. Rode o backend:
   cd backend
   npm install
   npx prisma generate
   npm run dev

2. Envie uma mensagem de outro WhatsApp para o número conectado.
3. Deixe a Ana responder.
4. Agora responda manualmente pelo WhatsApp conectado.
5. No mesmo dia, envie outra mensagem daquele contato.
6. A Ana não deve responder.

No terminal deve aparecer algo parecido com:

[WA] Rodolfo respondeu <contato>. Ana pausada até amanhã.
[WA] Ana não respondeu <contato>: Rodolfo já falou com esse contato hoje.
