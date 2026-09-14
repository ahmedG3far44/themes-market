import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import UserModel, { type UserDocument } from "../models/user.ts";
import { AppError, errors } from "../utils/app-error.ts";

declare global {
  namespace Express {
    interface Request {
      currentUser?: HydratedDocument<UserDocument>;
    }
  }
}

function clerkAuthenticationError(req: Request, res: Response): AppError {
  const hasBearerToken = /^Bearer\s+\S+$/i.test(req.get("authorization") ?? "");
  if (!hasBearerToken) {
    return new AppError(401, "AUTH_TOKEN_MISSING", "Your Clerk session token was not sent. Refresh the page and retry");
  }

  const clerkReason = String(res.getHeader("x-clerk-auth-reason") ?? "token-rejected");
  const clerkMessage = String(res.getHeader("x-clerk-auth-message") ?? "Clerk could not verify the session token");
  console.warn(JSON.stringify({
    level: "warn",
    event: "clerk_auth_rejected",
    path: req.path,
    origin: req.get("origin") ?? null,
    clerkReason,
    clerkMessage,
  }));
  return new AppError(401, "AUTH_TOKEN_REJECTED", `Clerk rejected the session token: ${clerkMessage}`, [], { clerkReason });
}

export function requireClerkAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth.isAuthenticated || !auth.userId) {
    return next(clerkAuthenticationError(req, res));
  }
  next();
}

export async function requireDatabaseUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = getAuth(req);
    if (!auth.isAuthenticated || !auth.userId) {
      return next(clerkAuthenticationError(req, res));
    }
    const { userId } = auth;
    const user = await UserModel.findOne({ clerkId: userId });
    if (!user) {
      return next(new AppError(401, "ACCOUNT_NOT_SYNCED", "Your signed-in account is not initialized. Refresh the page and try again"));
    }
    if (user.status === "blocked") {
      return next(errors.blocked());
    }
    req.currentUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.currentUser?.role !== "admin") {
    return next(errors.forbidden());
  }
  next();
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction): void {
  if (req.currentUser?.role === "admin") {
    return next(new AppError(403, "ADMIN_PURCHASE_FORBIDDEN", "Administrator accounts cannot purchase themes"));
  }
  next();
}
