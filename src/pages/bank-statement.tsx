import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { BayzatiMobileShell } from '@/components/bayzati-mobile-shell';
import { demoBankStatement as statement } from '@/lib/demo-bank-statement';

const money = (value: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(value);

export default function BankStatementPage() {
  return (
    <BayzatiMobileShell>
      <div className="pb-8">
        <Link href="/home" className="inline-flex min-h-11 items-center gap-2 text-[12px] font-semibold text-[#003B73]" data-testid="link-statement-back">
          <ArrowLeft size={16} /> Back
        </Link>

        <section className="mt-2 overflow-hidden rounded-[22px] border border-[#DDE7EC] bg-white shadow-[0_12px_30px_rgba(0,59,115,.06)]">
          <header className="bg-[#003B73] px-5 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#B8DDF4]">Synthetic demo statement</p>
                <h1 className="mt-2 text-[25px] font-bold tracking-[-.04em]">Demo bank statement</h1>
                <p className="mt-1 text-[12px] text-[#D7ECF8]">Projected September activity · {statement.period}</p>
              </div>
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10"><FileText size={20} /></div>
            </div>
          </header>

          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <Detail label="Account holder" value={statement.accountHolder} />
              <Detail label="Account" value={statement.accountNumber} />
              <Detail label="Account type" value={statement.accountName} />
              <Detail label="Currency" value={statement.currency} />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-[16px] bg-[#EAF6FD] p-4">
              <Balance label="Opening balance" value={statement.openingBalance} />
              <Balance label="Closing balance" value={statement.closingBalance} />
            </div>

            <div>
              <h2 className="text-[14px] font-bold text-[#003B73]">Transactions</h2>
              <div className="mt-3 divide-y divide-[#E9EFF2]">
                {statement.transactions.map((transaction) => (
                  <div key={`${transaction.date}-${transaction.description}`} className="grid grid-cols-[52px_1fr_auto] gap-2 py-3 text-[11px]" data-testid="statement-transaction">
                    <span className="text-[#667085]">{transaction.date}</span>
                    <div>
                      <p className="font-semibold text-[#173B5D]">{transaction.description}</p>
                      <p className="mt-1 text-[10px] text-[#98A2B3]">Balance AED {money(transaction.balance)} · <span className="capitalize">{transaction.status}</span></p>
                    </div>
                    <span className={`font-semibold tabular-nums ${transaction.credit ? 'text-[#009B72]' : 'text-[#D20A58]'}`}>
                      {transaction.credit ? '+' : '−'} AED {money(transaction.credit ?? transaction.debit ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-[15px] border border-[#CDE7D9] bg-[#F1FBF6] p-3.5 text-[10px] leading-5 text-[#356455]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#009B72]" />
              <p>This synthetic hackathon preview combines actual, pending and forecasted demo entries. It is not issued by a bank and contains no real customer information.</p>
            </div>
          </div>
        </section>
      </div>
    </BayzatiMobileShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[#98A2B3]">{label}</p><p className="mt-1 font-semibold text-[#173B5D]">{value}</p></div>;
}

function Balance({ label, value }: { label: string; value: number }) {
  return <div><p className="text-[10px] text-[#667085]">{label}</p><p className="mt-1 text-[16px] font-bold tabular-nums text-[#003B73]">AED {money(value)}</p></div>;
}
