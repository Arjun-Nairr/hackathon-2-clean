import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, classifyIntentWithHistory, isUnderspecifiedAddRequest, type HistoryTurn } from "../api/_lib/intent";

test('"billion" does not match the whole word "bill" — an unrelated question keeps declining', () => {
  assert.equal(classifyIntent("Is a unicorn company worth a billion dirhams?"), "decline");
});

test('a genuine "bill" question is in scope (whole-word match, not a substring)', () => {
  assert.equal(classifyIntent("What bill is due next?"), "read");
});

test("loan-eligibility questions are unavailable, not read or decline", () => {
  assert.equal(classifyIntent("Can I afford a loan?"), "unavailable");
  assert.equal(classifyIntent("What's my loan EMI?"), "unavailable");
});

test("rent-vs-buy questions are unavailable", () => {
  assert.equal(classifyIntent("Should I rent or buy a home?"), "unavailable");
  assert.equal(classifyIntent("Is it better to rent vs buy?"), "unavailable");
});

test("calendar-change verbs at the start of the message classify as calendar_change", () => {
  assert.equal(classifyIntent("Add a one-time AED 5,000 bonus on 28 Sep 2026."), "calendar_change");
  assert.equal(classifyIntent("Add AED 1,200 as a monthly expense starting 1 Oct 2026."), "calendar_change");
  assert.equal(classifyIntent("Change the groceries event to AED 2,500."), "calendar_change");
  assert.equal(classifyIntent("Remove the card minimum event."), "calendar_change");
  assert.equal(classifyIntent("Add school fees."), "calendar_change");
  assert.equal(classifyIntent("Add AED 3,000 rent."), "calendar_change");
  assert.equal(classifyIntent("Add a bonus next month."), "calendar_change");
});

test("a mid-sentence verb does not trigger calendar_change (only the first word does)", () => {
  assert.equal(classifyIntent("What would change my safe-to-spend?"), "read");
});

test('an income-report opener ("I received...") also classifies as calendar_change, even with no imperative verb', () => {
  assert.equal(classifyIntent("I received an AED 8,000 bonus today."), "calendar_change");
  assert.equal(classifyIntent("I got a AED 500 refund yesterday."), "calendar_change");
  assert.equal(classifyIntent("I'm receiving a bonus tomorrow."), "calendar_change");
});

test("a polite/indirect request still classifies as calendar_change without the verb being the very first word", () => {
  assert.equal(classifyIntent("I want to add a bonus"), "calendar_change");
  assert.equal(classifyIntent("Can you add an expense?"), "calendar_change");
  assert.equal(classifyIntent("Please add my salary"), "calendar_change");
  assert.equal(classifyIntent("Help me remove this payment"), "calendar_change");
  assert.equal(classifyIntent("Could you remove the car loan?"), "calendar_change");
});

test("a verb buried mid-sentence, not right after a recognized opener, still does not trigger calendar_change", () => {
  assert.equal(classifyIntent("Could you check if removing Netflix would help my safe-to-spend?"), "read");
  assert.equal(classifyIntent("Can you tell me what would change if I add a bonus?"), "decline");
});

test("a goal question is missing_data", () => {
  assert.equal(classifyIntent("What goals am I on track for?"), "missing_data");
});

test("a read question about safe-to-spend is read", () => {
  assert.equal(classifyIntent("What's safe to spend today?"), "read");
});

test("an unrelated question declines", () => {
  assert.equal(classifyIntent("What's the weather in Dubai today?"), "decline");
});

test("a follow-up answer with no independent signal restores calendar_change from an earlier unresolved add request", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "Could you share the amount in AED, the date, and whether this is one-time or recurring?" },
  ];
  assert.equal(classifyIntentWithHistory("AED 3,000 monthly from 1 October 2026", history), "calendar_change");
});

test("a follow-up choice restores calendar_change from an earlier ambiguous removal", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Remove my payment" },
    { role: "assistant", content: "You have two payment events — the credit card minimum and the car loan installment. Which one did you mean?" },
  ];
  assert.equal(classifyIntentWithHistory("The credit card minimum", history), "calendar_change");
});

