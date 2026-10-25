import { shootCupid } from './cupid.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import { rankLocally } from '../../packages/core/src/rank/local.ts';
import { boardCommand } from './board.js';
import { scanJobs } from './scan.js';
import { eligibility, runApplications } from './applications.js';
import { createApplicationAdapter } from './application-adapter.js';
import * as storage from './storage.js';
import { matchesAboveThreshold, saveMatchesAbove } from './folder.js';

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.mjs');
const $ = id => document.getElementById(id);
let resume, dataset = { postings: [], filters: [], complete: true }, matches = [], folderIds = new Set();
let folderPostings = new Map(), folderMatches = [];
let target, controller, view = 'results', busy = false;
let pendingBatch;
let visibleCount = 50;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function filters(values, prefix = 'Filters') { $('filters').textContent = `${prefix}: ${values.length ? values.join(' · ') : 'None — all current results'}`; }
async function findTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://waterlooworks.uwaterloo.ca/')) throw new Error('Open WaterlooWorks Jobs / Applications in the active tab.');
  target = tab.id;
}
async function board(command, payload = {}) {
  if (!target) throw new Error('Open WaterlooWorks first.');
  const results = await chrome.scripting.executeScript({ target: { tabId: target }, world: 'MAIN', func: boardCommand, args: [command, payload] });
  const result = results[0]?.result;
  if (!result?.ok) throw new Error(result?.error || 'Could not connect to WaterlooWorks. Reload the page.');
  return result.value;
}
function priorTerms() { return $('priorTerms').value === '' ? undefined : Number($('priorTerms').value); }
function rank() {
  matches = resume?.text?.trim() && dataset.postings.length ? rankLocally(resume.text, dataset.postings, priorTerms()) : [];
  const all = new Map(dataset.postings.map(p => [p.id, p]));
  for (const [id, p] of folderPostings) all.set(id, p);
  folderMatches = resume?.text?.trim() && all.size ? rankLocally(resume.text, [...all.values()].filter(p => folderIds.has(p.id)), priorTerms()) : [];
}
const numberFormat = new Intl.NumberFormat();
const pluralRules = new Intl.PluralRules();
function jobCount(count) { return `${numberFormat.format(count)} ${pluralRules.select(count) === 'one' ? 'job' : 'jobs'}`; }
function node(tag, value, className) { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; }
function showResume() {
  $('resumeName').textContent = resume?.name || 'Choose a PDF résumé';
  $('resumeHelp').textContent = resume ? 'Saved on this device · Select to replace' : 'PDF · Select to upload';
  $('resumeText').value = resume?.text || '';
  $('applyResume').textContent = resume ? `Selected résumé: ${resume.name}` : 'Select a résumé above.';
}
function cutoff() {
  const raw = $('bulkThreshold').value.trim();
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < 0 || value > 100) throw new Error('Choose a whole interview score cutoff from 0 to 100.');
  return value;
}
function renderBulk() {
  $('bulkArea').hidden = view !== 'results' || !matches.length;
  let threshold;
  try { threshold = cutoff(); } catch { /* Show validation without interrupting typing. */ }
  const valid = threshold !== undefined;
  const eligible = valid ? matchesAboveThreshold(matches, threshold) : [];
  const unsaved = eligible.filter(match => !folderIds.has(match.posting.id)).length;
  $('bulkSummary').textContent = valid ? `${jobCount(eligible.length)} above ${$('bulkThreshold').value}; ${numberFormat.format(unsaved)} not yet saved.${dataset.complete ? '' : ' These search results are partial.'}` : 'Enter a whole score from 0 to 100.';
  $('bulkSave').disabled = busy || !valid || !unsaved;
}
function render() {
  $('resultCount').textContent = matches.length;
  $('folderCount').textContent = folderIds.size;
  $('resultsTab').setAttribute('aria-pressed', String(view === 'results'));
  $('folderTab').setAttribute('aria-pressed', String(view === 'folder'));
  $('applyArea').hidden = view !== 'folder';
  $('autoApply').disabled = busy || !resume || !folderIds.size;
  renderBulk();
  $('results').replaceChildren();
  const visible = view === 'folder' ? folderMatches : matches;
  if (!visible.length) {
    const empty = node('div', undefined, 'empty');
    empty.append(node('span', '✳', 'empty-art'), node('p', view === 'folder' ? 'Your shortlist' : 'Your next move', 'eyebrow'), node('h2', view === 'folder' ? 'Good things go here.' : 'Good things ahead.'), node('p', view === 'folder' ? 'Save jobs from your matches or add them directly to coopcupid in WaterlooWorks.' : 'Choose a résumé, then search to discover the roles that fit.'));
    empty.querySelector('.empty-art').setAttribute('aria-hidden', 'true');
    $('results').append(empty);
  }
  for (const match of visible.slice(0, visibleCount)) {
    const p = match.posting;
    const card = node('article', undefined, 'job');
    card.append(node('p', p.org, 'org'), node('h3', p.title), node('p', [p.location, `#${p.id}`, p.deadlineLabel && `Due ${p.deadlineLabel}`].filter(Boolean).join(' · '), 'meta'));
    const scores = node('div', undefined, 'scores');
    for (const [label, value, className] of [['Interview', match.interview, 'interview'], ['Fit', match.fit, 'fit']]) {
      const score = node('div', undefined, className); const strong = node('strong', String(value));
      strong.append(node('small', ' / 100')); score.append(strong, node('span', label)); scores.append(score);
    }
    card.append(scores);
    const details = node('details'); details.append(node('summary', 'Why this match?'));
    const reasons = node('ul'); match.reasons.forEach(r => reasons.append(node('li', r))); details.append(reasons);
    if (match.matched.length) details.append(node('p', `Résumé matches: ${match.matched.join(', ')}`));
    if (match.gaps.length) details.append(node('p', `Not found in résumé: ${match.gaps.join(', ')}. These may include optional skills.`));
    card.append(details);
    if (p.jdText) {
      const description = node('details'); description.append(node('summary', 'Read full posting'), node('p', p.jdText)); card.append(description);
    }
    const actions = node('div', undefined, 'job-actions');
    const open = node('button', 'View in WaterlooWorks', 'text-button');
    open.disabled = busy; open.addEventListener('click', () => guarded(async () => { await findTab(); await board('open', { id: p.id }); }));
    const saved = folderIds.has(p.id); const save = node('button', saved ? 'Remove from CoopCupid' : 'Add to CoopCupid', 'secondary save-cupid');
    save.disabled = busy; save.addEventListener('click', event => {
      const origin = event.detail > 0 ? save.getBoundingClientRect() : null;
      return exclusive(async () => {
      await findTab(); await board(saved ? 'remove' : 'add', { id: p.id });
      if (saved) folderIds.delete(p.id); else folderIds.add(p.id);
      rank(); status(`${saved ? 'Removed' : 'Saved'} ${p.title} ${saved ? 'from' : 'to'} CoopCupid.`);
      if (!saved) shootCupid(origin);
    }); });
    actions.append(open, save); card.append(actions); $('results').append(card);
  }
  if (visible.length > visibleCount) {
    const more = node('button', `Show more jobs (${visible.length - visibleCount} remaining)`, 'secondary');
    more.addEventListener('click', () => { visibleCount += 50; render(); }); $('results').append(more);
  }
}
async function guarded(fn) { try { await fn(); } catch (error) { status(error.message, true); } }
async function exclusive(fn, stoppable = false) {
  return navigator.locks.request('coopmatch-operation', { ifAvailable: true }, lock => {
    if (!lock) { status('CoopCupid is already running in another panel. Wait for it to finish.', true); return; }
    return exclusiveInner(fn, stoppable);
  });
}
async function exclusiveInner(fn, stoppable = false) {
  if (busy) return;
  busy = true; controller = new AbortController();
  $('results').setAttribute('aria-busy', 'true');
  for (const id of ['search', 'refresh', 'resumeFile', 'saveText', 'priorTerms', 'clear', 'folderTab', 'resultsTab', 'reviewBatch', 'bulkThreshold', 'autoSave']) $(id).disabled = true;
  $('stop').hidden = !stoppable; $('progress').hidden = !stoppable; $('progress').removeAttribute('value'); render();
  try { await fn(controller.signal); }
  catch (error) { status(error.message, true); }
  finally {
    busy = false; controller = null;
    $('results').setAttribute('aria-busy', 'false');
    for (const id of ['search', 'refresh', 'resumeFile', 'saveText', 'priorTerms', 'clear', 'folderTab', 'resultsTab', 'reviewBatch', 'bulkThreshold', 'autoSave']) $(id).disabled = false;
    $('stop').hidden = true; $('progress').hidden = true; render();
  }
}
async function saveAbove(signal, threshold) {
  const result = await saveMatchesAbove({ matches, threshold, board, signal, onProgress: progress => {
    folderIds = new Set(progress.ids); rank(); render();
    $('progress').max = Math.max(1, progress.total); $('progress').value = progress.added + progress.alreadySaved;
    status(`Saving jobs above ${threshold} · ${progress.added} added, ${progress.alreadySaved} already saved.`);
  } });
  status(`${result.stopped ? 'Saving stopped' : 'Saving complete'} · ${result.added} added to coopcupid, ${result.alreadySaved} already saved.`);
}
async function saveFolderPreferences() {
  await storage.write('folderPreferences', { threshold: cutoff(), automatic: $('autoSave').checked });
}
$('bulkThreshold').addEventListener('input', () => { renderBulk(); if ($('bulkThreshold').checkValidity()) guarded(saveFolderPreferences); });
$('autoSave').addEventListener('change', () => guarded(saveFolderPreferences));
$('bulkSave').addEventListener('click', event => {
  const origin = event.detail > 0 ? $('bulkSave').getBoundingClientRect() : null;
  return exclusive(async signal => {
    const before = folderIds.size;
    const threshold = cutoff(); await findTab(); await saveAbove(signal, threshold);
    if (folderIds.size > before) shootCupid(origin);
  }, true);
});
async function loadFolder(signal) {
  const folder = await board('folder'); folderIds = new Set(folder.ids);
  const known = new Set([...dataset.postings.map(p => p.id), ...folderPostings.keys()]);
  for (const id of folder.ids) {
    if (signal?.aborted) break;
    if (!known.has(id)) {
      status(`Reading saved job ${id}…`);
      const detail = await board('detail', { id });
      folderPostings.set(id, detail);
      await new Promise(resolve => setTimeout(resolve, 700));
    }
  }
  rank(); render();
}
$('refresh').addEventListener('click', () => exclusive(async () => { await findTab(); const snapshot = await board('snapshot'); filters(snapshot.filters); status(`${snapshot.countLabel || 'Current search'} · Ready to search.`); }));
$('resumeFile').addEventListener('change', () => exclusive(async () => {
  const file = $('resumeFile').files[0]; if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a PDF under 10 MB.');
  status('Reading your résumé on this device…');
  const data = await file.arrayBuffer();
  if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') throw new Error('Choose a valid PDF résumé.');
  const loading = getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false, useSystemFonts: true });
  const pdf = await loading.promise;
  let text = '';
  try {
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      text += content.items.map(item => ('str' in item ? item.str : '') + (item.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
  } finally { await loading.destroy(); }
  const nextResume = { name: file.name, data, text, type: 'application/pdf' };
  await storage.write('resume', nextResume); resume = nextResume; showResume(); rank();
  status(text.trim().split(/\s+/).length < 10 ? 'This PDF has little readable text. Paste your résumé text under Review extracted text.' : 'Résumé saved locally. Review the extracted text, then Search.');
}));
$('saveText').addEventListener('click', () => exclusive(async () => {
  if (!resume) throw new Error('Upload the PDF you want to use for applications first.');
  const next = { ...resume, text: $('resumeText').value };
  rankLocally(next.text, []); await storage.write('resume', next); resume = next; rank(); status('Matching text updated. The original PDF is kept for applications.');
}));
$('priorTerms').addEventListener('change', () => guarded(async () => {
  if (!$('priorTerms').checkValidity()) { $('priorTerms').reportValidity(); return; }
  await storage.write('priorTerms', $('priorTerms').value); rank(); render();
}));
$('search').addEventListener('click', () => exclusive(async signal => {
  if (!resume) throw new Error('Upload your résumé first.'); rankLocally(resume.text, []);
  const automaticThreshold = $('autoSave').checked ? cutoff() : null;
  if (!$('priorTerms').checkValidity()) throw new Error('Completed co-op terms must be a whole number from 0 to 20.');
  await findTab();
  const snapshot = await board('snapshot'); filters(snapshot.filters);
  dataset = { postings: [], filters: snapshot.filters, complete: false }; matches = [];
  view = 'results'; visibleCount = 50; status('Creating or finding your coopcupid folder…');
  try { await scanJobs({ board, signal, onProgress: async result => {
    dataset = result;
    if (result.postings.length === 1 || result.postings.length % 10 === 0 || result.complete || signal.aborted) {
      rank();
      await storage.write('dataset', dataset); render();
    }
    status(`Page ${result.page} · ${result.postings.length} jobs matched…`);
  } }); } catch (error) {
    dataset.complete = false; rank(); await storage.write('dataset', dataset); throw error;
  }
  await storage.write('dataset', dataset);
  const folder = await board('folder'); folderIds = new Set(folder.ids); rank();
  status(`${dataset.complete ? 'Search complete' : 'Stopped — partial results'} · ${matches.length} jobs, sorted by interview score.`);
  if (dataset.complete && !signal.aborted && automaticThreshold !== null) await saveAbove(signal, automaticThreshold);
}, true));
$('stop').addEventListener('click', () => { controller?.abort(); status('Stopping after the current request…'); });
$('resultsTab').addEventListener('click', () => { view = 'results'; visibleCount = 50; render(); });
$('folderTab').addEventListener('click', () => exclusive(async signal => {
  if (!resume) throw new Error('Upload your résumé to score your folder jobs.');
  await findTab(); await loadFolder(signal); view = 'folder'; visibleCount = 50; status(`${jobCount(folderIds.size)} in your WaterlooWorks coopcupid folder.`);
}, true));
$('reviewBatch').addEventListener('click', () => exclusive(async signal => {
  await findTab(); await loadFolder(signal);
  $('runLog').hidden = false; $('runLog').replaceChildren();
  let checked = 0;
  for (const id of folderIds) {
    if (signal.aborted) break;
    const posting = await board('detail', { id });
    const reason = eligibility(posting);
    $('runLog').append(node('p', `${posting.title || id}: ${reason || 'Initial checks passed. Application-package requirements still need verification in WaterlooWorks.'}`));
    status(`Checked ${++checked} of ${folderIds.size} saved jobs.`);
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  status(`${signal.aborted ? 'Stopped' : 'Review complete'}. No applications were submitted.`);
}, true));
$('autoApply').addEventListener('click', () => exclusive(async () => {
  if (!resume?.data) throw new Error('Select your résumé first.');
  if (resume.data.byteLength > 5000000) throw new Error('WaterlooWorks accepts PDFs under 5 MB. Choose a smaller résumé.');
  await findTab();
  const inflight = await storage.read('inflight');
  if (inflight) {
    const prior = await board('detail', { id: inflight.id });
    if (prior.application?.hasApplication) await storage.write('inflight', null);
    else throw new Error(`Submission for #${inflight.id} is unconfirmed. Check it in WaterlooWorks. Clear local data only after confirming it was not submitted.`);
  }
  const folder = await board('folder'); folderIds = new Set(folder.ids);
  if (!folder.ids.length) throw new Error('Your coopcupid folder is empty. Save some jobs first.');
  pendingBatch = { ids: folder.ids, resume: structuredClone(resume), tabId: target };
  $('batchSummary').textContent = `${jobCount(folder.ids.length)} saved. Selected résumé: ${resume.name}.`;
  $('applyDialog').showModal();
}));
$('cancelApply').addEventListener('click', () => { pendingBatch = null; $('applyDialog').close(); });
$('applyDialog').addEventListener('cancel', () => { pendingBatch = null; });
$('confirmApply').addEventListener('click', () => {
  const batch = pendingBatch; pendingBatch = null; $('applyDialog').close();
  if (!batch) return;
  exclusive(async signal => {
    target = batch.tabId;
    const adapter = createApplicationAdapter(board, batch.tabId, status);
    $('runLog').hidden = false; $('runLog').replaceChildren();
    let results = [];
    try {
      results = await runApplications({ ids: batch.ids, resume: batch.resume, adapter, signal, onProgress: records => {
        $('runLog').replaceChildren(...records.map(record => node('p', `#${record.id} · ${record.status}${record.reason ? ': ' + record.reason : ''}`)));
        const done = records.filter(r => ['applied', 'skipped', 'failed', 'stopped'].includes(r.status)).length;
        $('progress').max = batch.ids.length; $('progress').value = done;
        status(`${done} of ${batch.ids.length} processed · ${records.filter(r => r.status === 'applied').length} applied.`);
      } });
    } finally { await adapter.cleanup(results.some(record => record.status === 'failed')); }
    await storage.write('lastBatch', results);
    const failed = results.some(r => r.status === 'failed');
    status(`${failed ? 'Batch stopped — review the application tab' : signal.aborted ? 'Batch stopped' : 'Batch complete'} · ${results.filter(r => r.status === 'applied').length} applied, ${results.filter(r => r.status === 'skipped').length} skipped.`, failed);
  }, true);
});
$('clear').addEventListener('click', () => $('clearDialog').showModal());
$('cancelClear').addEventListener('click', () => $('clearDialog').close());
$('confirmClear').addEventListener('click', () => {
  $('clearDialog').close();
  exclusive(async () => {
  await storage.clear(); resume = null; dataset = { postings: [], filters: [], complete: true }; matches = []; folderIds.clear(); folderPostings.clear(); folderMatches = [];
  view = 'results'; visibleCount = 50;
  $('priorTerms').value = ''; $('resumeFile').value = ''; $('runLog').replaceChildren(); $('runLog').hidden = true; showResume(); status('Local résumé and matching data cleared.');
  $('bulkThreshold').value = '70'; $('autoSave').checked = false;
  });
});
await guarded(async () => {
  [resume, dataset] = await Promise.all([storage.read('resume'), storage.read('dataset')]);
  dataset ??= { postings: [], filters: [], complete: true };
  $('priorTerms').value = (await storage.read('priorTerms')) ?? '';
  const preferences = await storage.read('folderPreferences');
  $('bulkThreshold').value = String(preferences?.threshold ?? 70); $('autoSave').checked = preferences?.automatic === true;
  showResume(); rank(); render();
  const inflight = await storage.read('inflight');
  if (dataset.postings.length) { filters(dataset.filters, 'Last search filters'); status(`${dataset.complete ? 'Last search' : 'Partial search'} · ${dataset.postings.length} jobs loaded from this browser.`); }
  if (inflight) status(`The previous submission for #${inflight.id} was interrupted. Check its status in WaterlooWorks before retrying.`, true);
  try { await findTab(); const snapshot = await board('snapshot'); filters(snapshot.filters); } catch { /* The panel remains usable away from the board. */ }
});
