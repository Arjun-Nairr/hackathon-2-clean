import type { ApiRequest, ApiResponse } from './_lib/http';
import { sendError } from './_lib/http';
import { loadProfileAndEvents } from './_lib/repository';
import { buildCalendarForecast } from './_lib/finance-engine';

export default async function handler(_req: ApiRequest, res: ApiResponse) {
  try {
    const data = await loadProfileAndEvents();
    if (!data) return sendError(res, 404, 'No profile found. Run the seed script first.');
    res.status(200).json(buildCalendarForecast(data.profile, data.events));
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Unknown error');
  }
}
