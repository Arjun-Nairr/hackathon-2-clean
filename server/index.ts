// Local full-application server: mounts the same /api/* handlers Vercel
// would run as serverless functions, plus serves the built frontend, all on
// one origin — mirroring what Vercel's rewrite + functions do in
// production, so this is a real end-to-end local run, not a stand-in.
import { config } from 'dotenv';
import path from 'node:path';
import express from 'express';
import { validateEnv } from '../api/_lib/env';
import { loadSkill } from '../api/_lib/skill';
import calendarHandler from '../api/calendar';
import calendarForecastHandler from '../api/calendar-forecast';
import financialSnapshotHandler from '../api/financial-snapshot';
import loanHandler from '../api/loan';
import rentVsBuyHandler from '../api/rent-vs-buy';
import chatHandler from '../api/chat';
import confirmDraftHandler from '../api/drafts/[draftId]/confirm';
import rejectDraftHandler from '../api/drafts/[draftId]/reject';
import type { ApiRequest, ApiResponse } from '../api/_lib/http';

config({ path: '.env.local' });
validateEnv();
// Fail fast at startup, not on the first chat request, if the agent skill
// is missing from this deployment.
loadSkill();

const app = express();
app.use(express.json());

const asApi = (req: express.Request, res: express.Response) => ({
  req: req as unknown as ApiRequest,
  res: res as unknown as ApiResponse,
});

app.get('/api/calendar', (req, res) => {
  const { req: apiReq, res: apiRes } = asApi(req, res);
  void calendarHandler(apiReq, apiRes);
});
app.get('/api/calendar-forecast', (req, res) => {
  const { req: apiReq, res: apiRes } = asApi(req, res);
  void calendarForecastHandler(apiReq, apiRes);
});
app.get('/api/financial-snapshot', (req, res) => {
  const { req: apiReq, res: apiRes } = asApi(req, res);
  void financialSnapshotHandler(apiReq, apiRes);
});
app.post('/api/loan', (req, res) => {
  const { req: apiReq, res: apiRes } = asApi(req, res);
  void loanHandler(apiReq, apiRes);
});
app.post('/api/rent-vs-buy', (req, res) => {
  const { req: apiReq, res: apiRes } = asApi(req, res);
  void rentVsBuyHandler(apiReq, apiRes);
});
app.post('/api/chat', (req, res) => {
  const { req: apiReq, res: apiRes } = asApi(req, res);
  void chatHandler(apiReq, apiRes);
});
// Express 5's `req.query` is getter-only, so it can't be reassigned on the
// live request object the way `asApi` aliases it for the fixed routes
// above — build a plain ApiRequest instead, merging the route param in.
const withDraftId = (req: express.Request, res: express.Response) => ({
  req: { method: req.method, query: { ...req.query, draftId: req.params.draftId }, body: req.body } as ApiRequest,
  res: res as unknown as ApiResponse,
});

app.post('/api/drafts/:draftId/confirm', (req, res) => {
  const { req: apiReq, res: apiRes } = withDraftId(req, res);
  void confirmDraftHandler(apiReq, apiRes);
});
app.post('/api/drafts/:draftId/reject', (req, res) => {
  const { req: apiReq, res: apiRes } = withDraftId(req, res);
  void rejectDraftHandler(apiReq, apiRes);
});

const distDir = path.resolve(import.meta.dirname, '..', 'dist');
app.use(express.static(distDir));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT) || 5175;
app.listen(port, () => {
  console.log(`Bayzati full app listening on http://127.0.0.1:${port}`);
});
