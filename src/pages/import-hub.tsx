import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  CloudUpload,
  CreditCard,
  FileCheck2,
  FileText,
  Info,
  Landmark,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  getListImportsQueryKey,
  useCreateDocumentImport,
  useDeleteImportedRecord,
  useListImports,
  useReviewImportedRecord,
  useStartAccountConnection,
} from "@/lib/api/hooks";
import type { AccountConnectionInput, AccountType, DocumentImportInput, DocumentType, ImportedRecord } from "@/lib/api/types";
import { BayzatiMobileShell } from "@/components/bayzati-mobile-shell";

type Modal = "account" | "document" | null;

const documentTypes: Array<{ value: DocumentType; label: string; hint: string }> = [
  { value: "bank-statement", label: "Bank statement", hint: "Balances and regular payments" },
  { value: "payslip", label: "Payslip", hint: "Salary and allowances" },
  { value: "credit-card-statement", label: "Credit-card statement", hint: "Card dues and spending" },
  { value: "tenancy-contract", label: "Tenancy contract", hint: "Rent and renewal dates" },
  { value: "school-fee-schedule", label: "School-fee schedule", hint: "Upcoming fee commitments" },
];

const accountTypes: Array<{ value: AccountType; label: string }> = [
  { value: "current", label: "Current account" },
  { value: "savings", label: "Savings account" },
  { value: "credit-card", label: "Credit card" },
];

const fieldClass =
  "mt-1.5 h-11 w-full rounded-xl border border-[#E4E7EC] bg-white px-3.5 text-[13px] text-[#17212B] outline-none transition focus:border-[#139BE8]";
const labelClass = "text-[11px] font-semibold text-[#667085]";

function formatDate(value?: string | null) {
  if (!value) return "Not yet synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AE", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatAED(value: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function sourceLabel(type: DocumentType) {
  return documentTypes.find((item) => item.value === type)?.label ?? "Imported document";
}

function statusCopy(status: ImportedRecord["reviewStatus"]) {
  if (status === "duplicate") return "Possible duplicate";
  if (status === "accepted") return "Added to plan";
  if (status === "rejected") return "Not added";
  return "Needs your review";
}

function StatusBadge({ status }: { status: ImportedRecord["reviewStatus"] }) {
  const styles = {
    "needs-review": "bg-[#FFF5DB] text-[#9A6B00]",
    duplicate: "bg-[#FCEAF1] text-[#D20A58]",
    accepted: "bg-[#F0FBF5] text-[#168657]",
    rejected: "bg-[#F2F4F7] text-[#667085]",
  } as const;
  const iconColors = {
    "needs-review": "text-[#D99A00]",
    duplicate: "text-[#D20A58]",
    accepted: "text-[#168657]",
    rejected: "text-[#667085]",
  } as const;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] ${styles[status]}`}>
      <CircleDot className={`size-2.5 ${iconColors[status]}`} />
      {statusCopy(status)}
    </span>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[16px] bg-[#E4E7EC] ${className}`} />;
}

