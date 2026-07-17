import crypto from "crypto";

import { ACCOUNT_CONFIG_FIELDS, ACCOUNT_CONFIG_KEYS } from "@/config/accountConfiguration";
import { VECTOR_STORE_ID } from "@/config/constants";
import prisma from "@/lib/prisma";

type EncryptedPayload = {
  encryptedValue: string;
  iv: string;
  authTag: string;
};

function primaryEnvironmentValue(key: string) {
  const configured = process.env[key]?.trim();
  if (configured) return configured;
  return key === "OPENAI_VECTOR_STORE_ID" ? VECTOR_STORE_ID : undefined;
}

function encryptionKey() {
  const secret = process.env.ACCOUNT_CONFIG_ENCRYPTION_KEY ?? process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "ACCOUNT_CONFIG_ENCRYPTION_KEY (or AUTH_SESSION_SECRET) is required to store account configuration"
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encryptedValue = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encryptedValue: encryptedValue.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decrypt(payload: EncryptedPayload) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export type AccountConfigurationFieldState = {
  key: string;
  configured: boolean;
  source: "environment" | "account" | "unset";
  value?: string;
  updatedAt?: string;
};

export async function getAccountConfigurationState(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { configurations: true },
  });
  if (!account) return null;

  const storedByKey = new Map(account.configurations.map((entry) => [entry.key, entry]));
  const fields: AccountConfigurationFieldState[] = ACCOUNT_CONFIG_FIELDS.map((definition) => {
    if (account.isPrimary) {
      const value = primaryEnvironmentValue(definition.key) ?? "";
      return {
        key: definition.key,
        configured: value.length > 0,
        source: value ? "environment" : "unset",
        ...(definition.kind !== "secret" && value ? { value } : {}),
      };
    }

    const stored = storedByKey.get(definition.key);
    if (!stored) return { key: definition.key, configured: false, source: "unset" };
    return {
      key: definition.key,
      configured: true,
      source: "account",
      ...(definition.kind !== "secret" ? { value: decrypt(stored) } : {}),
      updatedAt: stored.updatedAt.toISOString(),
    };
  });

  return { account, fields };
}

export async function updateAccountConfiguration(
  accountId: string,
  values: Record<string, string | null>,
  updatedById: string
) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Account not found");
  if (account.isPrimary) {
    throw new Error("The primary account is managed by the server environment");
  }

  const entries = Object.entries(values);
  const invalidKey = entries.find(([key]) => !ACCOUNT_CONFIG_KEYS.has(key));
  if (invalidKey) throw new Error(`Unsupported configuration key: ${invalidKey[0]}`);

  await prisma.$transaction(
    entries.map(([key, rawValue]) => {
      const value = rawValue?.trim() ?? "";
      if (!value) {
        return prisma.accountConfiguration.deleteMany({ where: { accountId, key } });
      }
      const definition = ACCOUNT_CONFIG_FIELDS.find((field) => field.key === key);
      const encrypted = encrypt(value);
      return prisma.accountConfiguration.upsert({
        where: { accountId_key: { accountId, key } },
        create: {
          accountId,
          key,
          ...encrypted,
          isSecret: definition?.kind === "secret",
          updatedById,
        },
        update: {
          ...encrypted,
          isSecret: definition?.kind === "secret",
          updatedById,
        },
      });
    })
  );
}

export async function resolveAccountConfigValue(accountId: string, key: string) {
  if (!ACCOUNT_CONFIG_KEYS.has(key)) return undefined;
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      isPrimary: true,
      configurations: { where: { key }, take: 1 },
    },
  });
  if (!account) return undefined;
  if (account.isPrimary) return primaryEnvironmentValue(key);
  const stored = account.configurations[0];
  return stored ? decrypt(stored) : undefined;
}

export async function resolveAccountRuntimeConfig(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { configurations: true },
  });
  if (!account) return {} as Record<string, string>;
  if (account.isPrimary) {
    return Object.fromEntries(
      ACCOUNT_CONFIG_FIELDS.flatMap(({ key }) => {
        const value = primaryEnvironmentValue(key);
        return value ? [[key, value]] : [];
      })
    );
  }
  return Object.fromEntries(account.configurations.map((entry) => [entry.key, decrypt(entry)]));
}
