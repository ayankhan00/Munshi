import { prisma } from "@/lib/db";

export async function logAudit(event: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        userId: event.userId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        before: event.before ? JSON.stringify(event.before) : null,
        after: event.after ? JSON.stringify(event.after) : null,
        reason: event.reason,
      },
    });
  } catch {
    // Audit logging must never break the primary operation.
  }
}