-- Move legacy customer, session, ticket, order, and Chatwoot state behind the
-- account boundary. Existing single-account data belongs to the primary tenant.

ALTER TABLE "User" ADD COLUMN "accountId" TEXT;
ALTER TABLE "Order" ADD COLUMN "accountId" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "accountId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "accountId" TEXT;
ALTER TABLE "ConversationMessage" ADD COLUMN "tenantAccountId" TEXT;
ALTER TABLE "AgentAssignment" ADD COLUMN "tenantAccountId" TEXT;
ALTER TABLE "HandoffRequest" ADD COLUMN "tenantAccountId" TEXT;

UPDATE "User" SET "accountId" = '00000000-0000-0000-0000-000000000001';
UPDATE "Order" SET "accountId" = '00000000-0000-0000-0000-000000000001';
UPDATE "ChatSession" SET "accountId" = '00000000-0000-0000-0000-000000000001';
UPDATE "Ticket" SET "accountId" = '00000000-0000-0000-0000-000000000001';
UPDATE "ConversationMessage" SET "tenantAccountId" = '00000000-0000-0000-0000-000000000001';
UPDATE "AgentAssignment" SET "tenantAccountId" = '00000000-0000-0000-0000-000000000001';
UPDATE "HandoffRequest" SET "tenantAccountId" = '00000000-0000-0000-0000-000000000001';

ALTER TABLE "User" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "ChatSession" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Ticket" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "ConversationMessage" ALTER COLUMN "tenantAccountId" SET NOT NULL;
ALTER TABLE "AgentAssignment" ALTER COLUMN "tenantAccountId" SET NOT NULL;
ALTER TABLE "HandoffRequest" ALTER COLUMN "tenantAccountId" SET NOT NULL;

ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";
ALTER TABLE "ChatSession" DROP CONSTRAINT "ChatSession_userId_fkey";
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_userId_fkey";
ALTER TABLE "AgentAssignment" DROP CONSTRAINT "AgentAssignment_pkey";

DROP INDEX "User_email_key";
DROP INDEX "Order_orderId_key";
DROP INDEX "ConversationMessage_conversationKey_messageId_key";

CREATE UNIQUE INDEX "User_accountId_email_key" ON "User"("accountId", "email");
CREATE UNIQUE INDEX "User_accountId_id_key" ON "User"("accountId", "id");
CREATE INDEX "User_accountId_idx" ON "User"("accountId");

CREATE UNIQUE INDEX "Order_accountId_orderId_key" ON "Order"("accountId", "orderId");
CREATE INDEX "Order_accountId_userId_idx" ON "Order"("accountId", "userId");

CREATE UNIQUE INDEX "ChatSession_accountId_id_key" ON "ChatSession"("accountId", "id");
CREATE INDEX "ChatSession_accountId_userId_createdAt_idx" ON "ChatSession"("accountId", "userId", "createdAt");

CREATE INDEX "Ticket_accountId_ticket_idx" ON "Ticket"("accountId", "ticket");
CREATE INDEX "Ticket_accountId_userId_idx" ON "Ticket"("accountId", "userId");

CREATE UNIQUE INDEX "ConversationMessage_tenant_conversation_message_key"
ON "ConversationMessage"("tenantAccountId", "conversationKey", "messageId");
CREATE INDEX "ConversationMessage_tenant_conversation_created_idx"
ON "ConversationMessage"("tenantAccountId", "conversationKey", "createdAt");

ALTER TABLE "AgentAssignment"
ADD CONSTRAINT "AgentAssignment_pkey"
PRIMARY KEY ("tenantAccountId", "inboxId", "agentId");
CREATE INDEX "AgentAssignment_tenant_active_conversation_idx"
ON "AgentAssignment"("tenantAccountId", "activeConversationId");

CREATE INDEX "HandoffRequest_tenant_queue_idx"
ON "HandoffRequest"("tenantAccountId", "accountId", "inboxId", "status", "requestedAt");

ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_tenantAccountId_fkey"
FOREIGN KEY ("tenantAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_tenantAccountId_fkey"
FOREIGN KEY ("tenantAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HandoffRequest" ADD CONSTRAINT "HandoffRequest_tenantAccountId_fkey"
FOREIGN KEY ("tenantAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_userId_fkey"
FOREIGN KEY ("accountId", "userId") REFERENCES "User"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_accountId_userId_fkey"
FOREIGN KEY ("accountId", "userId") REFERENCES "User"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_accountId_userId_fkey"
FOREIGN KEY ("accountId", "userId") REFERENCES "User"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