test("a message with its own independent signal is never overridden by history (a real topic change is respected)", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "Could you share the amount in AED, the date, and whether this is one-time or recurring?" },
  ];
  assert.equal(classifyIntentWithHistory("What's safe to spend today?", history), "read");
});

test("an unrelated reply is not interpreted as a continuation, even with an open calendar_change thread", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "Could you share the amount in AED, the date, and whether this is one-time or recurring?" },
  ];
  assert.equal(classifyIntentWithHistory("What's the weather in Dubai today?", history), "decline");
  assert.equal(classifyIntentWithHistory("Never mind.", history), "decline");
  assert.equal(classifyIntentWithHistory("Yes, confirm it.", history), "decline");
});

test("a completed draft is not revived later by an unrelated short reply", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "I've prepared a draft to add AED 3,000 monthly school fees starting 1 Oct 2026. Nothing changes until you confirm in the app." },
  ];
  assert.equal(classifyIntentWithHistory("Actually make it AED 3,500", history), "decline");
});

test("the immediately relevant request is used, not an older one further back in history", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "I've prepared a draft to add AED 3,000 monthly school fees. Nothing changes until you confirm in the app." },
    { role: "user", content: "Remove my payment" },
    { role: "assistant", content: "Which one — the credit card minimum or the car loan installment?" },
  ];
  assert.equal(classifyIntentWithHistory("The credit card minimum", history), "calendar_change");
});

test("a multi-round clarification (amount asked, then date asked) still resolves through a partial-answer reply", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "What's the amount?" },
    { role: "user", content: "AED 3,000" },
    { role: "assistant", content: "And what date should it start?" },
  ];
  assert.equal(classifyIntentWithHistory("1 October 2026, monthly", history), "calendar_change");
});

test("an unrelated topic between an old resolved request and a later question is not mistaken for an open thread", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "I've prepared a draft to add AED 3,000 monthly school fees. Nothing changes until you confirm in the app." },
    { role: "user", content: "What's my tightest month?" },
    { role: "assistant", content: "Your tightest month is projected to be March 2027 — want me to look at anything else?" },
  ];
  assert.equal(classifyIntentWithHistory("in September", history), "decline");
});

test('a bare numeric reply ("4000") continues an open amount clarification, not treated as filler', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "What's the amount?" },
  ];
  assert.equal(classifyIntentWithHistory("4000", history), "calendar_change");
});

test('an "AED 4,000" reply continues an open amount clarification', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "What's the amount?" },
  ];
  assert.equal(classifyIntentWithHistory("AED 4,000", history), "calendar_change");
});

test('a date-like reply ("12 September") continues an open date clarification', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "What date should it start?" },
  ];
  assert.equal(classifyIntentWithHistory("12 September", history), "calendar_change");
});

test('a recurrence reply ("monthly") continues an open recurrence clarification', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "Is this one-time or recurring?" },
  ];
  assert.equal(classifyIntentWithHistory("monthly", history), "calendar_change");
});

test("a named event chosen for removal continues an open removal request", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Remove my subscription" },
    { role: "assistant", content: "You have two subscriptions — the gym membership and the streaming service. Which one did you mean?" },
  ];
  assert.equal(classifyIntentWithHistory("the gym membership", history), "calendar_change");
});

test('generic small talk ("hello there") does not revive an open calendar_change thread', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "What's the amount?" },
  ];
  assert.equal(classifyIntentWithHistory("hello there", history), "decline");
});

test('meta-commentary about the conversation ("that sounds confusing") does not revive an open thread', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "What's the amount?" },
  ];
  assert.equal(classifyIntentWithHistory("that sounds confusing", history), "decline");
});

test('a clarification phrased as a statement, not a question ("Please provide the amount and date.") still counts as open', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "Please provide the amount and date." },
  ];
  assert.equal(classifyIntentWithHistory("4000", history), "calendar_change");
});

