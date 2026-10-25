import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { boardCommand } from '../board.js';

// Scrubbed structural fixture derived from the user's search-page capture.
const html = `<div id="dataViewerPlaceholder"><button aria-label="Clear Filter: Level: Junior"></button>
<table class="data-viewer-table"><thead><tr>
${['ID', 'Job Title', 'Organization', 'Division', 'Openings', 'City', 'Level', 'Apps', 'App Deadline'].map(label => `<th><span class="js--data-grid--header--label">${label}</span></th>`).join('')}
</tr></thead><tbody><tr class="table__row--body"><th><input id="resultRow_123" value="123" type="checkbox"><button aria-label="Apply">Apply</button>123</th>
<td><a>Software Developer</a></td><td>Employer A</td><td>Division A</td><td>2</td><td>Waterloo</td><td>Junior, Intermediate</td><td>40</td><td>Oct 30</td></tr></tbody></table>
<a class="pagination__link active disabled">1</a><a aria-label="Go to next page" class="pagination__link disabled"></a><div class="table--view__pagination--data">1–1 of 1</div></div>`;
function setup() {
  globalThis.document = parseHTML(html).document;
  globalThis.location = { hostname: 'waterlooworks.uwaterloo.ca', pathname: '/myAccount/co-op/full/jobs.htm' };
  globalThis.dataViewerApp = { getFolders() {}, getPostingsInFolders() {} };
  globalThis.dataViewerRoot = { methods: {
    getFolders() { return { action: 'live-folder-list' }; },
    getPostingsInFolders() { return { action: 'live-members' }; },
  } };
  globalThis.docViewerEmptyState = { methods: { createUpdateFolder() { return { action: 'live-create' }; } } };
  globalThis.folderAssignSidebar = { methods: { saveForm() { return { action: 'live-assign' }; } } };
}
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ['document', 'location', 'dataViewerApp', 'dataViewerRoot', 'docViewerEmptyState', 'folderAssignSidebar']) delete globalThis[key];
});
test('parses actual table structure, named columns, filter labels and competition', async () => {
  setup();
  const result = await boardCommand('snapshot');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.filters, ['Level: Junior']);
  const [p] = result.value.postings;
  assert.equal(p.id, '123'); assert.equal(p.title, 'Software Developer');
  assert.equal(p.org, 'Employer A'); assert.equal(p.location, 'Waterloo');
  assert.deepEqual(p.competition, { applicantCount: 40, openings: 2 });
  assert.equal(result.value.hasNext, false);
});
test('creates coopcupid once using live actions, then reuses a case-insensitive folder', async () => {
  setup(); let all = []; let creates = 0;
  globalThis.fetch = async (url, { body }) => {
    assert.equal(url, '/myAccount/co-op/full/jobs.htm');
    if (body.get('action') === 'live-create') { assert.equal(body.get('folderName'), 'coopcupid'); creates++; all = [{ id: 9, name: 'CoopCupid' }]; return new Response('{}'); }
    return new Response(JSON.stringify(all));
  };
  assert.deepEqual((await boardCommand('ensureFolder')).value, { id: '9', name: 'CoopCupid' });
  await boardCommand('ensureFolder'); assert.equal(creates, 1);
});
test('add verifies server membership and avoids repeating saved jobs', async () => {
  setup(); let assignments = 0; let map = {};
  globalThis.fetch = async (url, { body }) => {
    const action = body.get('action');
    if (action === 'live-folder-list') return new Response('[{"id":9,"name":"coopcupid"}]');
    if (action === 'live-members') return new Response(JSON.stringify(map));
    assert.equal(action, 'live-assign'); assert.deepEqual(body.getAll('postingIds'), ['123']); assert.equal(body.has('postingIds[]'), false); assert.equal(body.get('selectedFolder'), '9');
    assignments++; map = { 123: [9] }; return new Response('{}');
  };
  assert.equal((await boardCommand('add', { id: '123' })).ok, true);
  await boardCommand('add', { id: '123' }); assert.equal(assignments, 1);
});
test('folder save uses Orbis traditional array encoding; bracketed IDs are ignored by the server', async () => {
  setup(); const map = {}; let refreshes = 0;
  globalThis.dataViewerApp.getPostingsInFolders = () => { refreshes++; };
  globalThis.fetch = async (url, { body }) => {
    switch (body.get('action')) {
      case 'live-folder-list': return new Response('[{"id":9,"name":"coopcupid"}]');
      case 'live-members': return new Response(JSON.stringify(map));
      case 'live-assign':
        // Model the actual server contract, including its empty success response
        // when a request supplies postingIds[] instead of postingIds.
        for (const id of body.getAll('postingIds')) map[id] = [Number(body.get('selectedFolder'))];
        return new Response('{}');
      default: throw new Error('Unexpected action');
    }
  };
  const result = await boardCommand('add', { id: 123 });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(map, { 123: [9] });
  assert.equal(refreshes, 1);
  assert.deepEqual((await boardCommand('folder')).value.ids, ['123']);
});
test('a save response without changed membership still reports failure', async () => {
  setup();
  globalThis.fetch = async (url, { body }) => new Response(body.get('action') === 'live-folder-list' ? '[{"id":9,"name":"coopcupid"}]' : '{}');
  const result = await boardCommand('add', { id: '123' });
  assert.equal(result.ok, false);
  assert.match(result.error, /did not confirm/);
});
test('remove clears coopcupid membership, verifies removal and is idempotent', async () => {
  setup(); let map = { 123: [9] }; let writes = 0;
  globalThis.fetch = async (url, { body }) => {
    if (body.get('action') === 'live-folder-list') return new Response('[{"id":9,"name":"coopcupid"}]');
    if (body.get('action') === 'live-members') return new Response(JSON.stringify(map));
    assert.equal(body.get('action'), 'live-assign'); assert.equal(body.get('selectedFolder'), '');
    assert.deepEqual(body.getAll('postingIds'), ['123']); assert.equal(body.get('blacklist'), 'false');
    writes++; map = {}; return new Response('{}');
  };
  assert.equal((await boardCommand('remove', { id: '123' })).ok, true);
  assert.deepEqual((await boardCommand('folder')).value.ids, []);
  assert.equal((await boardCommand('remove', { id: '123' })).ok, true); assert.equal(writes, 1);
});
test('remove preserves an existing other folder assignment', async () => {
  setup(); let map = { 123: [9, 10] };
  globalThis.fetch = async (url, { body }) => {
    if (body.get('action') === 'live-folder-list') return new Response('[{"id":9,"name":"coopcupid"}]');
    if (body.get('action') === 'live-members') return new Response(JSON.stringify(map));
    assert.equal(body.get('selectedFolder'), '10'); map = { 123: [10] }; return new Response('{}');
  };
  assert.equal((await boardCommand('remove', { id: '123' })).ok, true);
  assert.deepEqual(map, { 123: [10] });
});
test('remove reports failure if the server keeps the job in coopcupid', async () => {
  setup();
  globalThis.fetch = async (url, { body }) => new Response(body.get('action') === 'live-folder-list' ? '[{"id":9,"name":"coopcupid"}]' : body.get('action') === 'live-members' ? '{"123":[9]}' : '{}');
  assert.match((await boardCommand('remove', { id: '123' })).error, /did not confirm/);
});
test('rejects expired sessions and foreign pages instead of reporting success', async () => {
  setup(); globalThis.fetch = async () => new Response('<title>Sign in</title>');
  assert.match((await boardCommand('ensureFolder')).error, /session expired/);
  globalThis.location.hostname = 'example.com'; assert.equal((await boardCommand('snapshot')).ok, false);
});
test('fails explicitly if a live action changes or folder limit is reached', async () => {
  setup(); globalThis.dataViewerRoot.methods.getFolders = () => ({});
  assert.match((await boardCommand('ensureFolder')).error, /has changed/);
  setup(); globalThis.dataViewerApp.maxFolders = 1;
  globalThis.fetch = async () => new Response('[{"id":1,"name":"another folder"}]');
  assert.match((await boardCommand('ensureFolder')).error, /folder limit/);
});

test('reuses an existing CoopMatch folder after the CoopCupid rename', async () => {
  setup();
  globalThis.fetch = async (url, { body }) => {
    assert.equal(body.get('action'), 'live-folder-list', 'must not create a duplicate folder');
    return new Response('[{"id":7,"name":"CoopMatch"}]');
  };
  assert.deepEqual((await boardCommand('ensureFolder')).value, { id: '7', name: 'CoopMatch' });
});
