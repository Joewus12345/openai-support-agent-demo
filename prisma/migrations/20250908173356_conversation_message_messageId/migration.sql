-- AlterTable
CREATE SEQUENCE "public".conversationmessage_id_seq;
ALTER TABLE "public"."ConversationMessage" ADD COLUMN     "messageId" INTEGER NOT NULL,
ALTER COLUMN "id" SET DEFAULT nextval('"public".conversationmessage_id_seq');
ALTER SEQUENCE "public".conversationmessage_id_seq OWNED BY "public"."ConversationMessage"."id";

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_conversationKey_messageId_key" ON "public"."ConversationMessage"("conversationKey", "messageId");

