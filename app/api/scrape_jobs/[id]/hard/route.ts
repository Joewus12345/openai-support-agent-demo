import fs from "fs";
import path from "path";

import prisma from "@/lib/prisma";
import { AgentRole, ScrapeJobStatus } from "@/lib/generated/prisma";
import { requireScrapeSession } from "../../helpers";
import {
  getAccountScrapeLogRoot,
  getLegacyScrapeLogRoot,
} from "@/lib/server/accountStorage";

async function removeIfWithinBase(target: string | null | undefined, base: string, options?: fs.RmOptions) {
  if (!target) return;
  const resolved = path.resolve(target);
  const relative = path.relative(path.resolve(base), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;

  try {
    await fs.promises.rm(resolved, { force: true, ...options });
  } catch (error) {
    console.warn(`Failed to remove ${resolved}:`, error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireScrapeSession(request, {
    role: AgentRole.admin,
    csrf: true,
  });
  if ("response" in authResult) return authResult.response;

  const { id } = await params;

  const jobWhere = { accountId_id: { accountId: authResult.accountId, id } };
  const job = await prisma.scrapeJob.findUnique({ where: jobWhere });
  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), { status: 404 });
  }

  const accountLogRoot = getAccountScrapeLogRoot(authResult.accountId);
  const defaultLogPath = path.join(accountLogRoot, `${job.id}.log`);
  const runLogDirectory = path.join(accountLogRoot, job.id);

  await prisma.scrapeJob.delete({ where: jobWhere });

  const cleanup = [
    removeIfWithinBase(job.logPath, accountLogRoot),
    removeIfWithinBase(defaultLogPath, accountLogRoot),
    removeIfWithinBase(runLogDirectory, accountLogRoot, { recursive: true }),
  ];
  if (authResult.session.account?.isPrimary) {
    cleanup.push(removeIfWithinBase(job.logPath, getLegacyScrapeLogRoot()));
  }
  await Promise.all(cleanup);

  return new Response(
    JSON.stringify({ status: ScrapeJobStatus.canceled, deleted: true, id: job.id }),
    { status: 200 }
  );
}
