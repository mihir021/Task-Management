import express from 'express';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createScriptsRouter } from './scriptsRouter';

// This process exposes only the authenticated Scripts API, bound to loopback.
// It does not expose workspace records, environment variables, or a network shell.
const origin = 'https://task-management-azure-iota.vercel.app';
const token = randomBytes(32).toString('hex');
const app = express();
app.use(express.json({ limit: '128kb' }));
app.use('/api/scripts', createScriptsRouter({
  dataDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data'),
  companion: { token, origin },
}));
app.use((_req, res) => res.status(404).json({ error: 'Local runner route not found.' }));
const server = app.listen(43123, '127.0.0.1', () => {
  console.log(`\nMIHIR local terminal runner\nListening only on http://127.0.0.1:43123\nWebsite: ${origin}\n\nPairing token (paste into Scripts → Connect local terminal):\n${token}\n\nKeep this terminal running. Ctrl+C stops the runner.\nCommands run as your current user; sudo prompts appear inside the web terminal.\n`);
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? 'Port 43123 is already in use. Use the existing runner terminal or stop it before starting another.' : error.message);
  process.exitCode = 1;
});
