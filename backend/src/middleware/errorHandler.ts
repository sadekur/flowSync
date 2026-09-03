import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";
import { isProduction } from "../config/env";

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

// 4-arg signature is required — Express identifies error middleware by arity.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const message = err instanceof Error ? err.message : "Internal Server Error";

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.path} failed`, err);
  }

  res.status(statusCode).json({
    error: statusCode >= 500 && isProduction ? "Internal Server Error" : message,
  });
}
