/**
 * Script de diagnóstico e correção
 * Rode com: node fix-bot-link.js
 * 
 * Mostra todas as conexões e bots, e vincula bots "soltos" à conexão ativa.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('\n🔍 DIAGNÓSTICO DO BANCO DE DADOS\n');

  const connections = await prisma.whatsAppConnection.findMany();
  console.log(`📱 Conexões WhatsApp (${connections.length}):`);
  for (const c of connections) {
    console.log(`  ID: ${c.id} | Nome: ${c.name} | Status: ${c.status} | Número: ${c.phoneNumber || 'N/A'}`);
  }

  const bots = await prisma.botConfig.findMany();
  console.log(`\n🤖 Bots configurados (${bots.length}):`);
  for (const b of bots) {
    console.log(`  ID: ${b.id} | Nome: ${b.name} | Ativo: ${b.active} | AutoReply: ${b.autoReply} | ConnectionId: ${b.connectionId || '❌ NULL'}`);
  }

  // Tenta corrigir automaticamente
  const connectedConnection = connections.find(c => c.status === 'connected');
  const botsWithoutConnection = bots.filter(b => !b.connectionId && b.active);

  if (connectedConnection && botsWithoutConnection.length > 0) {
    console.log(`\n🔧 Vinculando ${botsWithoutConnection.length} bot(s) à conexão conectada: ${connectedConnection.id}`);
    for (const bot of botsWithoutConnection) {
      await prisma.botConfig.update({
        where: { id: bot.id },
        data: { connectionId: connectedConnection.id },
      });
      console.log(`  ✅ Bot "${bot.name}" vinculado!`);
    }
  } else if (botsWithoutConnection.length > 0) {
    console.log('\n⚠️  Há bots sem connectionId, mas nenhuma conexão está "connected".');
    console.log('   → Conecte o WhatsApp primeiro e rode este script novamente.');
  } else {
    console.log('\n✅ Todos os bots já estão vinculados a uma conexão.');
  }

  // Mostra estado final
  const finalBots = await prisma.botConfig.findMany();
  console.log('\n📋 Estado final dos bots:');
  for (const b of finalBots) {
    const status = b.connectionId ? '✅' : '❌';
    console.log(`  ${status} ${b.name} | active=${b.active} | autoReply=${b.autoReply} | connectionId=${b.connectionId || 'NULL'}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
