// Stands in for the server in Bundle 1. It returns fixed, typed fixtures —
// it does not compute amortization, APR, DBR, LTV, break-even, or a verdict
// anywhere. Submitted form input is accepted (to satisfy the ApiClient
// shape) but intentionally unused: the real finance engine that responds to
// input arrives in a later bundle and replaces this file's bodies, not its
// exported shape.
import type { ApiClient } from './client';
import { CALENDAR_FORECAST_FIXTURE, MONEY_CALENDAR_FIXTURE } from './mock-data';
import { AFFORDABILITY_CHAT_CARD, AFFORDABILITY_FIXTURE, DECLINE_ANSWER, RENT_VS_BUY_CHAT_CARD, RENT_VS_BUY_FIXTURE, TIGHT_MONTH_ANSWER } from './fixtures';
import type {
  AccountConnection,
  AccountConnectionInput,
  ChatCard,
  ChatRequest,
  ChatResponse,
  DocumentImportInput,
  FinancialProfile,
  FinancialProfileInput,
  ImportedRecord,
  ImportsQueue,
} from './types';

const network = () => new Promise((resolve) => setTimeout(resolve, 260));

// Deterministic chat router: each quick prompt keyword maps to one fixed
// card. Calendar writes and draft confirmation are out of scope for this
// bundle, so anything the router doesn't recognize just declines.
function routeChatMessage(message: string): { text: string; card: ChatCard } {
  const lower = message.toLowerCase();
  if (lower.includes('loan') || lower.includes('afford') || lower.includes('borrow')) {
    return { text: AFFORDABILITY_FIXTURE.headline, card: AFFORDABILITY_CHAT_CARD };
  }
  if (lower.includes('rent') && (lower.includes('buy') || lower.includes('own'))) {
    return { text: RENT_VS_BUY_FIXTURE.headline, card: RENT_VS_BUY_CHAT_CARD };
  }
  if (lower.includes('tight')) {
    return TIGHT_MONTH_ANSWER;
  }
  return DECLINE_ANSWER;
}

// -- In-memory state for profile & imports, reset on page reload (this is a
// mock, not persistence) --
let savedProfile: FinancialProfile | null = null;
let imports: ImportsQueue = { records: [], connections: [] };
let importSeq = 0;

export const mockClient: ApiClient = {
  async getMoneyCalendar() {
    await network();
    return MONEY_CALENDAR_FIXTURE;
  },

  async getCalendarForecast() {
    await network();
    return CALENDAR_FORECAST_FIXTURE;
  },

  async checkAffordability() {
    await network();
    return AFFORDABILITY_FIXTURE;
  },

  async compareRentVsBuy() {
    await network();
    return RENT_VS_BUY_FIXTURE;
  },

  async sendChatMessage(request: ChatRequest) {
    await network();
    const result = routeChatMessage(request.message);
    const response: ChatResponse = {
      sessionId: request.sessionId,
      messageId: `msg-${Date.now()}`,
      text: result.text,
      card: result.card,
    };
    return response;
  },

  async getFinancialProfile() {
    await network();
    return savedProfile;
  },

  async saveFinancialProfile(input: FinancialProfileInput) {
    await network();
    savedProfile = { ...input };
    return savedProfile;
  },

  async listImports() {
    await network();
    return imports;
  },

  async startAccountConnection(input: AccountConnectionInput) {
    await network();
    const connection: AccountConnection = { ...input, id: `conn-${++importSeq}`, status: 'pending', lastSyncedAt: null };
    imports = { ...imports, connections: [...imports.connections, connection] };
    return connection;
  },

  async createDocumentImport(input: DocumentImportInput) {
    await network();
    const record: ImportedRecord = {
      id: `import-${++importSeq}`,
      reviewStatus: 'needs-review',
      source: { type: input.documentType },
      event: { label: input.label, amount: input.amount, day: input.day, accountName: input.accountName },
      discoveredAt: new Date().toISOString(),
    };
    imports = { ...imports, records: [record, ...imports.records] };
    return record;
  },

  async reviewImportedRecord(id: string, decision: 'accept' | 'reject') {
    await network();
    imports = { ...imports, records: imports.records.map((r) => (r.id === id ? { ...r, reviewStatus: decision === 'accept' ? 'accepted' : 'rejected' } : r)) };
  },

  async deleteImportedRecord(id: string) {
    await network();
    imports = { ...imports, records: imports.records.filter((r) => r.id !== id) };
  },
};
