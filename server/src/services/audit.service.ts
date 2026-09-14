import type { Request } from "express";
import { AuditLogModel } from "../models/operations.ts";

export async function audit(req: Request, action: string, resourceType: string, resourceId: string, before?: unknown, after?: unknown): Promise<void> {
  if (!req.currentUser) return;
  await AuditLogModel.create({
    actorId: req.currentUser._id,
    action,
    resourceType,
    resourceId,
    before,
    after,
    requestId: req.requestId,
  });
}
