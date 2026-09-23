import { config } from "dotenv";
config({ path: ".env.local" });

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "../api/_lib/db";
import { insertPendingDraft, getDraft, markDraftRejected } from "../api/_lib/drafts-repository";
import { confirmDraft } from "../api/_lib/apply-draft";
import { loadProfileAndEvents } from "../api/_lib/repository";
import type { CalendarChangeDraft, DraftEvent } from "../api/_lib/draft-schema";
import { PROFILE } from "../db/seed-data";

// Integration tests against the real Neon database (DATABASE_URL in
// .env.local). Every test creates its own disposable event(s) with a
// unique name/id and deletes them afterward — none of them touch the 7
// seeded exemplar events that other test files assert exact numbers
// against.

function makeDraft(overrides: Partial<CalendarChangeDraft> & { events?: DraftEvent[] }): CalendarChangeDraft {
  return {
    draft_id: randomUUID(),
    action: "add",
    reason: "test draft",
    requires_confirmation: true,
    source_message_id: `msg-${randomUUID()}`,
    ...overrides,
  };
}

async function cleanupEvent(id: string | undefined) {
  if (!id) return;
  await sql()`delete from calendar_events where profile_id = ${PROFILE.id} and id = ${id}`;
}

async function cleanupDraft(draftId: string) {
  await sql()`delete from calendar_drafts where draft_id = ${draftId}`;
}

test("a pending (unconfirmed) draft causes zero calendar mutations", async () => {
  const before = await loadProfileAndEvents();
  const draft = makeDraft({
    events: [{ name: "Zzz Test Pending Bonus", amount_aed: 999, direction: "credit", date: "2026-09-28", recurrence: "none", category: "bonus" }],
  });
  await insertPendingDraft(PROFILE.id, draft);
  try {
    const stored = await getDraft(draft.draft_id);
    assert.equal(stored?.status, "pending");

    const after = await loadProfileAndEvents();
    assert.equal(after!.events.length, before!.events.length);
    assert.ok(!after!.events.some((e) => e.label === "Zzz Test Pending Bonus"));
  } finally {
    await cleanupDraft(draft.draft_id);
  }
});

