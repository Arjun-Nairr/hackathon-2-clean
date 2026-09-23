// Minimal request/response shape, structurally satisfied by both Vercel's
// Node function types (VercelRequest/VercelResponse) and Express's
// Request/Response. Handlers are written once against this and run
// unmodified under either — no @vercel/node dependency needed for that.
export interface ApiRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
}

export function sendError(res: ApiResponse, status: number, message: string): void {
  res.status(status).json({ error: message });
}
