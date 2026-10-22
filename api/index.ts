import express from 'express';
import { apiRouter } from '../MIHIR/server/apiRouter';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount workspace REST API directly
app.use('/api', apiRouter);

export default app;
