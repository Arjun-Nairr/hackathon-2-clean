// Thin react-query wrappers around the one configured ApiClient (see
// ./index.ts — never imports mockClient directly). Naming mirrors the
// orval-generated hooks this app used to import from
// @workspace/api-client-react, so pages read the same either way.
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from './index';
import type {
  AccountConnectionInput,
  AffordabilityInput,
  ChatHistoryItem,
  DocumentImportInput,
  FinancialProfileInput,
  RentVsBuyInput,
} from './types';

// The `{ query: { queryKey } }` param mirrors the orval-generated hooks this
// app used to call; the key is fixed either way, so it's accepted and unused.
export const getGetMoneyCalendarQueryKey = () => ['money-calendar'] as const;
export function useGetMoneyCalendar(_options?: unknown) {
  return useQuery({ queryKey: getGetMoneyCalendarQueryKey(), queryFn: () => apiClient.getMoneyCalendar() });
}

export const getGetCalendarForecastQueryKey = () => ['calendar-forecast'] as const;
export function useGetCalendarForecast(_options?: unknown) {
  return useQuery({ queryKey: getGetCalendarForecastQueryKey(), queryFn: () => apiClient.getCalendarForecast() });
}

export function useCheckAffordability() {
  return useMutation({ mutationFn: ({ data }: { data: AffordabilityInput }) => apiClient.checkAffordability(data) });
}

export function useCompareRentVsBuy() {
  return useMutation({ mutationFn: ({ data }: { data: RentVsBuyInput }) => apiClient.compareRentVsBuy(data) });
}

export function useSendChatMessage() {
  return useMutation({
    mutationFn: ({ data }: { data: { sessionId: string; message: string; history: ChatHistoryItem[] } }) => apiClient.sendChatMessage(data),
  });
}

export const getGetFinancialProfileQueryKey = () => ['financial-profile'] as const;
export function useGetFinancialProfile() {
  return useQuery({ queryKey: getGetFinancialProfileQueryKey(), queryFn: () => apiClient.getFinancialProfile() });
}

export function useSaveFinancialProfile() {
  return useMutation({ mutationFn: ({ data }: { data: FinancialProfileInput }) => apiClient.saveFinancialProfile(data) });
}

export const getListImportsQueryKey = () => ['imports'] as const;
export function useListImports() {
  return useQuery({ queryKey: getListImportsQueryKey(), queryFn: () => apiClient.listImports() });
}

export function useStartAccountConnection() {
  return useMutation({ mutationFn: ({ data }: { data: AccountConnectionInput }) => apiClient.startAccountConnection(data) });
}

export function useCreateDocumentImport() {
  return useMutation({ mutationFn: ({ data }: { data: DocumentImportInput }) => apiClient.createDocumentImport(data) });
}

export function useReviewImportedRecord() {
  return useMutation({ mutationFn: ({ id, data }: { id: string; data: { decision: 'accept' | 'reject' } }) => apiClient.reviewImportedRecord(id, data.decision) });
}

export function useDeleteImportedRecord() {
  return useMutation({ mutationFn: ({ id }: { id: string }) => apiClient.deleteImportedRecord(id) });
}
