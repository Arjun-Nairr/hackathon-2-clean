import type { ApiRequest, ApiResponse } from './_lib/http';
import { sendError } from './_lib/http';
import { loadProfileAndEvents } from './_lib/repository';
import { answerChatMessage } from './_lib/chat';
import { GeminiError } from './_lib/gemini';
import type { ChatHistoryItem, ChatResponse } from '../src/lib/api/types';

interface ChatRequestBody {
  sessionId?: unknown;
  message?: unknown;
  history?: unknown;
}

function parseBody(body: unknown): { sessionId: string; message: string; history: ChatHistoryItem[] } | null {
  if (!body || typeof body !== 'object') return null;
  const { sessionId, message, history } = body as ChatRequestBody;
  if (typeof sessionId !== 'string' || !sessionId) return null;
  if (typeof message !== 'string' || !message.trim()) return null;
  const parsedHistory: ChatHistoryItem[] = Array.isArray(history)
    ? history.filter((h): h is ChatHistoryItem => !!h && typeof h === 'object' && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    : [];
  return { sessionId, message, history: parsedHistory };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const parsed = parseBody(req.body);
  if (!parsed) {
    return sendError(res, 400, 'Expected { sessionId: string, message: string, history?: Array<{role, content}> }');
  }

  const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const data = await loadProfileAndEvents();
    if (!data) return sendError(res, 404, 'No profile found. Run the seed script first.');

    const result = await answerChatMessage(parsed.message, parsed.history, data.profile, data.events, messageId);
    const response: ChatResponse = {
      sessionId: parsed.sessionId,
      messageId,
      text: result.text,
      card: result.card,
    };
    res.status(200).json(response);
  } catch (err) {
    if (err instanceof GeminiError) {
      // Controlled response, not a 500: the calendar is unaffected, the
      // planner just couldn't reach the model this turn.
      const response: ChatResponse = {
        sessionId: parsed.sessionId,
        messageId,
        text: "I couldn't reach the planner just now. Your calendar is unchanged — try again in a moment.",
        card: { type: 'unavailable', capability: 'chat' },
      };
      return res.status(200).json(response);
    }
    sendError(res, 500, err instanceof Error ? err.message : 'Unknown error');
  }
}
