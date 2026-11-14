export class RelayerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "RelayerError";
  }

  toBody(): { error: { code: string; message: string } } & Record<string, unknown> {
    return { error: { code: this.code, message: this.message }, ...this.extra };
  }
}

export const badRequest = (code: string, message: string) => new RelayerError(400, code, message);
export const forbidden = (code: string, message: string) => new RelayerError(403, code, message);
export const unauthorized = (code: string, message: string) => new RelayerError(401, code, message);
export const conflict = (code: string, message: string) => new RelayerError(409, code, message);
export const unavailable = (code: string, message: string) => new RelayerError(503, code, message);