test("a completed draft is not revived by a numeric-looking reply either", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "I've prepared a draft to add AED 3,000 monthly school fees starting 1 Oct 2026. Nothing changes until you confirm in the app." },
  ];
  assert.equal(classifyIntentWithHistory("4000", history), "decline");
});

test('"Can you add up my bills?" means calculate/summarize, not a write request', () => {
  assert.equal(classifyIntent("Can you add up my bills?"), "read");
});

test("a hypothetical read question about adding something does not mutate", () => {
  assert.equal(classifyIntent("What happens if I add a bonus, would it change my safe-to-spend?"), "read");
});

test("existing natural add/remove requests still work after the correction pass", () => {
  assert.equal(classifyIntent("Add a one-time AED 5,000 bonus on 28 Sep 2026."), "calendar_change");
  assert.equal(classifyIntent("Remove the card minimum event."), "calendar_change");
  assert.equal(classifyIntent("I want to add a bonus"), "calendar_change");
  assert.equal(classifyIntent("Help me remove this payment"), "calendar_change");
});

test('"the gym membership" does not answer an amount clarification (field-specific, not any short phrase)', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "What's the amount?" },
  ];
  assert.equal(classifyIntentWithHistory("the gym membership", history), "decline");
});

test('"looks good" does not answer an amount clarification', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "What's the amount?" },
  ];
  assert.equal(classifyIntentWithHistory("looks good", history), "decline");
});

test('"4000" does not answer a removal-choice clarification (a number is never an event choice)', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Remove my subscription" },
    { role: "assistant", content: "You have two subscriptions — the gym membership and the streaming service. Which one did you mean?" },
  ];
  assert.equal(classifyIntentWithHistory("4000", history), "decline");
});

test('a completed draft ending with "Would you like anything else?" is not revived', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "I've prepared a draft to add AED 3,000 monthly school fees starting 1 Oct 2026. Nothing changes until you confirm in the app. Would you like anything else?" },
  ];
  assert.equal(classifyIntentWithHistory("4000", history), "decline");
  assert.equal(classifyIntentWithHistory("monthly", history), "decline");
});

test('a generic assistant question ("Would you like anything else?") alone does not open a thread', () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "What's my tightest month?" },
    { role: "assistant", content: "March 2027. Would you like anything else?" },
  ];
  assert.equal(classifyIntentWithHistory("4000", history), "decline");
});

test("isUnderspecifiedAddRequest identifies a fresh add request with no amount/date yet", () => {
  assert.equal(isUnderspecifiedAddRequest("Add an expense to my calendar."), true);
  assert.equal(isUnderspecifiedAddRequest("Add an income source to my calendar."), true);
  assert.equal(isUnderspecifiedAddRequest("Add my rent"), true);
  assert.equal(isUnderspecifiedAddRequest("I'm receiving a bonus tomorrow."), true);
});

test("isUnderspecifiedAddRequest is false once an amount/date is given, or for a removal", () => {
  assert.equal(isUnderspecifiedAddRequest("Add AED 1,200 as a monthly expense starting 1 Oct 2026."), false);
  assert.equal(isUnderspecifiedAddRequest("Add school fees on 1 October."), false);
  assert.equal(isUnderspecifiedAddRequest("Remove an expense or income source from my calendar."), false);
  assert.equal(isUnderspecifiedAddRequest("Can you add up my bills?"), false);
});

test("no continuation is applied without an open calendar_change thread, or without an assistant turn to answer", () => {
  const noOpenThread: HistoryTurn[] = [
    { role: "user", content: "What's safe to spend today?" },
    { role: "assistant", content: "AED 9,450 across the next 15 days." },
  ];
  assert.equal(classifyIntentWithHistory("AED 3,000 monthly from 1 October 2026", noOpenThread), "decline");
  assert.equal(classifyIntentWithHistory("AED 3,000 monthly from 1 October 2026", []), "decline");

  const userSpokeLast: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "user", content: "AED 3,000" },
  ];
  assert.equal(classifyIntentWithHistory("monthly from 1 October 2026", userSpokeLast), "decline");
});
