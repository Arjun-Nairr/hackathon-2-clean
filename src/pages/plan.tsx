import { Landmark, ArrowRight, Home as HomeIcon, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { BayzatiMobileShell } from '@/components/bayzati-mobile-shell';

export default function PlanHub() {
  return (
    <BayzatiMobileShell active="plan">
      <div data-testid="page-plan-hub">
        <header className="mt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#667085]">Decisions</p>
          <h1 className="mt-1 text-[28px] font-bold leading-none tracking-[-.04em] text-[#003B73]">
            Plan your next move.
          </h1>
          <p className="mt-3 text-[12px] leading-5 text-[#667085]">
            Explore major decisions with the full weight of your current financial picture.
          </p>
        </header>

        <div className="mt-8 space-y-4">
          <Link href="/plan/rent-vs-buy" className="group block overflow-hidden rounded-[18px] border border-[#E4E7EC] bg-white p-4 transition-all hover:border-[#139BE8]/50 hover:shadow-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#EAF6FD] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#003B73]">
                  Decision 01
                </span>
                <h2 className="text-[19px] font-bold text-[#003B73] group-hover:text-[#139BE8] transition-colors">Rent or buy?</h2>
                <p className="mt-1 text-[12px] leading-5 text-[#667085]">Compare the cash, monthly cost, and freedom each choice leaves you.</p>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F8FAFC] text-[#003B73] transition-colors group-hover:bg-[#139BE8] group-hover:text-white">
                <HomeIcon className="size-5" />
              </span>
            </div>
            <div className="mt-5 flex items-center gap-2 border-t border-[#F2F4F7] pt-3 text-[11px] font-semibold text-[#139BE8]">
              Explore <ArrowRight className="size-3.5" />
            </div>
          </Link>

          <Link href="/loan" className="group block overflow-hidden rounded-[18px] border border-[#E4E7EC] bg-white p-4 transition-all hover:border-[#139BE8]/50 hover:shadow-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#EAF6FD] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#003B73]">
                  Decision 02
                </span>
                <h2 className="text-[19px] font-bold text-[#003B73] group-hover:text-[#139BE8] transition-colors">Can I safely borrow?</h2>
                <p className="mt-1 text-[12px] leading-5 text-[#667085]">A sample walkthrough of what an affordability check would weigh.</p>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F8FAFC] text-[#003B73] transition-colors group-hover:bg-[#139BE8] group-hover:text-white">
                <ShieldCheck className="size-5" />
              </span>
            </div>
            <div className="mt-5 flex items-center gap-2 border-t border-[#F2F4F7] pt-3 text-[11px] font-semibold text-[#139BE8]">
              Check affordability <ArrowRight className="size-3.5" />
            </div>
          </Link>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Link href="/chat" className="rounded-[18px] border border-[#E4E7EC] bg-white p-4 transition-all hover:border-[#139BE8]/50" data-testid="link-plan-chat">
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#98A2B3]">Ask</p>
              <p className="mt-1 text-[14px] font-bold text-[#003B73]">Decide with your calendar</p>
              <p className="mt-1 text-[11px] leading-4 text-[#667085]">Safe-to-spend, upcoming commitments, and calendar changes.</p>
            </Link>
            <Link href="/learn" className="rounded-[18px] border border-[#E4E7EC] bg-white p-4 transition-all hover:border-[#139BE8]/50" data-testid="link-plan-learn">
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#98A2B3]">Learn</p>
              <p className="mt-1 text-[14px] font-bold text-[#003B73]">Short guides</p>
              <p className="mt-1 text-[11px] leading-4 text-[#667085]">Before you borrow, move, or buy.</p>
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-[18px] border border-[#DCE8EE] bg-white/50 p-5 text-center">
          <Landmark className="mx-auto size-6 text-[#98A2B3]" />
          <h3 className="mt-3 text-[14px] font-bold text-[#003B73]">More decisions coming</h3>
          <p className="mt-1 text-[11px] leading-5 text-[#667085]">We're building more ways to test scenarios before you commit to them.</p>
        </div>
      </div>
    </BayzatiMobileShell>
  );
}
