import { config } from "dotenv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { askGemini, GeminiError } from "../api/_lib/gemini";

config({ path: ".env.local" });

function withSequence<T>(responses: Array<() => Response | Promise<never>>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async () => {
    const respond = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    return respond();
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("a single transient 503 is retried once and the retry's success is returned", async () => {
  let calls = 0;
  await withSequence(
    [
      () => { calls += 1; return new Response("service unavailable", { status: 503 }); },
      () => { calls += 1; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok after retry" }] } }] }), { status: 200 }); },
    ],
    async () => {
      const text = await askGemini("system", "hello");
      assert.equal(text, "ok after retry");
    },
  );
  assert.equal(calls, 2, "expected exactly one retry (two total calls)");
});

test("a 429 is retried once", async () => {
  let calls = 0;
  await withSequence(
    [
      () => { calls += 1; return new Response("rate limited", { status: 429 }); },
      () => { calls += 1; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 }); },
    ],
    () => askGemini("system", "hello"),
  );
  assert.equal(calls, 2);
});

test("a persistent transient failure is retried at most once, then the error surfaces", async () => {
  let calls = 0;
  await withSequence(
    [() => { calls += 1; return new Response("service unavailable", { status: 503 }); }],
    async () => {
      await assert.rejects(() => askGemini("system", "hello"), GeminiError);
    },
  );
  assert.equal(calls, 2, "expected exactly one retry attempt, not an unbounded retry loop");
});

test("an ordinary 4xx (bad request) is never retried", async () => {
  let calls = 0;
  await withSequence(
    [() => { calls += 1; return new Response("bad request", { status: 400 }); }],
    async () => {
      await assert.rejects(() => askGemini("system", "hello"), GeminiError);
    },
  );
  assert.equal(calls, 1, "a non-retryable 4xx must not be retried");
});

test("a fetch abort (timeout) is retried once", async () => {
  let calls = 0;
  await withSequence(
    [
      () => { calls += 1; const err = new Error("aborted"); err.name = "AbortError"; throw err; },
      () => { calls += 1; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok after timeout retry" }] } }] }), { status: 200 }); },
    ],
    async () => {
      const text = await askGemini("system", "hello");
      assert.equal(text, "ok after timeout retry");
    },
  );
  assert.equal(calls, 2, "expected the aborted request to be retried exactly once");
});

test("a plain network failure (fetch throws) is retried once", async () => {
  let calls = 0;
  await withSequence(
    [
      () => { calls += 1; throw new Error("fetch failed"); },
      () => { calls += 1; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok after network retry" }] } }] }), { status: 200 }); },
    ],
    async () => {
      const text = await askGemini("system", "hello");
      assert.equal(text, "ok after network retry");
    },
  );
  assert.equal(calls, 2);
});
