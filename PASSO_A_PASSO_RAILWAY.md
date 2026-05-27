# Deploy no Railway sem GitHub e sem terminal

## 1. Compacte a pasta
Use o arquivo ZIP deste projeto. Não precisa subir no GitHub.

## 2. Crie o projeto no Railway
1. Entre no Railway.
2. Clique em **New Project**.
3. Escolha **Deploy from ZIP / Empty Project** conforme aparecer na sua conta.
4. Envie a pasta do projeto.

## 3. Configure as variáveis
No Railway, abra **Variables** e adicione:

```env
DATABASE_URL=file:./prisma/dev.db
JWT_SECRET=troque-por-uma-chave-grande
OPENAI_API_KEY=sua-chave-openai
PORT=3001
NODE_ENV=production
TIMEZONE=America/Sao_Paulo
```

## 4. Deploy
O Railway vai usar o `Dockerfile` e executar automaticamente:

```bash
npm ci
npx prisma generate
npm run build
npx prisma db push
node dist/server.js
```

## 5. Abrir painel
Depois do deploy, use a URL pública do Railway para acessar a API.
Se usar o HTML local, altere a constante `API` no arquivo `index (1).html` para a URL do Railway com `/api`.

Exemplo:

```js
const API = 'https://seu-projeto.up.railway.app/api';
```
