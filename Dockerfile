FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci
COPY backend ./
RUN npx prisma generate && npm run build
EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push && node dist/server.js"]
