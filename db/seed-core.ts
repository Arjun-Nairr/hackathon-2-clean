// The one upsert routine for the canonical demo dataset — used by both
// `seed.ts` (first-time / idempotent reseed) and `reset-demo-core.ts`
// (rehearsal cleanup), so the canonical profile+events are defined exactly
// once (in seed-data.ts) and written exactly one way.
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { EVENTS, PROFILE } from './seed-data';

export async function upsertDemoData(sql: NeonQueryFunction<false, false>): Promise<number> {
  await sql`
    insert into profiles (id, name, city, currency, month, month_label, as_of_day, projected_payday, opening_balance, buffer_target)
    values (${PROFILE.id}, ${PROFILE.name}, ${PROFILE.city}, ${PROFILE.currency}, ${PROFILE.month}, ${PROFILE.monthLabel}, ${PROFILE.asOfDay}, ${PROFILE.projectedPayday}, ${PROFILE.openingBalance}, ${PROFILE.bufferTarget})
    on conflict (id) do update set
      name = excluded.name,
      city = excluded.city,
      currency = excluded.currency,
      month = excluded.month,
      month_label = excluded.month_label,
      as_of_day = excluded.as_of_day,
      projected_payday = excluded.projected_payday,
      opening_balance = excluded.opening_balance,
      buffer_target = excluded.buffer_target
  `;

  for (const event of EVENTS) {
    await sql`
      insert into calendar_events (profile_id, id, label, amount, day, kind, payment_type, status, confidence, amount_type, account_name, reviewed, note, recurring, recurrence_interval_months, month_offset)
      values (${PROFILE.id}, ${event.id}, ${event.label}, ${event.amount}, ${event.day}, ${event.kind}, ${event.paymentType}, ${event.status}, ${event.confidence}, ${event.amountType}, ${event.accountName}, ${event.reviewed}, ${event.note}, ${event.recurring}, ${event.recurrenceIntervalMonths}, ${event.monthOffset})
      on conflict (profile_id, id) do update set
        label = excluded.label,
        amount = excluded.amount,
        day = excluded.day,
        kind = excluded.kind,
        payment_type = excluded.payment_type,
        status = excluded.status,
        confidence = excluded.confidence,
        amount_type = excluded.amount_type,
        account_name = excluded.account_name,
        reviewed = excluded.reviewed,
        note = excluded.note,
        recurring = excluded.recurring,
        recurrence_interval_months = excluded.recurrence_interval_months,
        month_offset = excluded.month_offset
    `;
  }

  const [{ count }] = await sql`select count(*)::int as count from calendar_events where profile_id = ${PROFILE.id}`;
  return count as number;
}
