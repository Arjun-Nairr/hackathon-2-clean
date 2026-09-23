import { sql } from './db';
import type { EventRow, ProfileRow } from './finance-engine';

const PROFILE_ID = 'rohan-mehta';

export async function loadProfileAndEvents(): Promise<{ profile: ProfileRow; events: EventRow[] } | null> {
  const db = sql();

  const profileRows = await db`
    select id, name, city, currency, month, month_label, as_of_day, projected_payday, opening_balance, buffer_target
    from profiles where id = ${PROFILE_ID}
  `;
  if (profileRows.length === 0) return null;
  const row = profileRows[0] as Record<string, unknown>;

  const profile: ProfileRow = {
    id: row.id as string,
    name: row.name as string,
    city: row.city as string,
    currency: row.currency as string,
    month: row.month as string,
    monthLabel: row.month_label as string,
    asOfDay: Number(row.as_of_day),
    projectedPayday: Number(row.projected_payday),
    openingBalance: Number(row.opening_balance),
    bufferTarget: Number(row.buffer_target),
  };

  const eventRows = await db`
    select id, label, amount, day, kind, payment_type, status, confidence, amount_type, account_name, reviewed, note, recurring, recurrence_interval_months, month_offset
    from calendar_events where profile_id = ${PROFILE_ID}
  `;

  const events: EventRow[] = eventRows.map((e) => ({
    id: e.id as string,
    label: e.label as string,
    amount: Number(e.amount),
    day: Number(e.day),
    kind: e.kind as EventRow['kind'],
    paymentType: e.payment_type as string,
    status: e.status as EventRow['status'],
    confidence: e.confidence as EventRow['confidence'],
    amountType: e.amount_type as EventRow['amountType'],
    accountName: e.account_name as string,
    reviewed: Boolean(e.reviewed),
    note: (e.note as string | null) ?? null,
    recurring: Boolean(e.recurring),
    recurrenceIntervalMonths: Number(e.recurrence_interval_months),
    monthOffset: Number(e.month_offset),
  }));

  return { profile, events };
}
