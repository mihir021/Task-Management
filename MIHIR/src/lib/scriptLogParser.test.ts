import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScriptLogParser, readableLogText, logSummary, logRowsCsv } from './scriptLogParser';

const prefix = '[pod/ray-job-service-abcd-12345/ray-job-service] 2026-10-22T08:25:51.781135292Z ';
const record = (message = 'Unable to fetch cron config') => prefix + JSON.stringify({
  '@timestamp': '2026-10-22T08:25:51.781Z', level: 'ERROR', message,
  logger_name: 'com.example.RayConfigService', thread_name: 'ray-job-Executor-40', trace_id: 'trace-example',
  stack_trace: 'First frame\\n\\tat Example.run(Example.java:1)',
});

test('JSON logs become metadata and a concise message instead of raw escaped payloads', () => {
  const parser = new ScriptLogParser();
  parser.ingest(record() + '\n');
  const row = parser.records()[0];
  assert.equal(row.pod, 'ray-job-service-abcd-12345');
  assert.equal(row.container, 'ray-job-service');
  assert.equal(row.timestamp, '2026-10-22T08:25:51.781135292Z');
  assert.equal(row.level, 'ERROR'); assert.equal(row.message, 'Unable to fetch cron config');
  assert.equal(row.logger, 'com.example.RayConfigService'); assert.equal(row.traceId, 'trace-example');
  assert.match(readableLogText(row.stack), /First frame\n    at Example/);
  assert.equal(logSummary(row.message), 'Unable to fetch cron config');
  assert.match(row.raw, /"stack_trace"/);
});

test('stream chunks and embedded newlines do not create duplicate or broken records', () => {
  const parser = new ScriptLogParser();
  const line = record('A large message\nwith another line') + '\n';
  for (let index = 0; index < line.length; index += 17) parser.ingest(line.slice(index, index + 17));
  assert.equal(parser.records().length, 1);
  assert.equal(logSummary(parser.records()[0].message), 'A large message');
  parser.ingest(prefix + 'ERROR Plain-text failure\n    at Example.run(Example.java:2)\n');
  assert.equal(parser.records().length, 2);
  assert.match(parser.records()[1].continuation, /at Example.run/);
});

test('terminal metadata is removed and connection errors retain error severity', () => {
  const parser = new ScriptLogParser();
  parser.ingest('\x1b]777;MIHIR_STEP:pod-logs:Running\x07\x1b[32m[monitor] Attaching logs\x1b[0m\r\n');
  parser.ingest('error: You must be logged in to the server (Unauthorized)\n');
  assert.equal(parser.records()[0].message, '[monitor] Attaching logs');
  assert.equal(parser.records()[0].kind, 'system');
  assert.equal(parser.records()[1].level, 'ERROR');
  assert.doesNotMatch(parser.records()[0].raw, /MIHIR_STEP|\x1b/);
});

test('huge JSON messages still expose message and level, with a bounded raw row', () => {
  const parser = new ScriptLogParser();
  parser.ingest(record('Template generation failed: ' + 'x'.repeat(300000)) + '\n');
  const row = parser.records()[0];
  assert.equal(row.level, 'ERROR'); assert.equal(row.truncated, true);
  assert.ok(row.raw.length <= 256000);
  assert.ok(logSummary(row.message).length <= 190);
  assert.match(logSummary(row.message), /^Template generation failed/);
});

test('retention, resets and CSV escaping preserve useful records safely', () => {
  const parser = new ScriptLogParser();
  for (let index = 0; index < 600; index++) parser.ingest(record(String(index)) + '\n');
  assert.equal(parser.records().length, 500);
  assert.equal(parser.records()[0].message, '100');
  parser.reset(); parser.ingest(record('=HYPERLINK("untrusted")')); parser.finish();
  const csv = logRowsCsv(parser.records());
  assert.match(csv, /"'=HYPERLINK\(""untrusted""\)"/);
  assert.equal(parser.records().length, 1);
});
