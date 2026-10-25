import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAboveThreshold, saveMatchesAbove } from '../folder.js';
const match = (id, interview) => ({ posting: { id }, interview });
test('cutoff is strictly above, uses interview score, and deduplicates IDs', () => {
  const results = matchesAboveThreshold([match('1', 70), match('2', 71), match('2', 80), { ...match('3', 69), fit: 100 }], 70);
  assert.deepEqual(results.map(m => m.posting.id), ['2']);
  assert.deepEqual(matchesAboveThreshold([match('1', 100)], 100), []);
});
test('invalid cutoffs fail before any folder operations', async () => {
  for (const threshold of [-1, 101, NaN, Infinity, '70']) {
    await assert.rejects(saveMatchesAbove({ matches: [], threshold, board: () => assert.fail('Must not call board'), signal: new AbortController().signal }), /cutoff/);
  }
});
test('saves all qualifying jobs including jobs beyond the displayed list, skipping live members', async () => {
  const added = [], updates = [];
  const result = await saveMatchesAbove({ matches: Array.from({ length: 60 }, (_, i) => match(String(i), 90)), threshold: 80, signal: new AbortController().signal,
    delay: async () => {}, onProgress: state => updates.push(state), board: async (command, payload) => {
      if (command === 'folder') return { ids: ['0'] };
      if (command === 'add') added.push(payload.id);
    } });
  assert.equal(added.length, 59); assert.ok(added.includes('59')); assert.ok(!added.includes('0'));
  assert.deepEqual(result, { added: 59, alreadySaved: 1, total: 60, stopped: false });
  assert.equal(updates.at(-1).ids.length, 60);
});
test('stop preserves confirmed saves and prevents later mutations', async () => {
  const controller = new AbortController(); const added = [];
  const result = await saveMatchesAbove({ matches: [match('1', 90), match('2', 90)], threshold: 80, signal: controller.signal, delay: async () => {},
    onProgress: state => { if (state.added) controller.abort(); }, board: async (command, payload) => {
      if (command === 'folder') return { ids: [] }; if (command === 'add') added.push(payload.id);
    } });
  assert.deepEqual(added, ['1']); assert.equal(result.added, 1); assert.equal(result.stopped, true);
});
test('save failure halts the batch and retains earlier confirmed progress', async () => {
  const updates = [], attempted = [];
  await assert.rejects(saveMatchesAbove({ matches: [match('1', 90), match('2', 90), match('3', 90)], threshold: 80, signal: new AbortController().signal, delay: async () => {},
    onProgress: state => updates.push(state), board: async (command, payload) => {
      if (command === 'folder') return { ids: [] };
      if (command === 'add') { attempted.push(payload.id); if (payload.id === '2') throw new Error('Save not confirmed'); }
    } }), /not confirmed/);
  assert.deepEqual(attempted, ['1', '2']); assert.deepEqual(updates.at(-1).ids, ['1']);
});
