import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl } from '../api/_lib/env';
import { EVENTS, PROFILE } from './seed-data';

config({ path: '.env.local' });

// Idempotent: every write is `on conflict ... do update`, so running this
// twice leaves the same 1 profile + 7 events, not duplicates.
async function main() {
  const sql = neon(getDatabaseUrl());

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
  console.log(`Seeded profile "${PROFILE.id}" with ${count} calendar events.`);
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
