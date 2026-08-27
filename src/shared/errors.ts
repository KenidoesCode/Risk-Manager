/**
 * Structured error contract.
 *
 * Every failure crossing an API or module boundary is an `AppError`. Internal
 * stack traces never reach a caller. The `details` object is curated per code
 * and contains only what the caller is entitled to see.
 */

export const ERROR_CODES = [
  "ENTITY_NOT_FOUND",
  "CLUSTER_NOT_FOUND",
  "DETECTION_RUN_NOT_FOUND",
  "GRAPH_NOT_BUILT",
  "GRAPH_TOO_SPARSE",
  "DETECTION_FAILED",
  "EXPLAINER_UNAVAILABLE",
  "EXPLAINER_TIMEOUT",
  "EXPLAINER_MALFORMED",
  "EXPLAINER_SCHEMA_INVALID",
  "EXPLANATION_UNGROUNDED",
  "ENFORCEMENT_REFUSED",
  "EVASION_REQUEST_REFUSED",
  "PII_REJECTED",
  "EVALUATION_NOT_FOUND",
  "SPLIT_INVALID",
  "REVIEW_NOT_FOUND",
  "REVIEW_ALREADY_DECIDED",
  "IDEMPOTENCY_CONFLICT",
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const HTTP_STATUS: Record<ErrorCode, number> = {
  ENTITY_NOT_FOUND: 404,
  CLUSTER_NOT_FOUND: 404,
  DETECTION_RUN_NOT_FOUND: 404,
  GRAPH_NOT_BUILT: 409,
  GRAPH_TOO_SPARSE: 422,
  DETECTION_FAILED: 500,
  EXPLAINER_UNAVAILABLE: 503,
  EXPLAINER_TIMEOUT: 504,
  EXPLAINER_MALFORMED: 502,
  EXPLAINER_SCHEMA_INVALID: 502,
  EXPLANATION_UNGROUNDED: 422,
  ENFORCEMENT_REFUSED: 403,
  EVASION_REQUEST_REFUSED: 403,
  PII_REJECTED: 400,
  IDEMPOTENCY_CONFLICT: 409,
  EVALUATION_NOT_FOUND: 404,
  SPLIT_INVALID: 400,
  REVIEW_NOT_FOUND: 404,
  REVIEW_ALREADY_DECIDED: 409,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export type ErrorDetails = Record<string, unknown>;

export interface SerializedError {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
    correlationId?: string;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;
  readonly correlationId: string | undefined;
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: ErrorDetails;
      correlationId?: string;
      cause?: unknown;
      retryable?: boolean;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.details = options.details;
    this.correlationId = options.correlationId;
    this.retryable = options.retryable ?? false;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code] ?? 500;
  }

  toJSON(): SerializedError {
    const payload: SerializedError["error"] = { code: this.code, message: this.message };
    if (this.details) payload.details = this.details;
    if (this.correlationId) payload.correlationId = this.correlationId;
    return { error: payload };
  }

  withCorrelation(correlationId: string): AppError {
    return new AppError(this.code, this.message, {
      details: this.details,
      correlationId,
      cause: this.cause,
      retryable: this.retryable,
    });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Converts anything thrown into a safe, serialisable error. */
export function toAppError(value: unknown, correlationId?: string): AppError {
  if (isAppError(value)) {
    return correlationId && !value.correlationId ? value.withCorrelation(correlationId) : value;
  }
  return new AppError("INTERNAL_ERROR", "An unexpected internal error occurred.", {
    correlationId,
    cause: value,
  });
}

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code] ?? 500;
}
