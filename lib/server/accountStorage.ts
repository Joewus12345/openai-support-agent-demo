import { promises as fs } from "node:fs";
import path from "node:path";

import { KB_FOLDERS } from "@/config/demoData";
import { KnowledgeDocumentKind } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";

export type KnowledgeFolder = (typeof KB_FOLDERS)[number];
export type StorageAccount = {
  id: string;
  isPrimary: boolean;
};

const WORKSPACE_ROOT = path.resolve(process.cwd());
const ACCOUNT_STORAGE_ROOT = path.join(WORKSPACE_ROOT, "data", "accounts");
const LEGACY_PUBLIC_ROOT = path.join(WORKSPACE_ROOT, "public");
const LEGACY_LOG_ROOT = path.join(WORKSPACE_ROOT, "logs", "scrape_jobs");
const indexRefreshes = new Map<string, Promise<void>>();
const indexedScopes = new Set<string>();

function safeAccountSegment(accountId: string) {
  if (!/^[a-zA-Z0-9_-]+$/u.test(accountId)) {
    throw new Error("Invalid account storage identifier");
  }
  return accountId;
}

export function isKnowledgeFolder(value: string | null): value is KnowledgeFolder {
  return Boolean(value && KB_FOLDERS.includes(value as KnowledgeFolder));
}

export function getAccountStorageRoot(accountId: string) {
  return path.join(ACCOUNT_STORAGE_ROOT, safeAccountSegment(accountId));
}

export function getPrivateKnowledgeDirectory(accountId: string, folder: KnowledgeFolder) {
  return path.join(getAccountStorageRoot(accountId), folder);
}

export function getAccountScrapeLogRoot(accountId: string) {
  return path.join(getAccountStorageRoot(accountId), "logs", "scrape_jobs");
}

export function getLegacyScrapeLogRoot() {
  return LEGACY_LOG_ROOT;
}

export function getKnowledgeSourceDirectories(account: StorageAccount, folder: KnowledgeFolder) {
  const directories = account.isPrimary
    ? [path.join(LEGACY_PUBLIC_ROOT, folder), getPrivateKnowledgeDirectory(account.id, folder)]
    : [getPrivateKnowledgeDirectory(account.id, folder)];
  return Array.from(new Set(directories.map((directory) => path.resolve(directory))));
}

export function toStorageKey(absolutePath: string) {
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Storage path is outside the workspace");
  }
  return relative.replace(/\\/gu, "/");
}

function isWithinBase(candidate: string, base: string) {
  const relative = path.relative(path.resolve(base), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveKnowledgeStorageKey(
  storageKey: string,
  account: StorageAccount,
  folder: KnowledgeFolder
) {
  const absolutePath = path.resolve(WORKSPACE_ROOT, storageKey);
  const allowed = getKnowledgeSourceDirectories(account, folder);
  if (!allowed.some((base) => isWithinBase(absolutePath, base))) {
    throw new Error("Knowledge document is outside this account's storage boundary");
  }
  return absolutePath;
}

function mimeTypeFor(name: string) {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".json") return "application/json";
  if (extension === ".txt") return "text/plain";
  return "text/markdown";
}

type ScannedDocument = {
  accountId: string;
  kind: KnowledgeDocumentKind;
  name: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  sourceCreatedAt: Date;
  sourceModifiedAt: Date;
  sourceJobId: string | null;
};

async function scanDirectory(
  accountId: string,
  folder: KnowledgeFolder,
  directory: string,
  sourceJobId: string | null,
  modifiedSince?: Date
) {
  let entries: Array<{ name: string; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] as ScannedDocument[];
    throw error;
  }

  const files = entries.filter((entry) => entry.isFile());
  const results: ScannedDocument[] = [];
  const batchSize = 40;

  for (let index = 0; index < files.length; index += batchSize) {
    const batch = files.slice(index, index + batchSize);
    const stats = await Promise.all(
      batch.map(async (entry): Promise<ScannedDocument | null> => {
        const absolutePath = path.join(directory, entry.name);
        const stat = await fs.stat(absolutePath);
        if (modifiedSince && stat.mtime < modifiedSince && stat.birthtime < modifiedSince) return null;
        return {
          accountId,
          kind: folder as KnowledgeDocumentKind,
          name: entry.name,
          storageKey: toStorageKey(absolutePath),
          mimeType: mimeTypeFor(entry.name),
          byteSize: stat.size,
          sourceCreatedAt: stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime,
          sourceModifiedAt: stat.mtime,
          sourceJobId,
        } satisfies ScannedDocument;
      })
    );
    results.push(...stats.filter((entry): entry is ScannedDocument => entry !== null));
  }

  return results;
}

