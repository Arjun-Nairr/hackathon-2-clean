import { config } from "dotenv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { askGemini } from "../api/_lib/gemini";

config({ path: ".env.local" });

// Captures the actual request Gemini's client sends (not just source text)
// so this survives a refactor that keeps the bug but renames things.
// Deliberately never logs or compares against the real key value.
test("askGemini sends the API key via the x-goog-api-key header, never in the URL", async () => {
  const original = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await askGemini("system", "hello");
    assert.ok(capturedUrl, "expected fetch to have been called");
    assert.doesNotMatch(capturedUrl!, /[?&]key=/i, "the request URL must not carry ?key=...");
    assert.ok(capturedHeaders?.has("x-goog-api-key"), "expected an x-goog-api-key header");
    const headerValue = capturedHeaders!.get("x-goog-api-key") ?? "";
    assert.ok(headerValue.length > 0, "expected a non-empty x-goog-api-key header value");
  } finally {
    globalThis.fetch = original;
  }
});

test("a Gemini HTTP error never echoes the API key into the thrown error message", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("unauthorized", { status: 401 })) as typeof fetch;

  try {
    await assert.rejects(() => askGemini("system", "hello"), (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      // The key is never part of what we send back in an error — only
      // Gemini's own response body (here, the literal string "unauthorized").
      return !message.includes("AIza") && message.includes("unauthorized");
    });
  } finally {
    globalThis.fetch = original;
  }
});
