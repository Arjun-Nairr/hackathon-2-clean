// One provider-neutral boundary. The composition root (./index.ts) wires
// `mockClient` (static, typed fixtures) to this interface for Bundle 1.
// Bundle 2 wires an HTTP client that calls same-origin /api/* routes instead
// — hooks and pages only ever depend on this interface, never on which
// implementation is wired in.
import type {
  AccountConnection,
  AccountConnectionInput,
  AffordabilityInput,
  AffordabilityResult,
  CalendarForecast,
  ChatRequest,
  ChatResponse,
  ConfirmDraftResult,
  DocumentImportInput,
  FinancialProfile,
  FinancialProfileInput,
  ImportedRecord,
  ImportsQueue,
  MoneyCalendar,
  RejectDraftResult,
  RentVsBuyInput,
  RentVsBuyResult,
} from './types';

export interface ApiClient {
  getMoneyCalendar(): Promise<MoneyCalendar>;
  getCalendarForecast(): Promise<CalendarForecast>;
  checkAffordability(input: AffordabilityInput): Promise<AffordabilityResult>;
  compareRentVsBuy(input: RentVsBuyInput): Promise<RentVsBuyResult>;
  sendChatMessage(request: ChatRequest): Promise<ChatResponse>;
  confirmCalendarDraft(draftId: string): Promise<ConfirmDraftResult>;
  rejectCalendarDraft(draftId: string): Promise<RejectDraftResult>;
  getFinancialProfile(): Promise<FinancialProfile | null>;
  saveFinancialProfile(input: FinancialProfileInput): Promise<FinancialProfile>;
  listImports(): Promise<ImportsQueue>;
  startAccountConnection(input: AccountConnectionInput): Promise<AccountConnection>;
  createDocumentImport(input: DocumentImportInput): Promise<ImportedRecord>;
  reviewImportedRecord(id: string, decision: 'accept' | 'reject'): Promise<void>;
  deleteImportedRecord(id: string): Promise<void>;
}
