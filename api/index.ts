import express from 'express';
import { apiRouter } from '../MIHIR/server/apiRouter.js';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Commands must execute on the user's machine, never in a serverless function.
app.use('/api/scripts', (_req, res) => res.status(503).json({
  error: 'Connect the local terminal runner to use Scripts on this computer.',
  code: 'LOCAL_RUNNER_REQUIRED',
}));

// Mount workspace REST API directly
app.use('/api', apiRouter);

export default app;