export async function syncKnowledgeDocuments({
  account,
  folder,
  sourceJobId = null,
  modifiedSince,
  removeMissing = false,
}: {
  account: StorageAccount;
  folder: KnowledgeFolder;
  sourceJobId?: string | null;
  modifiedSince?: Date;
  removeMissing?: boolean;
}) {
  const documentsByName = new Map<string, ScannedDocument>();
  for (const directory of getKnowledgeSourceDirectories(account, folder)) {
    const documents = await scanDirectory(
      account.id,
      folder,
      directory,
      sourceJobId,
      modifiedSince
    );
    for (const document of documents) documentsByName.set(document.name, document);
  }

  const documents = Array.from(documentsByName.values());
  const batchSize = 100;
  for (let index = 0; index < documents.length; index += batchSize) {
    const batch = documents.slice(index, index + batchSize);
    await prisma.$transaction(
      batch.map((document) =>
        prisma.knowledgeDocument.upsert({
          where: {
            accountId_kind_name: {
              accountId: account.id,
              kind: folder as KnowledgeDocumentKind,
              name: document.name,
            },
          },
          create: document,
          update: {
            storageKey: document.storageKey,
            mimeType: document.mimeType,
            byteSize: document.byteSize,
            sourceCreatedAt: document.sourceCreatedAt,
            sourceModifiedAt: document.sourceModifiedAt,
            ...(sourceJobId ? { sourceJobId } : {}),
          },
        })
      )
    );
  }

  if (removeMissing && !modifiedSince) {
    const names = documents.map((document) => document.name);
    await prisma.knowledgeDocument.deleteMany({
      where: {
        accountId: account.id,
        kind: folder as KnowledgeDocumentKind,
        ...(names.length ? { name: { notIn: names } } : {}),
      },
    });
  }

  return documents;
}

export async function ensureKnowledgeDocumentsIndexed(
  account: StorageAccount,
  folder: KnowledgeFolder
) {
  const key = `${account.id}:${folder}`;
  if (indexedScopes.has(key)) return;
  const existingRefresh = indexRefreshes.get(key);
  if (existingRefresh) return existingRefresh;

  const refresh = (async () => {
    const count = await prisma.knowledgeDocument.count({
      where: { accountId: account.id, kind: folder as KnowledgeDocumentKind },
    });
    if (count === 0) {
      await syncKnowledgeDocuments({ account, folder, removeMissing: true });
    }
    indexedScopes.add(key);
  })().finally(() => indexRefreshes.delete(key));

  indexRefreshes.set(key, refresh);
  return refresh;
}

export async function listAccountKnowledgeDocuments({
  account,
  folder,
  page = 1,
  limit = 20,
  search = "",
  orderBy = "name",
}: {
  account: StorageAccount;
  folder: KnowledgeFolder;
  page?: number;
  limit?: number;
  search?: string;
  orderBy?: "name" | "updated";
}) {
  await ensureKnowledgeDocumentsIndexed(account, folder);
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safePage = Math.max(1, page);
  const where = {
    accountId: account.id,
    kind: folder as KnowledgeDocumentKind,
    ...(search.trim()
      ? { name: { contains: search.trim(), mode: "insensitive" as const } }
      : {}),
  };

  const [documents, total] = await Promise.all([
    prisma.knowledgeDocument.findMany({
      where,
      orderBy:
        orderBy === "updated"
          ? [{ sourceModifiedAt: "desc" as const }, { name: "asc" as const }]
          : { name: "asc" as const },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    prisma.knowledgeDocument.count({ where }),
  ]);

  return { documents, total, page: safePage, pageSize: safeLimit };
}
