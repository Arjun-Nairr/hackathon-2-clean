import type { ApiRequest, ApiResponse } from '../../_lib/http';
import { sendError } from '../../_lib/http';
import { loadProfileAndEvents } from '../../_lib/repository';
import { confirmDraft } from '../../_lib/apply-draft';
import { buildCalendarForecast, buildMoneyCalendar } from '../../_lib/finance-engine';

function readDraftId(query: ApiRequest['query']): string | undefined {
  const raw = query.draftId;
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

// The only place a chat-proposed calendar change is ever written to
// calendar_events. Chat text ("yes", "confirm", "go ahead") never reaches
// here — only this authenticated-by-the-app endpoint can commit a draft.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const draftId = readDraftId(req.query);
  if (!draftId) return sendError(res, 400, 'Missing draftId');

  try {
    const before = await loadProfileAndEvents();
    if (!before) return sendError(res, 404, 'No profile found. Run the seed script first.');

    const result = await confirmDraft(draftId, before.profile.month);

    if (result.outcome === 'not_found') return sendError(res, 404, 'Draft not found');
    if (result.outcome === 'rejected') return sendError(res, 409, 'Draft was already rejected and cannot be confirmed');
    if (result.outcome === 'invalid') return sendError(res, 422, `Draft failed revalidation: ${result.errors.join('; ')}`);

    const after = await loadProfileAndEvents();
    if (!after) return sendError(res, 404, 'No profile found. Run the seed script first.');
    const calendar = buildMoneyCalendar(after.profile, after.events);
    const forecast = buildCalendarForecast(after.profile, after.events);

    res.status(200).json({
      status: 'confirmed',
      alreadyApplied: result.alreadyApplied,
      appliedEventIds: result.appliedEventIds,
      calendar,
      forecast,
    });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Unknown error');
  }
}