export default function ImportHub() {
  const queryClient = useQueryClient();
  const importsQuery = useListImports();
  const startConnection = useStartAccountConnection();
  const createDocument = useCreateDocumentImport();
  const reviewRecord = useReviewImportedRecord();
  const deleteRecord = useDeleteImportedRecord();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [connectionForm, setConnectionForm] = useState<AccountConnectionInput>({
    institution: "",
    accountName: "",
    accountType: "current",
  });
  const [documentForm, setDocumentForm] = useState<{
    documentType: DocumentType;
    label: string;
    amount: string;
    day: string;
    kind: DocumentImportInput["kind"];
    paymentType: string;
    amountType: DocumentImportInput["amountType"];
    accountName: string;
    note: string;
  }>({
    documentType: "bank-statement",
    label: "",
    amount: "",
    day: "1",
    kind: "fixed",
    paymentType: "rent",
    amountType: "fixed",
    accountName: "",
    note: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const queue = importsQuery.data;
  const records = queue?.records ?? [];
  const connections = queue?.connections ?? [];
  const reviewCount = useMemo(
    () => records.filter((record) => record.reviewStatus === "needs-review" || record.reviewStatus === "duplicate").length,
    [records],
  );

  const closeModal = () => {
    if (startConnection.isPending || createDocument.isPending) return;
    setModal(null);
    setSelectedFile(null);
  };

  const showNotice = (tone: "success" | "error", message: string) => {
    setNotice({ tone, message });
    window.setTimeout(() => setNotice(null), 4500);
  };

  const refreshImports = () => {
    void queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
  };

  const handleConnection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!connectionForm.institution.trim() || !connectionForm.accountName.trim()) return;
    try {
      await startConnection.mutateAsync({
        data: {
          institution: connectionForm.institution.trim(),
          accountName: connectionForm.accountName.trim(),
          accountType: connectionForm.accountType,
        },
      });
      setConnectionForm({ institution: "", accountName: "", accountType: "current" });
      setModal(null);
      showNotice("success", "Connection request sent. Your bank stays read-only.");
      refreshImports();
    } catch (error) {
      showNotice("error", getErrorMessage(error, "We could not start that connection. Please try again."));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setDocumentForm((current) => ({
      ...current,
      label: current.label || file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
    }));
  };

  const handleDocumentImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile || !documentForm.label.trim() || !documentForm.accountName.trim()) return;
    try {
      // No backend yet in this bundle: the mock records the document's
      // details directly, without a real upload round-trip.
      await createDocument.mutateAsync({
        data: {
          documentType: documentForm.documentType,
          label: documentForm.label.trim(),
          amount: Math.max(0, Number(documentForm.amount) || 0),
          day: Math.min(31, Math.max(1, Number(documentForm.day) || 1)),
          kind: documentForm.kind,
          paymentType: documentForm.paymentType,
          amountType: documentForm.amountType,
          accountName: documentForm.accountName.trim(),
          ...(documentForm.note.trim() ? { note: documentForm.note.trim() } : {}),
        },
      });
      setModal(null);
      setSelectedFile(null);
      setDocumentForm((current) => ({ ...current, label: "", amount: "", accountName: "", note: "" }));
      showNotice("success", "Document added to your review queue.");
      refreshImports();
    } catch (error) {
      showNotice("error", getErrorMessage(error, "We could not bring in that document. Nothing was added."));
    }
  };

  const handleReview = async (record: ImportedRecord, decision: "accept" | "reject") => {
    try {
      await reviewRecord.mutateAsync({ id: record.id, data: { decision } });
      showNotice("success", decision === "accept" ? "Record added to your money calendar." : "Record set aside.");
      refreshImports();
    } catch (error) {
      showNotice("error", getErrorMessage(error, "That review could not be saved."));
    }
  };

  const handleDelete = async (record: ImportedRecord) => {
    if (!window.confirm(`Delete "${record.event.label}" and its financial effect?`)) return;
    try {
      await deleteRecord.mutateAsync({ id: record.id });
      showNotice("success", "Record deleted. Its financial effect is gone.");
      refreshImports();
    } catch (error) {
      showNotice("error", getErrorMessage(error, "That record could not be deleted."));
    }
  };

  return (
    <BayzatiMobileShell active="plan">
      <div data-testid="page-imports">
        <header className="mt-7">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#667085]">Data & Sources</p>
              <h1 className="mt-1 text-[28px] font-bold leading-none tracking-[-.04em] text-[#003B73]">
                Bring it into focus.
              </h1>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[#C9DDE6] bg-[#E8F0F8] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-[#003B73]">
              <ShieldCheck className="size-3" />
              Private
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-[#667085]">
            Connect an account or add a document. Bayzati turns the details into a plan you can review before anything changes.
          </p>
        </header>

        <section className="mt-6 grid gap-3">
          <div className="relative overflow-hidden rounded-[18px] bg-[#003B73] p-5 text-white shadow-sm">
            <div className="absolute -right-10 -top-16 size-48 rounded-full border-[18px] border-white/5" />
            <div className="relative">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#C4E5EF]">
                <LockKeyhole className="size-3.5 text-[#55D5EE]" />
                Read-only, always
              </div>
              <h2 className="mt-3 text-[20px] font-bold leading-tight tracking-[-.02em]">
                Nothing moves until you say so.
              </h2>
              <p className="mt-2 text-[11px] leading-5 text-[#C4E5EF]">
                Connected accounts can only be read. Every imported record waits here for your review, and you can remove it and its effect from your plan at any time.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-[18px] border border-[#E4E7EC] bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-4 text-[#D20A58]" />
                <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#667085]">Review desk</span>
              </div>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-[32px] font-bold leading-none text-[#003B73]">{reviewCount}</span>
                <span className="mb-0.5 text-[11px] text-[#667085]">waiting for<br />your eyes</span>
              </div>
            </div>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-full bg-[#EAF6FD] text-[#003B73]"
              onClick={() => document.getElementById("review-queue")?.scrollIntoView({ behavior: "smooth" })}
              data-testid="button-jump-review"
              aria-label="See the review queue"
            >
              <ArrowUpRight className="size-5" />
            </button>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="bring-in-heading">
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#667085]">Start gently</p>
            <h2 id="bring-in-heading" className="mt-1 text-[19px] font-bold text-[#003B73]">Bring in what helps</h2>
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setModal("account")}
              className="flex w-full flex-col items-start gap-4 rounded-[18px] border border-[#E4E7EC] bg-white p-4 text-left shadow-sm transition-colors hover:border-[#139BE8]/30"
              data-testid="button-connect-account"
            >
              <div className="flex w-full items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#EAF6FD] text-[#003B73]">
                  <Landmark className="size-5" />
                </span>
                <ChevronRight className="size-5 text-[#98A2B3]" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#003B73]">Connect a UAE account</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#667085]">See balances and transactions without giving Bayzati permission to move money.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setModal("document")}
              className="flex w-full flex-col items-start gap-4 rounded-[18px] border border-[#E4E7EC] bg-white p-4 text-left shadow-sm transition-colors hover:border-[#D20A58]/30"
              data-testid="button-upload-document"
            >
              <div className="flex w-full items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#FCEAF1] text-[#D20A58]">
                  <CloudUpload className="size-5" />
                </span>
                <ChevronRight className="size-5 text-[#98A2B3]" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#003B73]">Add a financial document</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#667085]">Upload a statement, payslip, contract, or fee schedule, then normalize the details together.</p>
              </div>
            </button>
          </div>
        </section>

        <section className="mt-10" id="review-queue" aria-labelledby="queue-heading">
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#667085]">Your call</p>
            <h2 id="queue-heading" className="mt-1 text-[19px] font-bold text-[#003B73]">Review queue</h2>
            <p className="mt-1 text-[11px] text-[#667085]">Nothing changes in your calendar until you accept it.</p>
          </div>

          {importsQuery.isLoading ? (
            <div className="grid gap-3">
              <SkeletonBlock className="h-28 w-full" />
              <SkeletonBlock className="h-28 w-full" />
            </div>
          ) : importsQuery.isError ? (
            <div className="rounded-[16px] border border-[#D20A58]/25 bg-[#FCEAF1] p-5 text-[#D20A58]">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <h3 className="text-[13px] font-bold">The review queue is taking a moment.</h3>
                  <p className="mt-1 text-[11px] opacity-80">Your existing plan is safe. Try loading the queue again.</p>
                  <button
                    type="button"
                    className="mt-3 flex items-center gap-1.5 text-[11px] font-bold"
                    onClick={() => void importsQuery.refetch()}
                    data-testid="button-retry-imports"
                  >
                    <RefreshCw className="size-3.5" /> Try again
                  </button>
                </div>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[#DCE8EE] bg-white/50 p-6 text-center shadow-sm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#EAF6FD] text-[#003B73]">
                <FileText className="size-5" />
              </div>
              <h3 className="mt-4 text-[17px] font-bold text-[#003B73]">A clear desk.</h3>
              <p className="mx-auto mt-2 max-w-[260px] text-[11px] leading-5 text-[#667085]">
                When you bring in a document, it will appear here first. You decide what belongs in your money calendar.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {records.map((record) => (
                <article
                  key={record.id}
                  className="rounded-[16px] border border-[#E4E7EC] bg-white p-4 shadow-sm"
                  data-testid={`card-import-record-${record.id}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={record.reviewStatus} />
                      </div>
                      <h3 className="truncate text-[15px] font-bold text-[#003B73]">{record.event.label}</h3>
                      <p className="mt-1 text-[11px] text-[#667085]">
                        {sourceLabel(record.source.type)} · {record.event.accountName}
                      </p>
                    </div>
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F8FAFC] text-[#98A2B3]">
                      {record.source.type === "credit-card-statement" ? <CreditCard className="size-4" /> : <FileText className="size-4" />}
                    </div>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] bg-[#F8FAFC] p-3 text-[11px]">
                    <span className="font-bold text-[#003B73]">{formatAED(record.event.amount)}</span>
                    <span className="text-[#667085]">•</span>
                    <span className="font-medium text-[#667085]">Day {record.event.day}</span>
                    <span className="text-[#667085]">•</span>
                    <span className="text-[#98A2B3]">Found {formatDate(record.discoveredAt)}</span>
                  </div>

                  {record.reviewStatus === "duplicate" && record.duplicateOf ? (
                    <p className="mb-4 flex items-center gap-1.5 text-[10px] font-bold text-[#D20A58]">
                      <Info className="size-3.5" /> Matches an existing record. Check before accepting.
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between gap-2 border-t border-[#EEF1F3] pt-3">
                    <button
                      type="button"
                      aria-label={`Delete ${record.event.label}`}
                      className="flex size-9 items-center justify-center rounded-full border border-[#E4E7EC] text-[#667085] transition-colors hover:border-[#D20A58]/30 hover:bg-[#FCEAF1] hover:text-[#D20A58] disabled:opacity-50"
                      onClick={() => void handleDelete(record)}
                      disabled={deleteRecord.isPending}
                      data-testid={`button-delete-import-${record.id}`}
                    >
                      <Trash2 className="size-4" />
                    </button>

                    <div className="flex items-center gap-2">
                      {(record.reviewStatus === "needs-review" || record.reviewStatus === "duplicate") ? (
                        <>
                          <button
                            type="button"
                            className="flex min-h-9 items-center gap-1.5 rounded-full px-4 text-[11px] font-bold text-[#667085] transition-colors hover:bg-[#F2F4F7]"
                            onClick={() => void handleReview(record, "reject")}
                            disabled={reviewRecord.isPending}
                            data-testid={`button-reject-import-${record.id}`}
                          >
                            <X className="size-3.5" /> Reject
                          </button>
                          <button
                            type="button"
                            className="flex min-h-9 items-center gap-1.5 rounded-full bg-[#003B73] px-4 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
                            onClick={() => void handleReview(record, "accept")}
                            disabled={reviewRecord.isPending}
                            data-testid={`button-accept-import-${record.id}`}
                          >
                            {reviewRecord.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Accept
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10" aria-labelledby="connections-heading">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#667085]">Quiet background</p>
              <h2 id="connections-heading" className="mt-1 text-[19px] font-bold text-[#003B73]">Connected accounts</h2>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-bold text-[#139BE8]"
              onClick={() => setModal("account")}
              data-testid="button-add-another-account"
            >
              Add another <ChevronRight className="size-3" />
            </button>
          </div>

          {connections.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-[#DCE8EE] bg-white/50 p-5 text-center text-[11px] leading-5 text-[#667085]">
              No accounts connected yet. A connection is optional; documents work just as well.
            </div>
          ) : (
            <div className="grid gap-3">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-[#E4E7EC] bg-white p-4 shadow-sm"
                  data-testid={`card-account-connection-${connection.id}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF6FD] text-[#003B73]">
                      <Building2 className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#003B73]">{connection.institution}</p>
                      <p className="mt-0.5 truncate text-[10px] text-[#667085]">
                        {connection.accountName} · {connection.accountType.replace("-", " ")}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.08em] ${connection.status === "connected" ? "text-[#168657]" : connection.status === "pending" ? "text-[#D99A00]" : "text-[#667085]"}`}>
                      <span className="size-1.5 rounded-full bg-current" />
                      {connection.status === "connected" ? "Connected" : connection.status === "pending" ? "Pending" : "Disconnected"}
                    </span>
                    <p className="mt-1 text-[9px] text-[#98A2B3]">
                      {connection.lastSyncedAt ? `Synced ${formatDate(connection.lastSyncedAt)}` : "Awaiting sync"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-10 mb-8 border-t border-[#E4E7EC] pt-6">
          <div className="flex flex-col gap-3 text-[10px] leading-5 text-[#667085]">
            <p className="inline-flex items-start gap-2">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[#139BE8]" />
              Account access is read-only. Bayzati cannot move your money.
            </p>
            <p className="inline-flex items-start gap-2">
              <Trash2 className="mt-0.5 size-3.5 shrink-0 text-[#D20A58]" />
              Uploaded documents are retained for 90 days, then removed.
            </p>
          </div>
        </footer>
      </div>

      {notice ? (
        <div
          className={`fixed inset-x-4 bottom-24 z-[70] mx-auto flex max-w-[400px] items-start gap-3 rounded-[16px] border p-4 shadow-xl ${
            notice.tone === "success"
              ? "border-[#A1E3C7] bg-[#F0FBF5] text-[#168657]"
              : "border-[#F7B1C9] bg-[#FCEAF1] text-[#D20A58]"
          }`}
          role="status"
          data-testid="status-import-notice"
        >
          {notice.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1 text-[12px] font-semibold leading-5">{notice.message}</span>
          <button
            type="button"
            className="opacity-60 transition-opacity hover:opacity-100"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
            data-testid="button-dismiss-notice"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#092e59]/45 backdrop-blur-[2px] sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}
        >
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] bg-white sm:max-w-[500px] sm:rounded-[24px]">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#E4E7EC] bg-white/95 px-5 py-5 backdrop-blur">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#667085]">
                  {modal === "account" ? "Secure connection" : "Private document"}
                </p>
                <h2 className="mt-1 text-[22px] font-bold leading-tight text-[#003B73]">
                  {modal === "account" ? "Connect an account" : "Add a document"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="grid size-9 place-items-center rounded-full border border-[#E4E7EC] text-[#667085]"
                aria-label="Close dialog"
                data-testid="button-close-import-dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            {modal === "account" ? (
              <form className="space-y-5 px-5 py-6" onSubmit={(event) => void handleConnection(event)}>
                <div className="rounded-[14px] bg-[#EAF6FD]/60 p-4 text-[11px] leading-5 text-[#003B73]">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#139BE8]" />
                    <p><strong>Read-only access.</strong> We can look at balances and transactions, but never transfer, withdraw, or change anything.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className={labelClass}>Bank or card provider</span>
                    <input
                      className={fieldClass}
                      value={connectionForm.institution}
                      onChange={(event) => setConnectionForm((current) => ({ ...current, institution: event.target.value }))}
                      placeholder="For example, Emirates NBD"
                      required
                      data-testid="input-institution"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={labelClass}>Account name</span>
                      <input
                        className={fieldClass}
                        value={connectionForm.accountName}
                        onChange={(event) => setConnectionForm((current) => ({ ...current, accountName: event.target.value }))}
                        placeholder="Everyday spending"
                        required
                        data-testid="input-account-name"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Account type</span>
                      <select
                        className={fieldClass}
                        value={connectionForm.accountType}
                        onChange={(event) => setConnectionForm((current) => ({ ...current, accountType: event.target.value as AccountType }))}
                        data-testid="input-account-type"
                      >
                        {accountTypes.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#EEF1F3]">
                  <button
                    type="submit"
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#003B73] px-4 text-[13px] font-bold text-white transition-opacity disabled:opacity-60"
                    disabled={startConnection.isPending || !connectionForm.institution.trim() || !connectionForm.accountName.trim()}
                    data-testid="button-submit-connection"
                  >
                    {startConnection.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Landmark className="size-4" />
                    )}
                    Request read-only connection
                  </button>
                  <p className="mt-3 text-center text-[10px] text-[#98A2B3]">
                    You will be securely redirected to your bank to authenticate.
                  </p>
                </div>
              </form>
            ) : (
              <form className="space-y-5 px-5 py-6" onSubmit={(event) => void handleDocumentImport(event)}>
                <label className="block">
                  <span className={labelClass}>Document</span>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#F8FAFC] px-4 text-[12px] font-semibold text-[#003B73] border border-[#E4E7EC] hover:bg-[#F2F4F7]"
                    >
                      <Upload className="size-4" /> Choose file
                    </button>
                    <span className="truncate text-[12px] font-medium text-[#667085]">
                      {selectedFile ? selectedFile.name : "No file selected"}
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.png,.jpg,.jpeg,.csv"
                    data-testid="input-file-upload"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>Document type</span>
                    <select
                      className={fieldClass}
                      value={documentForm.documentType}
                      onChange={(event) => setDocumentForm((current) => ({ ...current, documentType: event.target.value as DocumentType }))}
                      data-testid="input-document-type"
                    >
                      {documentTypes.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Label for your calendar</span>
                    <input
                      className={fieldClass}
                      value={documentForm.label}
                      onChange={(event) => setDocumentForm((current) => ({ ...current, label: event.target.value }))}
                      placeholder="e.g. October Rent"
                      required
                      data-testid="input-document-label"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>Account name</span>
                    <input
                      className={fieldClass}
                      value={documentForm.accountName}
                      onChange={(event) => setDocumentForm((current) => ({ ...current, accountName: event.target.value }))}
                      placeholder="e.g. Visa card"
                      required
                      data-testid="input-document-account"
                    />
                  </label>
                  <div className="grid grid-cols-[1fr_72px] gap-2">
                    <label className="block">
                      <span className={labelClass}>Amount (AED)</span>
                      <input
                        className={fieldClass}
                        value={documentForm.amount}
                        onChange={(event) => setDocumentForm((current) => ({ ...current, amount: event.target.value }))}
                        type="number"
                        min="0"
                        placeholder="0"
                        data-testid="input-document-amount"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Day</span>
                      <input
                        className={fieldClass}
                        value={documentForm.day}
                        onChange={(event) => setDocumentForm((current) => ({ ...current, day: event.target.value }))}
                        type="number"
                        min="1"
                        max="31"
                        data-testid="input-document-day"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className={labelClass}>Kind</span>
                    <select
                      className={fieldClass}
                      value={documentForm.kind}
                      onChange={(event) => setDocumentForm((current) => ({ ...current, kind: event.target.value as DocumentImportInput["kind"] }))}
                      data-testid="input-document-kind"
                    >
                      <option value="income">Income</option>
                      <option value="fixed">Fixed</option>
                      <option value="lump">Lump</option>
                      <option value="goal">Goal</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Amount type</span>
                    <select
                      className={fieldClass}
                      value={documentForm.amountType}
                      onChange={(event) => setDocumentForm((current) => ({ ...current, amountType: event.target.value as DocumentImportInput["amountType"] }))}
                      data-testid="input-document-amount-type"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="variable">Variable</option>
                      <option value="range">Range</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Category</span>
                    <select
                      className={fieldClass}
                      value={documentForm.paymentType}
                      onChange={(event) => setDocumentForm((current) => ({ ...current, paymentType: event.target.value }))}
                      data-testid="input-document-payment-type"
                    >
                      <option value="salary">Salary</option>
                      <option value="rent">Rent</option>
                      <option value="loan">Loan</option>
                      <option value="school">School</option>
                      <option value="credit-card">Credit card</option>
                      <option value="insurance">Insurance</option>
                      <option value="goal">Goal</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className={labelClass}>Note (optional)</span>
                  <input
                    className={fieldClass}
                    value={documentForm.note}
                    onChange={(event) => setDocumentForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="Any extra context for your calendar"
                    data-testid="input-document-note"
                  />
                </label>

                <div className="pt-2 border-t border-[#EEF1F3]">
                  <button
                    type="submit"
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#003B73] px-4 text-[13px] font-bold text-white transition-opacity disabled:opacity-60"
                    disabled={createDocument.isPending || !selectedFile || !documentForm.label.trim() || !documentForm.accountName.trim()}
                    data-testid="button-submit-document"
                  >
                    {createDocument.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Adding…
                      </>
                    ) : (
                      <>
                        <CloudUpload className="size-4" /> Bring into queue
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </BayzatiMobileShell>
  );
}
