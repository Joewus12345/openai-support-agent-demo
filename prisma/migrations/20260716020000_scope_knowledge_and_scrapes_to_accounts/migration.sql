-- Attribute every existing scrape job to the primary account before making
-- accountId mandatory. New jobs are always created through an account scope.
ALTER TABLE "ScrapeJob" ADD COLUMN "accountId" TEXT;

UPDATE "ScrapeJob"
SET "accountId" = (
  SELECT "id"
  FROM "Account"
  WHERE "isPrimary" = true
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "accountId" IS NULL;

ALTER TABLE "ScrapeJob" ALTER COLUMN "accountId" SET NOT NULL;

CREATE UNIQUE INDEX "ScrapeJob_accountId_id_key"
ON "ScrapeJob"("accountId", "id");

CREATE INDEX "ScrapeJob_accountId_createdAt_idx"
ON "ScrapeJob"("accountId", "createdAt");

CREATE INDEX "ScrapeJob_accountId_status_createdAt_idx"
ON "ScrapeJob"("accountId", "status", "createdAt");

CREATE INDEX "ScrapeJob_accountId_cadence_nextRunAt_idx"
ON "ScrapeJob"("accountId", "cadence", "nextRunAt");

ALTER TABLE "ScrapeJob"
ADD CONSTRAINT "ScrapeJob_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "KnowledgeDocumentKind" AS ENUM ('knowledge_base', 'faq');

CREATE TABLE "KnowledgeDocument" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "kind" "KnowledgeDocumentKind" NOT NULL,
  "name" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'text/markdown',
  "byteSize" INTEGER NOT NULL,
  "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
  "sourceModifiedAt" TIMESTAMP(3) NOT NULL,
  "sourceJobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeDocument_accountId_kind_name_key"
ON "KnowledgeDocument"("accountId", "kind", "name");

CREATE INDEX "KnowledgeDocument_accountId_kind_sourceModifiedAt_idx"
ON "KnowledgeDocument"("accountId", "kind", "sourceModifiedAt");

CREATE INDEX "KnowledgeDocument_accountId_sourceJobId_idx"
ON "KnowledgeDocument"("accountId", "sourceJobId");

ALTER TABLE "KnowledgeDocument"
ADD CONSTRAINT "KnowledgeDocument_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ScrapeJobLog" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrapeJobLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScrapeJobLog_accountId_jobId_storageKey_key"
ON "ScrapeJobLog"("accountId", "jobId", "storageKey");

CREATE INDEX "ScrapeJobLog_accountId_jobId_startedAt_idx"
ON "ScrapeJobLog"("accountId", "jobId", "startedAt");

ALTER TABLE "ScrapeJobLog"
ADD CONSTRAINT "ScrapeJobLog_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScrapeJobLog"
ADD CONSTRAINT "ScrapeJobLog_accountId_jobId_fkey"
FOREIGN KEY ("accountId", "jobId") REFERENCES "ScrapeJob"("accountId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
