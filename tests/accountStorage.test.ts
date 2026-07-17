import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  getAccountScrapeLogRoot,
  getPrivateKnowledgeDirectory,
  resolveKnowledgeStorageKey,
  toStorageKey,
} from "@/lib/server/accountStorage";

test("account storage roots are isolated by account id", () => {
  const first = getPrivateKnowledgeDirectory("account-one", "knowledge_base");
  const second = getPrivateKnowledgeDirectory("account-two", "knowledge_base");
  assert.notEqual(first, second);
  assert.notEqual(getAccountScrapeLogRoot("account-one"), getAccountScrapeLogRoot("account-two"));
});

test("tenant knowledge resolver rejects another account's storage key", () => {
  const otherAccountFile = path.join(
    getPrivateKnowledgeDirectory("account-two", "knowledge_base"),
    "private.md"
  );
  assert.throws(
    () =>
      resolveKnowledgeStorageKey(
        toStorageKey(otherAccountFile),
        { id: "account-one", isPrimary: false },
        "knowledge_base"
      ),
    /outside this account's storage boundary/u
  );
});

test("legacy public knowledge is available only to the primary account", () => {
  const legacyFile = path.join(process.cwd(), "public", "knowledge_base", "legacy.md");
  const storageKey = toStorageKey(legacyFile);
  assert.equal(
    resolveKnowledgeStorageKey(
      storageKey,
      { id: "primary-account", isPrimary: true },
      "knowledge_base"
    ),
    path.resolve(legacyFile)
  );
  assert.throws(() =>
    resolveKnowledgeStorageKey(
      storageKey,
      { id: "tenant-account", isPrimary: false },
      "knowledge_base"
    )
  );
});
