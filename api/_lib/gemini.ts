import { getGeminiApiKey } from './env.js';

// Direct REST calls (no SDK dependency) to one Gemini Flash-class model.
// Bounded input (system+context+history truncated before this is called),
// bounded output (maxOutputTokens), and a hard timeout via AbortController.
const MODEL = 'gemini-flash-latest';
const TIMEOUT_MS = 15_000;
// This model spends a variable, sometimes large, share of its output budget
// on internal "thinking" tokens before writing the visible answer — a small
// budget here truncates the reply before any text appears. 1024 comfortably
// covers both for the short answers this app asks for.
const MAX_OUTPUT_TOKENS = 1024;

// `retryable` marks a transient failure (timeout, network failure, 429, or
// 5xx) worth one retry of the same model turn — never a validation/
// number-guard failure or an ordinary 4xx, which mean the request itself
// was bad and would fail identically again.
export class GeminiError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: { name: string; response: Record<string, unknown> };
}

// This deployment's model (gemini-flash-latest -> a Gemini 3.x build) only
// accepts USER/MODEL roles — sending a tool result back with the
// conventional "function" role fails with a 400 ("Role 'function' is not
// supported"). Its function-response turns go back as role "user" instead,
// same as a normal user turn, just with a functionResponse part.
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

async function generateContentOnce(systemInstruction: string, contents: GeminiContent[], tools?: GeminiToolDeclaration[]): Promise<GeminiContent> {
  const apiKey = getGeminiApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.2 },
    };
    if (tools && tools.length > 0) {
      body.tools = [{ functionDeclarations: tools }];
      body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        // The key travels as a header, never in the URL: query strings end
        // up in server access logs, proxy logs, and browser/tool history.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new GeminiError(`Gemini request failed: ${response.status} ${errBody.slice(0, 300)}`, isRetryableStatus(response.status));
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new GeminiError('Gemini returned no content.');
    }
    return { role: 'model', parts };
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GeminiError(`Gemini request timed out after ${TIMEOUT_MS}ms.`, true);
    }
    // Anything else reaching here is a raw fetch/network failure (or a
    // malformed response) rather than a Gemini-issued error — retryable.
    throw new GeminiError(err instanceof Error ? err.message : String(err), true);
  } finally {
    clearTimeout(timeout);
  }
}

// One retry, of the same model turn only. This wraps a single request/
// response round trip to Gemini — it runs before the caller ever decides
// whether to execute a tool, so a retry here can never re-run a tool call
// or create a second draft (see chat.ts's loop, which only sees the final
// GeminiContent this returns).
async function generateContent(systemInstruction: string, contents: GeminiContent[], tools?: GeminiToolDeclaration[]): Promise<GeminiContent> {
  try {
    return await generateContentOnce(systemInstruction, contents, tools);
  } catch (err) {
    if (err instanceof GeminiError && err.retryable) {
      return generateContentOnce(systemInstruction, contents, tools);
    }
    throw err;
  }
}

// One turn of a (possibly tool-using) conversation. Returns the model's
// content — either final text, or a functionCall the caller must execute
// server-side and feed back in before calling this again.
export async function callGemini(systemInstruction: string, contents: GeminiContent[], tools?: GeminiToolDeclaration[]): Promise<GeminiContent> {
  return generateContent(systemInstruction, contents, tools);
}

// Simple, tool-free single turn — kept for callers (and tests) that only
// need "system instruction in, text out".
export async function askGemini(systemInstruction: string, userMessage: string): Promise<string> {
  const content = await generateContent(systemInstruction, [{ role: 'user', parts: [{ text: userMessage }] }]);
  const text = content.parts.map((p) => p.text ?? '').join('').trim();
  if (!text) {
    throw new GeminiError('Gemini returned no text content.');
  }
  return text;
}
