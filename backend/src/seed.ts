import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.plan.upsert({ where: { name: 'free' }, update: {}, create: { name: 'free', price: 0, maxConnections: 1, maxMessages: 500, maxUsers: 1, hasAi: false, hasApi: false } });
  await prisma.plan.upsert({ where: { name: 'starter' }, update: {}, create: { name: 'starter', price: 49, maxConnections: 3, maxMessages: 2000, maxUsers: 3, hasAi: true, hasApi: false } });
  await prisma.plan.upsert({ where: { name: 'pro' }, update: {}, create: { name: 'pro', price: 99, maxConnections: 10, maxMessages: 10000, maxUsers: 10, hasAi: true, hasApi: true } });
  await prisma.plan.upsert({ where: { name: 'enterprise' }, update: {}, create: { name: 'enterprise', price: 299, maxConnections: 100, maxMessages: 100000, maxUsers: 100, hasAi: true, hasApi: true } });
  console.log('✅ Planos criados!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
