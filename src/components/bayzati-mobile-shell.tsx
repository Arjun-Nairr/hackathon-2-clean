import { useState, type ReactNode } from 'react';
import { Bell, CalendarDays, Home, Landmark, Sparkles, Target, X } from 'lucide-react';
import { Link } from 'wouter';
import { demoPersona } from '@/lib/persona';

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/', label: 'Plan', icon: Landmark },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
];

function BayzatiLogo() {
  return (
    <div className="flex items-center gap-2">
      <img src="/images/bayzati-logo.png" alt="Bayzati" className="size-9 object-contain" data-testid="img-bayzati-logo" />
      <div className="leading-none">
        <p className="text-[19px] font-semibold tracking-[-.04em] text-[#003B73]">bayzati</p>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[.13em] text-[#98A2B3]">your calmer money plan</p>
      </div>
    </div>
  );
}

export function BayzatiMobileShell({
  active = 'none',
  children,
  floatingAction,
}: {
  active?: 'home' | 'plan' | 'goals' | 'calendar' | 'chat' | 'none';
  children: ReactNode;
  floatingAction?: ReactNode;
}) {
  const [panel, setPanel] = useState<'notifications' | 'profile' | null>(null);

  return (
    <main className="relative mx-auto min-h-[100dvh] w-full max-w-[520px] overflow-x-hidden bg-[#F8FAFC] font-sans text-[#17212B] shadow-[0_0_40px_rgba(0,46,93,.06)]">
      <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#EAF6FD] opacity-70" />
      <div className="relative px-5 pb-40 pt-[92px]">
        <header className="fixed inset-x-0 top-0 z-20 mx-auto flex h-[82px] w-full max-w-[520px] items-center justify-between border-b border-white/70 bg-white/70 px-5 shadow-[0_8px_24px_rgba(0,59,115,.05)] backdrop-blur-xl">
          <BayzatiLogo />
          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              onClick={() => setPanel('notifications')}
              className="grid size-11 place-items-center rounded-full border border-[#E4E7EC] bg-white text-[#667085]"
              data-testid="button-notifications"
            >
              <Bell size={17} />
            </button>
            <button
              aria-label="Open profile"
              onClick={() => setPanel('profile')}
              className="grid size-11 place-items-center rounded-full bg-[#EAF6FD] text-[11px] font-semibold text-[#003B73]"
              data-testid="button-profile"
            >
              {demoPersona.initials}
            </button>
          </div>
        </header>
        {children}
      </div>

      {floatingAction && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[106px] z-20 mx-auto flex max-w-[520px] justify-end px-5">
          <div className="pointer-events-auto">{floatingAction}</div>
        </div>
      )}

      <div className="fixed inset-x-3 bottom-4 z-20 mx-auto flex max-w-[496px] items-center gap-2">
        <nav className="flex h-[70px] min-w-0 flex-1 items-center rounded-full border border-white/80 bg-white/85 px-1 shadow-[0_8px_24px_rgba(0,46,93,.12)] backdrop-blur-xl" aria-label="Bayzati navigation">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className={`flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full ${active === label.toLowerCase() ? 'bg-[#EAF6FD] text-[#003B73]' : 'text-[#667085]'}`}
              data-testid={`link-nav-${label.toLowerCase()}`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-semibold">{label}</span>
            </Link>
          ))}
        </nav>
        <Link href="/chat" aria-label="Open finance assistant" className={`grid size-[70px] shrink-0 place-items-center rounded-full border border-white/80 shadow-[0_8px_24px_rgba(0,46,93,.14)] backdrop-blur-xl ${active === 'chat' ? 'bg-[#003B73]' : 'bg-white/85'}`} data-testid="button-reserved-quick-action">
          <span className={`relative grid size-[58px] place-items-center rounded-full border ${active === 'chat' ? 'border-white/30 text-white' : 'border-[#E4E7EC] text-[#003B73]'}`}>
            <Sparkles size={20} />
            {active !== 'chat' && <i className="absolute right-[12px] top-[10px] size-1.5 rounded-full bg-[#D20A58]" />}
          </span>
        </Link>
      </div>

      {panel && (
        <div className="fixed inset-0 z-30 bg-[#092e59]/25" onClick={() => setPanel(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="mobile-panel-title" onClick={(event) => event.stopPropagation()} className="absolute inset-x-4 bottom-28 mx-auto max-w-[488px] rounded-[18px] border border-[#E4E7EC] bg-white px-4 py-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#667085]">{panel === 'notifications' ? 'Notifications' : 'Your profile'}</p>
                <h2 id="mobile-panel-title" className="mt-1 text-[21px] font-bold tracking-[-.04em] text-[#003B73]">{panel === 'notifications' ? 'You are up to date.' : demoPersona.name}</h2>
              </div>
              <button aria-label="Close panel" onClick={() => setPanel(null)} className="grid size-11 place-items-center rounded-full border border-[#E4E7EC]" data-testid="button-close-mobile-panel"><X size={15} /></button>
            </div>
             {panel === 'notifications' ? <p className="mt-4 rounded-[15px] bg-[#EAF6FD] px-3.5 py-3 text-[12px] leading-5 text-[#003B73]">No new money decisions need your attention right now.</p> : <div className="mt-4 space-y-3"><p className="rounded-[15px] bg-[#EAF6FD] px-3.5 py-3 text-[12px] leading-5 text-[#003B73]">{demoPersona.city} · {demoPersona.currency}. Your plan is private by design.</p><Link href="/onboarding" onClick={() => setPanel(null)} className="flex min-h-11 items-center justify-between rounded-[13px] border border-[#DDE7EC] bg-white px-3.5 text-[12px] font-semibold text-[#003B73]" data-testid="link-profile-onboarding"><span>Review your setup</span><span className="text-[#139BE8]">Open</span></Link><Link href="/profile/bank-statement" onClick={() => setPanel(null)} className="flex min-h-11 items-center justify-between rounded-[13px] border border-[#DDE7EC] bg-white px-3.5 text-[12px] font-semibold text-[#003B73]" data-testid="link-profile-bank-statement"><span>View demo bank statement</span><span className="text-[#139BE8]">Open</span></Link></div>}
          </section>
        </div>
      )}
    </main>
  );
}