test("chat text alone cannot confirm a draft — only apply-draft's confirmDraft (called by the confirm endpoint) can", () => {
  const path = fileURLToPath(new URL("../api/_lib/chat.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  assert.ok(!source.includes("apply-draft"), "chat.ts must never import the confirm-and-apply logic");
  assert.ok(!source.includes("confirmDraft"), "chat.ts must never call confirmDraft directly");
});

test("a rejected draft cannot later be confirmed, and repeated rejection is safe", async () => {
  const draft = makeDraft({
    events: [{ name: "Zzz Test Rejected Expense", amount_aed: 50, direction: "debit", date: "2026-09-28", recurrence: "none", category: "other" }],
  });
  await insertPendingDraft(PROFILE.id, draft);
  try {
    await markDraftRejected(draft.draft_id);
    await markDraftRejected(draft.draft_id); // repeated — must not error or change anything further

    const stored = await getDraft(draft.draft_id);
    assert.equal(stored?.status, "rejected");

    const outcome = await confirmDraft(draft.draft_id, PROFILE.month);
    assert.equal(outcome.outcome, "rejected");

    const rows = await sql()`select 1 from calendar_events where profile_id = ${PROFILE.id} and label = 'Zzz Test Rejected Expense'`;
    assert.equal(rows.length, 0);
  } finally {
    await cleanupDraft(draft.draft_id);
  }
});

test("confirming an 'add' draft (credit, one-time) writes a real income event only through confirmDraft", async () => {
  const draft = makeDraft({
    events: [{ name: "Zzz Test Add Income", amount_aed: 5000, direction: "credit", date: "2026-09-28", recurrence: "none", category: "bonus" }],
  });
  await insertPendingDraft(PROFILE.id, draft);
  let appliedId: string | undefined;
  try {
    const result = await confirmDraft(draft.draft_id, PROFILE.month);
    assert.equal(result.outcome, "confirmed");
    if (result.outcome !== "confirmed") return;
    appliedId = result.appliedEventIds[0];
    assert.equal(result.alreadyApplied, false);

    const rows = await sql()`select * from calendar_events where profile_id = ${PROFILE.id} and id = ${appliedId}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "income");
    assert.equal(Number(rows[0].amount), 5000);
    assert.equal(rows[0].recurring, false);
    assert.equal(Number(rows[0].month_offset), 0);

    const stored = await getDraft(draft.draft_id);
    assert.equal(stored?.status, "confirmed");
  } finally {
    await cleanupEvent(appliedId);
    await cleanupDraft(draft.draft_id);
  }
});

test("confirming an 'add' draft (debit, monthly, starting next month) writes a commitment with recurrence_interval_months=1 and the right month_offset", async () => {
  const draft = makeDraft({
    events: [{ name: "Zzz Test Add Monthly Expense", amount_aed: 1200, direction: "debit", date: "2026-10-01", recurrence: "monthly", category: "other" }],
  });
  await insertPendingDraft(PROFILE.id, draft);
  let appliedId: string | undefined;
  try {
    const result = await confirmDraft(draft.draft_id, PROFILE.month);
    assert.equal(result.outcome, "confirmed");
    if (result.outcome !== "confirmed") return;
    appliedId = result.appliedEventIds[0];

    const rows = await sql()`select * from calendar_events where profile_id = ${PROFILE.id} and id = ${appliedId}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "commitment");
    assert.equal(rows[0].recurring, true);
    assert.equal(Number(rows[0].recurrence_interval_months), 1);
    assert.equal(Number(rows[0].day), 1);
    assert.equal(Number(rows[0].month_offset), 1);
  } finally {
    await cleanupEvent(appliedId);
    await cleanupDraft(draft.draft_id);
  }
});

test("quarterly and yearly recurrence map to recurrence_interval_months 3 and 12", async () => {
  const quarterly = makeDraft({
    events: [{ name: "Zzz Test Quarterly", amount_aed: 300, direction: "debit", date: "2026-09-15", recurrence: "quarterly", category: "other" }],
  });
  const yearly = makeDraft({
    events: [{ name: "Zzz Test Yearly", amount_aed: 400, direction: "debit", date: "2026-09-15", recurrence: "yearly", category: "other" }],
  });
  await insertPendingDraft(PROFILE.id, quarterly);
  await insertPendingDraft(PROFILE.id, yearly);
  let quarterlyId: string | undefined;
  let yearlyId: string | undefined;
  try {
    const quarterlyResult = await confirmDraft(quarterly.draft_id, PROFILE.month);
    const yearlyResult = await confirmDraft(yearly.draft_id, PROFILE.month);
    assert.equal(quarterlyResult.outcome, "confirmed");
    assert.equal(yearlyResult.outcome, "confirmed");
    if (quarterlyResult.outcome !== "confirmed" || yearlyResult.outcome !== "confirmed") return;
    quarterlyId = quarterlyResult.appliedEventIds[0];
    yearlyId = yearlyResult.appliedEventIds[0];

    const quarterlyRow = (await sql()`select recurrence_interval_months from calendar_events where profile_id = ${PROFILE.id} and id = ${quarterlyId}`)[0];
    const yearlyRow = (await sql()`select recurrence_interval_months from calendar_events where profile_id = ${PROFILE.id} and id = ${yearlyId}`)[0];
    assert.equal(Number(quarterlyRow.recurrence_interval_months), 3);
    assert.equal(Number(yearlyRow.recurrence_interval_months), 12);
  } finally {
    await cleanupEvent(quarterlyId);
    await cleanupEvent(yearlyId);
    await cleanupDraft(quarterly.draft_id);
    await cleanupDraft(yearly.draft_id);
  }
});

test("an 'update' draft only changes the target event, and only once confirmed", async () => {
  const addDraft = makeDraft({
    events: [{ name: "Zzz Test Update Target", amount_aed: 100, direction: "debit", date: "2026-09-15", recurrence: "none", category: "other" }],
  });
  await insertPendingDraft(PROFILE.id, addDraft);
  let targetId: string | undefined;
  let updateDraftId: string | undefined;
  try {
    const addResult = await confirmDraft(addDraft.draft_id, PROFILE.month);
    assert.equal(addResult.outcome, "confirmed");
    if (addResult.outcome !== "confirmed") return;
    targetId = addResult.appliedEventIds[0];

    const updateDraft = makeDraft({
      action: "update",
      target_event_id: targetId,
      events: [{ name: "Zzz Test Update Target", amount_aed: 250, direction: "debit", date: "2026-09-15", recurrence: "none", category: "other" }],
    });
    updateDraftId = updateDraft.draft_id;
    await insertPendingDraft(PROFILE.id, updateDraft);

    const beforeUpdate = await sql()`select amount from calendar_events where profile_id = ${PROFILE.id} and id = ${targetId}`;
    assert.equal(Number(beforeUpdate[0].amount), 100, "must be unchanged before confirmation");

    const updateResult = await confirmDraft(updateDraft.draft_id, PROFILE.month);
    assert.equal(updateResult.outcome, "confirmed");

    const afterUpdate = await sql()`select amount from calendar_events where profile_id = ${PROFILE.id} and id = ${targetId}`;
    assert.equal(Number(afterUpdate[0].amount), 250);
  } finally {
    await cleanupEvent(targetId);
    await cleanupDraft(addDraft.draft_id);
    if (updateDraftId) await cleanupDraft(updateDraftId);
  }
});

test("a 'delete' draft removes the target event only once confirmed, and confirming it twice is idempotent (no error, no re-delete)", async () => {
  const addDraft = makeDraft({
    events: [{ name: "Zzz Test Delete Target", amount_aed: 75, direction: "debit", date: "2026-09-15", recurrence: "none", category: "other" }],
  });
  await insertPendingDraft(PROFILE.id, addDraft);
  let targetId: string | undefined;
  let deleteDraftId: string | undefined;
  try {
    const addResult = await confirmDraft(addDraft.draft_id, PROFILE.month);
    assert.equal(addResult.outcome, "confirmed");
    if (addResult.outcome !== "confirmed") return;
    targetId = addResult.appliedEventIds[0];

    const deleteDraft = makeDraft({ action: "delete", target_event_id: targetId });
    deleteDraftId = deleteDraft.draft_id;
    await insertPendingDraft(PROFILE.id, deleteDraft);

    const firstConfirm = await confirmDraft(deleteDraft.draft_id, PROFILE.month);
    assert.equal(firstConfirm.outcome, "confirmed");
    if (firstConfirm.outcome === "confirmed") assert.equal(firstConfirm.alreadyApplied, false);

    const afterFirstDelete = await sql()`select 1 from calendar_events where profile_id = ${PROFILE.id} and id = ${targetId}`;
    assert.equal(afterFirstDelete.length, 0);

    // Idempotent second confirm: draft is already 'confirmed', so this must
    // short-circuit rather than attempt the delete again.
    const secondConfirm = await confirmDraft(deleteDraft.draft_id, PROFILE.month);
    assert.equal(secondConfirm.outcome, "confirmed");
    if (secondConfirm.outcome === "confirmed") assert.equal(secondConfirm.alreadyApplied, true);
  } finally {
    await cleanupEvent(targetId);
    await cleanupDraft(addDraft.draft_id);
    if (deleteDraftId) await cleanupDraft(deleteDraftId);
  }
});
