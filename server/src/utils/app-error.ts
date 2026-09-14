export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors: unknown[] = [],
    public extras: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  auth: () => new AppError(401, "AUTH_REQUIRED", "Authentication required"),
  forbidden: () => new AppError(403, "FORBIDDEN", "You do not have permission to perform this action"),
  blocked: () => new AppError(403, "ACCOUNT_BLOCKED", "Your account has been blocked. Contact support."),
  validation: (details: unknown[]) => new AppError(422, "VALIDATION_ERROR", "The request contains invalid data", details),
  notFound: (resource = "Resource") => new AppError(404, `${resource.toUpperCase()}_NOT_FOUND`, `${resource} not found`),
};
