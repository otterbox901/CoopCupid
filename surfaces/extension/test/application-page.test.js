import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { applicationCommand } from '../application-page.js';

// The wizard's relevant structure, scrubbed of real IDs, documents and actions.
const fixture = `<form id="applyForm"><input type="hidden" name="postingId" value="123">
<div id="applicationOptions" class="js--ui-wizard-step"><input type="radio" name="applyOption" value="customPkg"><div class="js--applyOption-customPkg"><input id="packageName" name="name">
<fieldset><legend>*University of Waterloo Co-op Work History</legend><input type="radio" class="customPkg" name="76" value="history" checked></fieldset>
<fieldset><legend>Cover Letter</legend><input type="radio" name="66" value="letter"></fieldset>
<fieldset><legend>*Résumé</legend><input type="radio" class="customPkg" name="67" value="old-resume" checked><button type="button" class="js--btn--upload-new-doc" data-dt-id="67" data-dt-name="Résumé">Upload</button></fieldset>
<fieldset><legend>*Grade Report</legend><input type="radio" class="customPkg" name="71" value="grades" checked></fieldset>
<fieldset><legend>Other - Per Job Posting</legend><input type="radio" name="70" value="other"></fieldset>
</div></div><div id="finalConfirmation" class="js--ui-wizard-step"></div></form><div id="applyWizard"></div>
<form id="fileUploadForm"><input name="docType"><input name="docName"><input type="checkbox" name="defaultDoc"></form>
<input type="file" id="fileUpload_docUpload"><input id="inputFileUpload_docUpload"><button id="submitFileUploadFormBtn">Upload</button>`;
const originalEvent = globalThis.Event;
function setup() {
  const { document, Event } = parseHTML(fixture);
  globalThis.document = document; globalThis.Event = Event;
  globalThis.location = { hostname: 'waterlooworks.uwaterloo.ca', pathname: '/myAccount/co-op/full/jobs.htm' };
  globalThis.$ = () => ({ data: () => ({}), valid: () => true });
  globalThis.$.ajax = options => options.success?.({ valid: true });
  globalThis.validateApplicationOptions = function() {
    let ret = true;
    $.ajax({ data: { action: 'live-submit' }, success(data) { ret = !!data.valid; } });
    return ret;
  };
  globalThis.DataTransfer = class { files = []; items = { add: file => this.files.push(file) }; };
  document.querySelector('.js--btn--upload-new-doc').click = () => { document.querySelector('[name="docType"]').value = '67'; };
  document.querySelector('#fileUpload_docUpload').addEventListener('change', () => { document.querySelector('#inputFileUpload_docUpload').value = 'local-upload-uuid'; });
  globalThis.uploadNewDoc = () => {
    document.querySelectorAll('[name="67"]').forEach(el => el.removeAttribute('checked'));
    const input = document.createElement('input'); input.type = 'radio'; input.name = '67'; input.value = 'new-resume'; input.setAttribute('checked', ''); input.className = 'customPkg';
    document.querySelector('.js--btn--upload-new-doc').before(input);
  };
}
afterEach(() => {
  globalThis.Event = originalEvent;
  for (const key of ['document', 'location', '$', 'DataTransfer', 'validateApplicationOptions', 'uploadNewDoc']) delete globalThis[key];
});
test('inspects the captured custom package and keeps transcript/work history', async () => {
  setup(); const result = await applicationCommand('inspect', { id: '123' });
  assert.equal(result.ok, true); assert.equal(result.value.ready, true);
});
test('skips required cover letters, unknown documents and missing transcript', async () => {
  for (const variant of ['letter', 'unknown', 'missing']) {
    setup();
    if (variant === 'letter') document.querySelector('[name="66"]').className = 'customPkg';
    if (variant === 'unknown') document.querySelector('[name="70"]').closest('fieldset').querySelector('legend').textContent = '*Portfolio';
    if (variant === 'missing') document.querySelector('[name="71"]').removeAttribute('checked');
    const result = await applicationCommand('inspect', { id: '123' });
    assert.equal(result.value.ready, false, variant);
  }
});
test('skips additional wizard steps and refuses a different posting', async () => {
  setup(); const extra = document.createElement('div'); extra.className = 'js--ui-wizard-step'; extra.id = 'preScreenQuestions'; document.querySelector('#applyForm').append(extra);
  assert.equal((await applicationCommand('inspect', { id: '123' })).value.ready, false);
  assert.equal((await applicationCommand('inspect', { id: '456' })).ok, false);
});
test('uploads the supplied PDF, selects its new document and gets a server receipt', async () => {
  setup();
  const result = await applicationCommand('prepare', { id: '123', resume: { name: 'resume.pdf', base64: btoa('%PDF-fixture') } });
  assert.equal(result.ok, true, result.error); assert.equal(result.value.ready, true);
  assert.equal(result.value.resumeDocumentId, 'new-resume');
  assert.equal(document.querySelector('[name="71"]:checked').value, 'grades');
  assert.equal(document.querySelector('[name="76"]:checked').value, 'history');
  assert.equal(document.querySelector('#fileUpload_docUpload').files[0].name, 'resume.pdf');
  assert.equal((await applicationCommand('submit', { id: '123' })).value.confirmed, true);
});
test('does not trust the wizard default return value when its request fails', async () => {
  setup();
  const form = document.querySelector('#applyForm'); form.dataset.coopmatchPrepared = '123'; form.dataset.coopmatchResume = 'old-resume';
  $.ajax = () => {}; const original = $.ajax;
  const result = await applicationCommand('submit', { id: '123' });
  assert.equal(result.ok, false); assert.match(result.error, /did not confirm/); assert.equal($.ajax, original);
});
test('refuses submission if the selected résumé changed after preparation', async () => {
  setup(); const form = document.querySelector('#applyForm'); form.dataset.coopmatchPrepared = '123'; form.dataset.coopmatchResume = 'different-resume';
  assert.match((await applicationCommand('submit', { id: '123' })).error, /résumé changed/);
});
