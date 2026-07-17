import { AccountStatus } from "@/lib/generated/prisma";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/server/auth";
import { z } from "zod";

const updateAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    status: z.nativeEnum(AccountStatus).optional(),
    suspensionReason: z.string().trim().max(500).nullable().optional(),
    maintenanceMessage: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes provided");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const result = await requireSession(request, {
    platformAdmin: true,
    csrfProtected: true,
    allowInactiveAccount: true,
  });
  if ("response" in result) return result.response;

  const parsed = updateAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid account update" }, { status: 400 });
  }
  const { accountId } = await params;
  const current = await prisma.account.findUnique({ where: { id: accountId } });
  if (!current) return Response.json({ error: "Account not found" }, { status: 404 });
  if (
    current.isPrimary &&
    parsed.data.status !== undefined &&
    parsed.data.status !== AccountStatus.active
  ) {
    return Response.json(
      { error: "The primary environment-managed account must remain active" },
      { status: 400 }
    );
  }

  const data = { ...parsed.data };
  if (data.status === AccountStatus.active) {
    data.suspensionReason = null;
    data.maintenanceMessage = null;
  }
  if (data.status === AccountStatus.suspended) data.maintenanceMessage = null;
  if (data.status === AccountStatus.maintenance) data.suspensionReason = null;

  const account = await prisma.account.update({
    where: { id: accountId },
    data,
    include: { _count: { select: { memberships: true, configurations: true } } },
  });
  return Response.json({ account });
}
