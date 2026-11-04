export const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init)

export const fail = (status: number, error: string, extra?: Record<string, unknown>) =>
  Response.json({ error, ...extra }, { status })

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function readJson<T>(request: Request, maxBytes: number): Promise<T> {
  const text = await request.text()
  if (text.length > maxBytes) throw new HttpError(413, 'body too large')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'invalid JSON')
  }
}

/** An error for the `/v1` surface, which answers `{ error: { code, message } }` (the session `/api` answers a plain string). */
export class ApiError extends HttpError {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(status, message)
  }
}

export const apiFail = (status: number, code: string, message: string, details?: unknown) =>
  Response.json({ error: { code, message, ...(details !== undefined && { details }) } }, { status })
