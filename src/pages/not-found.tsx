import { ArrowLeft, CircleAlert } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm" data-testid="error-not-found">
        <CircleAlert className="mb-5 size-8 text-primary" />
        <h1 className="font-display text-4xl text-primary">This page wandered off.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">There is no money decision at this address. The calendar is still right where you left it.</p>
        <Link href="/home" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground" data-testid="link-not-found-home"><ArrowLeft className="size-4" />Back to home</Link>
      </div>
    </div>
  );
}
