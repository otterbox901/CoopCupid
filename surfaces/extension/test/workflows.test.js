import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanJobs } from '../scan.js';
import { eligibility, runApplications } from '../applications.js';
const eligible = { id: '1', application: { verified: true, canApply: true, hasApplication: false, external: false, hasPreScreening: false, requirementsText: 'Resume and transcript' } };
const resume = { name: 'resume.pdf', data: new ArrayBuffer(4) };
test('scan starts at first page, covers all filtered results, and never auto-saves jobs', async () => {
  let page = 1; const commands = [];
  const snapshot = () => ({ postings: [{ id: String(page + 1), title: 'Developer' }], filters: ['Remote'], filterKey: 'remote', page: String(page + 1), hasNext: page === 0 });
  const result = await scanJobs({ signal: new AbortController().signal, delay: async () => {}, onProgress: async () => {}, board: async (command, payload) => {
    commands.push(command);
    if (command === 'navigate') page = payload.direction === 'first' ? 0 : page + 1;
    if (command === 'detail') return { id: payload.id, jdText: 'Python' };
    return snapshot();
  } });
  assert.deepEqual(result.postings.map(p => p.id), ['1', '2']);
  assert.equal(result.complete, true); assert.ok(commands.includes('ensureFolder')); assert.ok(!commands.includes('add'));
});
test('scan aborts if filters change', async () => {
  let calls = 0;
  await assert.rejects(scanJobs({ signal: new AbortController().signal, onProgress: async () => {}, board: async () => ({ postings: [], filters: [], filterKey: calls++ ? 'changed' : 'original' }) }), /filters changed/);
});
test('stop leaves explicit partial results and prevents later details', async () => {
  const controller = new AbortController(); let reads = 0;
  const snapshot = { postings: [{ id: '1' }, { id: '2' }], filters: [], filterKey: '', page: '1', hasNext: false };
  const result = await scanJobs({ signal: controller.signal, delay: async () => {}, onProgress: async () => controller.abort(), board: async command => { if (command === 'detail') { reads++; return {}; } return snapshot; } });
  assert.equal(reads, 1); assert.equal(result.complete, false);
});
test('preflight skips unknown, cover letter, screening, external, and existing applications', () => {
  assert.equal(eligibility(eligible), null);
  assert.ok(eligibility({}));
  for (const changes of [{ hasApplication: true }, { external: true }, { hasPreScreening: true }, { canApply: false }, { requirementsText: 'Cover Letter' }, { requirementsText: 'Additional information' }]) {
    assert.ok(eligibility({ ...eligible, application: { ...eligible.application, ...changes } }));
  }
});
test('batch deduplicates and rechecks membership before submitting', async () => {
  let submitted = 0;
  const result = await runApplications({ ids: ['1', '1', '2'], resume, signal: new AbortController().signal, adapter: {
    members: async () => ['1'], detail: async () => eligible, prepare: async () => ({ ready: true }), submit: async () => { submitted++; return { confirmed: true }; },
  } });
  assert.equal(submitted, 1); assert.deepEqual(result.map(r => r.status), ['applied', 'skipped']);
});
test('stop during preparation prevents submit', async () => {
  const controller = new AbortController(); let submitted = false;
  const result = await runApplications({ ids: ['1'], resume, signal: controller.signal, adapter: {
    members: async () => ['1'], detail: async () => eligible, prepare: async () => { controller.abort(); return { ready: true }; }, submit: async () => { submitted = true; },
  } });
  assert.equal(submitted, false); assert.equal(result[0].status, 'stopped');
});
test('uncertain submission halts batch without automatic retry', async () => {
  let submits = 0;
  const result = await runApplications({ ids: ['1', '2'], resume, signal: new AbortController().signal, adapter: {
    members: async () => ['1', '2'], detail: async () => eligible, prepare: async () => ({ ready: true }), submit: async () => { submits++; return {}; },
  } });
  assert.equal(submits, 1); assert.equal(result[0].status, 'failed'); assert.match(result[0].reason, /uncertain/);
});
