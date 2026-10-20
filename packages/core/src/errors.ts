export const SERVICE_ERROR_CODES = [
  "validation",
  "not_found",
  "conflict",
  "unauthorized",
  "forbidden_origin",
  "unsupported_media",
  "immutable",
] as const;

export type ServiceErrorCode = (typeof SERVICE_ERROR_CODES)[number];

export const serviceErrorStatus: Record<ServiceErrorCode, number> = {
  validation: 400,
  not_found: 404,
  conflict: 409,
  unauthorized: 401,
  forbidden_origin: 403,
  unsupported_media: 415,
  immutable: 409,
};

export class ServiceError extends Error {
  readonly status: number;

  constructor(
    readonly code: ServiceErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
    this.status = serviceErrorStatus[code];
  }
}

export type ServiceErrorBody = {
  error: {
    code: ServiceErrorCode;
    message: string;
    details?: unknown;
  };
};

export function serviceErrorBody(error: ServiceError): ServiceErrorBody {
  const body: ServiceErrorBody = {
    error: {
      code: error.code,
      message: error.message,
    },
  };
  if (error.details !== undefined) {
    body.error.details = error.details;
  }
  return body;
}
