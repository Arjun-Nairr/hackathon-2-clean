import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildGoal,
  initialGoals,
  persistGoalsToProfile,
  readGoalsFromProfile,
  type Goal,
} from '../src/pages/goals';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const profileKey = 'bayzati-profile';

test('demo goals appear when no saved profile exists', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readGoalsFromProfile(storage), initialGoals);
});

test('the first goal change initializes a complete local profile, not a goals-only object', () => {
  const storage = new MemoryStorage();
  persistGoalsToProfile(storage, initialGoals.slice(1));

  const profile = JSON.parse(storage.getItem(profileKey) ?? '{}') as Record<string, unknown>;
  for (const field of ['country', 'emirate', 'employment', 'householdType', 'basicSalary', 'availableBalance', 'commitments', 'bufferPreference', 'bufferAmount']) {
    assert.ok(field in profile, `${field} should be initialized`);
  }
  assert.deepEqual(profile.goals, initialGoals.slice(1));
});

test('adding a goal persists it without replacing unrelated profile fields', () => {
  const storage = new MemoryStorage();
  storage.setItem(profileKey, JSON.stringify({ emirate: 'Dubai', adults: 2, goals: [] }));
  const goal = buildGoal('Emergency trip', '12000', '2027-02-10', 0);
  assert.ok(goal);

  persistGoalsToProfile(storage, [goal]);

  const profile = JSON.parse(storage.getItem(profileKey) ?? '{}') as Record<string, unknown>;
  assert.equal(profile.emirate, 'Dubai');
  assert.equal(profile.adults, 2);
  assert.deepEqual(readGoalsFromProfile(storage), [goal]);
});

test('deleting a goal remains deleted after the profile is read again', () => {
  const storage = new MemoryStorage();
  const extra: Goal = {
    id: 'goal-extra',
    name: 'Emergency trip',
    detail: 'A goal you chose for your future self',
    saved: 0,
    target: 12_000,
    date: '2027-02-10',
    tint: 'berry',
    priority: 'medium',
  };
  persistGoalsToProfile(storage, [...initialGoals, extra]);
  persistGoalsToProfile(storage, readGoalsFromProfile(storage).filter((goal) => goal.id !== extra.id));

  assert.equal(readGoalsFromProfile(storage).some((goal) => goal.id === extra.id), false);
});

test('a malformed saved profile is never overwritten with incomplete data', () => {
  const storage = new MemoryStorage();
  storage.setItem(profileKey, '{not-valid-json');

  assert.throws(() => persistGoalsToProfile(storage, initialGoals));
  assert.equal(storage.getItem(profileKey), '{not-valid-json');
});

test('empty, invalid and non-positive goal inputs cannot create a goal', () => {
  assert.equal(buildGoal('', '1000', '2027-02-10', 0), null);
  assert.equal(buildGoal('Trip', '0', '2027-02-10', 0), null);
  assert.equal(buildGoal('Trip', 'not-a-number', '2027-02-10', 0), null);
  assert.equal(buildGoal('Trip', '1000', '', 0), null);
});

test('Goals page exposes delete and cancel controls and labels persistence honestly', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/pages/goals.tsx', import.meta.url)), 'utf8');
  assert.match(source, /data-testid={`button-delete-goal-\$\{goal\.id\}`}/);
  assert.match(source, /data-testid="button-cancel-create-goal"/);
  assert.match(source, /do not change your calendar or financial forecast/i);
  assert.match(source, /className="grid min-h-11 min-w-11[^\"]*" data-testid={`button-delete-goal-/);
  for (const id of ['input-new-goal-name', 'input-new-goal-target', 'input-new-goal-date']) {
    assert.match(source, new RegExp(`min-h-11[^>]*data-testid="${id}"`));
  }
});
