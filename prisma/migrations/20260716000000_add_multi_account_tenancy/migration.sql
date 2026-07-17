-- Introduce a Chatwoot-style tenant boundary: identities are global, while
-- roles and configuration belong to an account membership.
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'maintenance');

ALTER TABLE "AgentAccount"
ADD COLUMN "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "suspensionReason" TEXT,
    "maintenanceMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountMembership" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL DEFAULT 'agent',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountConfiguration" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountConfiguration_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LoginToken" ADD COLUMN "accountId" TEXT;

CREATE UNIQUE INDEX "Account_slug_key" ON "Account"("slug");
CREATE UNIQUE INDEX "Account_single_primary_key" ON "Account"("isPrimary") WHERE "isPrimary" = true;
CREATE INDEX "Account_status_idx" ON "Account"("status");
CREATE UNIQUE INDEX "AccountMembership_accountId_agentId_key" ON "AccountMembership"("accountId", "agentId");
CREATE INDEX "AccountMembership_agentId_idx" ON "AccountMembership"("agentId");
CREATE UNIQUE INDEX "AccountConfiguration_accountId_key_key" ON "AccountConfiguration"("accountId", "key");
CREATE INDEX "AccountConfiguration_accountId_idx" ON "AccountConfiguration"("accountId");
CREATE INDEX "LoginToken_accountId_idx" ON "LoginToken"("accountId");

ALTER TABLE "AccountMembership"
ADD CONSTRAINT "AccountMembership_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountMembership"
ADD CONSTRAINT "AccountMembership_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AgentAccount"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountConfiguration"
ADD CONSTRAINT "AccountConfiguration_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoginToken"
ADD CONSTRAINT "LoginToken_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve an existing single-account installation as the primary tenant.
INSERT INTO "Account" ("id", "name", "slug", "status", "isPrimary", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Primary account', 'primary', 'active', true, CURRENT_TIMESTAMP);

INSERT INTO "AccountMembership" ("id", "accountId", "agentId", "role", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text)::uuid::text,
  '00000000-0000-0000-0000-000000000001',
  "userId",
  CASE
    WHEN ('admin'::"AgentRole") = ANY("roles") THEN 'admin'::"AgentRole"
    ELSE 'agent'::"AgentRole"
  END,
  CURRENT_TIMESTAMP
FROM "AgentAccount";

UPDATE "AgentAccount"
SET "platformAdmin" = true
WHERE "userId" = (
  SELECT "userId"
  FROM "AgentAccount"
  WHERE ('admin'::"AgentRole") = ANY("roles")
  ORDER BY "createdAt" ASC
  LIMIT 1
);

UPDATE "LoginToken"
SET "accountId" = '00000000-0000-0000-0000-000000000001'
WHERE "accountId" IS NULL;
