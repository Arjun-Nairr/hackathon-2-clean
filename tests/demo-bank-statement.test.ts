import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENTS, PROFILE } from '../db/seed-data';
import { demoBankStatement as statement } from '../src/lib/demo-bank-statement';

test('demo statement reconciles to the seeded closing balance', () => {
  const closing = statement.transactions.reduce<number>(
    (balance, transaction) => balance + (transaction.credit ?? 0) - (transaction.debit ?? 0),
    statement.openingBalance,
  );

  assert.equal(closing, statement.closingBalance);
  assert.equal(statement.openingBalance, PROFILE.openingBalance);
  assert.equal(statement.transactions.length, EVENTS.length);
  EVENTS.forEach((event, index) => {
    const transaction = statement.transactions[index];
    assert.equal(transaction.date, `${String(event.day).padStart(2, '0')} Sep`);
    assert.equal(transaction.description, event.label);
    assert.equal(transaction.credit ?? transaction.debit, event.amount);
    assert.equal(transaction.credit !== null, event.kind === 'income');
    assert.equal(transaction.status, event.status);
    const expectedBalance = statement.openingBalance + EVENTS.slice(0, index + 1).reduce(
      (balance, item) => balance + (item.kind === 'income' ? item.amount : -item.amount),
      0,
    );
    assert.equal(transaction.balance, expectedBalance);
  });
});
