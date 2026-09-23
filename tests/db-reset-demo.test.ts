import { config } from "dotenv";
config({ path: ".env.local" });

import { test } from "node:test";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../api/_lib/env";
import { EVENTS, PROFILE } from "../db/seed-data";
import { resetDemoData } from "../db/reset-demo-core";

// Dirties the demo data the way a rehearsal would (one extra event, one
// stray draft), then runs the same resetDemoData a rehearsal/judging pass
// would use. Because the reset IS the test's own cleanup, the database is
// left in the exact canonical state both before and after this test runs
// — nothing needs a separate finally-block restore.
test("resetDemoData removes extra events and draft rows and restores exactly the 7 canonical events, repeatably", async () => {
  const sql = neon(getDatabaseUrl());

  await sql`
    insert into calendar_events (profile_id, id, label, amount, day, kind, payment_type, status, confidence, amount_type, account_name, reviewed, note, recurring, recurrence_interval_months, month_offset)
    values (${PROFILE.id}, 'reset-test-extra-event', 'Reset test extra event', 1, 1, 'commitment', 'other', 'actual', 'high', 'fixed', 'Main current account', true, null, false, 1, 0)
    on conflict (profile_id, id) do nothing
  `;
  await sql`
    insert into calendar_drafts (draft_id, profile_id, source_message_id, action, target_event_id, payload, status)
    values ('reset-test-draft', ${PROFILE.id}, 'reset-test-msg', 'delete', 'reset-test-extra-event', ${JSON.stringify({
      draft_id: 'reset-test-draft',
      action: 'delete',
      target_event_id: 'reset-test-extra-event',
      reason: 'test',
      requires_confirmation: true,
      source_message_id: 'reset-test-msg',
    })}::jsonb, 'pending')
    on conflict (draft_id) do nothing
  `;

  const dirtyEvents = await sql`select id from calendar_events where profile_id = ${PROFILE.id}`;
  assert.ok(dirtyEvents.some((e) => e.id === "reset-test-extra-event"), "setup: extra event should exist before reset");

  const result = await resetDemoData(sql);

  assert.equal(result.finalEventCount, EVENTS.length);
  assert.ok(result.removedEvents >= 1);
  assert.ok(result.removedDrafts >= 1);

  const finalEvents = await sql`select id from calendar_events where profile_id = ${PROFILE.id} order by id`;
  assert.deepEqual(
    finalEvents.map((e) => e.id).sort(),
    [...EVENTS.map((e) => e.id)].sort(),
  );

  const remainingDrafts = await sql`select 1 from calendar_drafts where profile_id = ${PROFILE.id}`;
  assert.equal(remainingDrafts.length, 0);

  // Repeatable: resetting an already-canonical database is a safe no-op,
  // not an error and not a duplication.
  const secondResult = await resetDemoData(sql);
  assert.equal(secondResult.finalEventCount, EVENTS.length);
  assert.equal(secondResult.removedEvents, 0);
  assert.equal(secondResult.removedDrafts, 0);
});
