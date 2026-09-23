import type { ApiRequest, ApiResponse } from '../../_lib/http.js';
import { sendError } from '../../_lib/http.js';
import { getDraft, markDraftRejected } from '../../_lib/drafts-repository.js';

function readDraftId(query: ApiRequest['query']): string | undefined {
  const raw = query.draftId;
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const draftId = readDraftId(req.query);
  if (!draftId) return sendError(res, 400, 'Missing draftId');

  try {
    const draft = await getDraft(draftId);
    if (!draft) return sendError(res, 404, 'Draft not found');
    if (draft.status === 'confirmed') return sendError(res, 409, 'Draft was already confirmed and cannot be rejected');

    // Idempotent: this only ever moves a pending draft to rejected, so a
    // repeated rejection of an already-rejected draft is a safe no-op.
    await markDraftRejected(draftId);
    res.status(200).json({ status: 'rejected' });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Unknown error');
  }
}
