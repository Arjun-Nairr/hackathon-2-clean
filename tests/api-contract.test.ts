import { config } from "dotenv";
import { test } from "node:test";
import assert from "node:assert/strict";
import calendarHandler from "../api/calendar";
import calendarForecastHandler from "../api/calendar-forecast";
import financialSnapshotHandler from "../api/financial-snapshot";
import chatHandler from "../api/chat";
import type { ApiRequest, ApiResponse } from "../api/_lib/http";

config({ path: ".env.local" });

// Integration tests against the real Neon database (via DATABASE_URL in
// .env.local) — run `pnpm run db:migrate && pnpm run db:seed` first.

function fakeResponse() {
  let statusCode = 200;
  let body: unknown;
  const res: ApiResponse = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
    },
  };
  return {
    res,
    status: () => statusCode,
    body: () => body,
  };
}

test("GET /api/calendar returns the Neon-backed calendar with the seeded profile's persona and a computed safe-to-spend", async () => {
  const { res, status, body } = fakeResponse();
  await calendarHandler({ query: {}, body: undefined } as ApiRequest, res);
  assert.equal(status(), 200);
  const data = body() as { persona: string; financialSnapshot: { safeToSpendUntilPayday: number } };
  assert.equal(data.persona, "Rohan Mehta");
  assert.equal(data.financialSnapshot.safeToSpendUntilPayday, 9450);
});

test("GET /api/calendar-forecast returns a 12-month projection with the real lowest point", async () => {
  const { res, status, body } = fakeResponse();
  await calendarForecastHandler({ query: {}, body: undefined } as ApiRequest, res);
  assert.equal(status(), 200);
  const data = body() as { horizonMonths: number; lowestPoint: { balance: number } };
  assert.equal(data.horizonMonths, 12);
  assert.equal(data.lowestPoint.balance, 54450);
});

test("GET /api/financial-snapshot returns just the snapshot sub-object", async () => {
  const { res, status, body } = fakeResponse();
  await financialSnapshotHandler({ query: {}, body: undefined } as ApiRequest, res);
  assert.equal(status(), 200);
  const data = body() as { currentAvailableBalance: number };
  assert.equal(data.currentAvailableBalance, 57250);
});

test("POST /api/chat rejects a malformed body with 400", async () => {
  const { res, status } = fakeResponse();
  await chatHandler({ query: {}, body: { message: "hi" } } as ApiRequest, res);
  assert.equal(status(), 400);
});

test("POST /api/chat declines an unrelated question without calling Gemini", async () => {
  const { res, status, body } = fakeResponse();
  await chatHandler({ query: {}, body: { sessionId: "s1", message: "What's the weather in Dubai?", history: [] } } as ApiRequest, res);
  assert.equal(status(), 200);
  const data = body() as { card: { type: string } };
  assert.equal(data.card.type, "decline");
});

test("POST /api/chat returns a controlled missing-data response for a goal question", async () => {
  const { res, status, body } = fakeResponse();
  await chatHandler({ query: {}, body: { sessionId: "s1", message: "What goals am I on track for?", history: [] } } as ApiRequest, res);
  assert.equal(status(), 200);
  const data = body() as { card: { type: string } };
  assert.equal(data.card.type, "missing_data");
});
