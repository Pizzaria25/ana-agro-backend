-- Premium conversations: memória do dia, modo humano e etiquetas
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact" TEXT NOT NULL,
    "displayName" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'geral',
    "sentiment" TEXT NOT NULL DEFAULT 'neutro',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "humanMode" BOOLEAN NOT NULL DEFAULT false,
    "humanRequestedAt" DATETIME,
    "internalNotes" TEXT,
    "lastMessage" TEXT,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dayMemory" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "connectionId" TEXT NOT NULL,
    CONSTRAINT "Conversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Conversation_connectionId_contact_key" ON "Conversation"("connectionId", "contact");

ALTER TABLE "Message" ADD COLUMN "conversationId" TEXT REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
