/** MAIN-world driver for the captured WaterlooWorks application wizard. */
export async function applicationCommand(command, payload = {}) {
  try {
    if (location.hostname !== 'waterlooworks.uwaterloo.ca' || !location.pathname.endsWith('/jobs.htm')) throw new Error('Application page left WaterlooWorks.');
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const wait = async check => {
      for (let i = 0; i < 180; i++) { const value = check(); if (value) return value; await pause(250); }
      throw new Error('Application step timed out. Check the application tab before retrying.');
    };
    if (command === 'launch') {
      const form = document.createElement('form');
      form.method = 'POST'; form.action = location.pathname;
      if (!payload.fields?.action || String(payload.fields.postingId) !== String(payload.id)) throw new Error('Unrecognized application launch form.');
      for (const [name, value] of Object.entries(payload.fields)) {
        if (typeof value === 'object' && value !== null) throw new Error('Unrecognized application form parameter.');
        const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = String(value ?? ''); form.append(input);
      }
      document.body.append(form); form.submit();
      return { ok: true, value: true };
    }
    const form = document.querySelector('#applyForm');
    if (!form || String(form.querySelector('[name="postingId"]')?.value) !== String(payload.id)) throw new Error('Application page does not match this job.');
    if (typeof $ !== 'function' || !$('#applyWizard').data('uiWizard')) throw new Error('Application wizard is not ready.');
    const packageArea = form.querySelector('.js--applyOption-customPkg');
    const custom = form.querySelector('[name="applyOption"][value="customPkg"]');
    if (!custom || !packageArea || typeof validateApplicationOptions !== 'function') throw new Error('Unsupported application package form.');
    const extraSteps = [...form.querySelectorAll('.js--ui-wizard-step')].filter(step => !['applicationOptions', 'finalConfirmation'].includes(step.id));
    if (extraSteps.length) return { ok: true, value: { ready: false, reason: 'Application has additional questions or steps.' } };
    const groups = [...packageArea.querySelectorAll('fieldset')].map(el => {
      const label = (el.querySelector('legend')?.textContent || '').replace(/\s+/g, ' ').trim();
      return { el, label, required: label.startsWith('*') || !!el.querySelector('input.customPkg') };
    });
    const resumeGroup = groups.find(group => /r[eé]sum[eé]/i.test(group.label));
    if (!resumeGroup) throw new Error('Could not identify the résumé document field.');
    for (const group of groups) {
      if (group === resumeGroup) continue;
      if (group.required && !/grade report|transcript|co-op work history/i.test(group.label)) return { ok: true, value: { ready: false, reason: `Requires ${group.label.replace(/\(Clear Selection\)/g, '').trim()}.` } };
      if (group.required && !group.el.querySelector('input[type="radio"]:checked:not(:disabled)')) return { ok: true, value: { ready: false, reason: `No existing ${group.label.replace(/\(Clear Selection\)/g, '').trim()} selected.` } };
    }
    if (command === 'inspect') return { ok: true, value: { ready: true } };
    if (command === 'prepare') {
      if (!payload.resume?.base64 || !payload.resume.name) throw new Error('No résumé provided.');
      const bytes = Uint8Array.from(atob(payload.resume.base64), char => char.charCodeAt(0));
      if (bytes.byteLength > 5000000) return { ok: true, value: { ready: false, reason: 'WaterlooWorks requires a résumé under 5 MB.' } };
      custom.click();
      for (const group of groups) if (group !== resumeGroup && !group.required) {
        group.el.querySelectorAll('input[type="radio"]').forEach(input => { input.checked = false; });
      }
      const name = form.querySelector('#packageName');
      if (!name) throw new Error('Application package name field is missing.');
      name.value = `coopcupid-${payload.id}-${Date.now()}`; name.dispatchEvent(new Event('input', { bubbles: true }));
      const upload = resumeGroup.el.querySelector('.js--btn--upload-new-doc');
      if (!upload) throw new Error('Résumé upload control is missing.');
      upload.click();
      const docType = upload.getAttribute('data-dt-id');
      const docForm = document.querySelector('#fileUploadForm');
      if (!docForm || docForm.querySelector('[name="docType"]')?.value !== docType) throw new Error('Could not select the résumé upload type.');
      docForm.querySelector('[name="docName"]').value = payload.resume.name.replace(/\.pdf$/i, '').slice(0, 240);
      const defaultDoc = docForm.querySelector('[name="defaultDoc"]'); if (defaultDoc) defaultDoc.checked = false;
      const transfer = new DataTransfer(); transfer.items.add(new File([bytes], payload.resume.name, { type: 'application/pdf' }));
      const input = document.querySelector('#fileUpload_docUpload');
      if (!input || typeof uploadNewDoc !== 'function') throw new Error('Unsupported résumé upload widget.');
      input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(() => document.querySelector('#inputFileUpload_docUpload')?.value && !document.querySelector('#submitFileUploadFormBtn')?.disabled);
      const before = new Set([...resumeGroup.el.querySelectorAll('input[type="radio"]')].map(el => el.value));
      uploadNewDoc();
      const selected = await wait(() => {
        const selected = resumeGroup.el.querySelector('input[type="radio"]:checked:not(:disabled)');
        return selected && !before.has(selected.value) ? selected : null;
      });
      if (!$(form).valid()) return { ok: true, value: { ready: false, reason: 'WaterlooWorks requires more information for this application.' } };
      // Save the verified selection inside the application tab; no reusable auth data.
      form.dataset.coopmatchResume = selected.value;
      form.dataset.coopmatchPrepared = String(payload.id);
      return { ok: true, value: { ready: true, resumeDocumentId: selected.value } };
    }
    if (command === 'submit') {
      if (form.dataset.coopmatchPrepared !== String(payload.id)) throw new Error('Application was not prepared by CoopCupid.');
      const selected = resumeGroup.el.querySelector('input[type="radio"]:checked:not(:disabled)');
      if (selected?.value !== form.dataset.coopmatchResume) throw new Error('The selected résumé changed. Application stopped.');
      if (!$(form).valid()) throw new Error('Application form validation failed.');
      // This is the board's own submission function from the captured page.
      // Its synchronous AJAX call returns true only when the server says valid.
      const action = String(validateApplicationOptions).match(/action:\s*['"]([^'"]+)['"]/)?.[1];
      if (!action) throw new Error('Could not identify the submission action.');
      const ajax = $.ajax;
      let confirmed = false;
      $.ajax = function(options, ...rest) {
        if (options?.data?.action === action) {
          const success = options.success;
          options = { ...options, success(data, ...args) {
            confirmed = data?.valid === true;
            return success?.call(this, data, ...args);
          } };
        }
        return ajax.call(this, options, ...rest);
      };
      let valid;
      try { valid = validateApplicationOptions(); } finally { $.ajax = ajax; }
      if (valid !== true || !confirmed) throw new Error('WaterlooWorks did not confirm submission. Review the application tab.');
      return { ok: true, value: { confirmed: true, postingId: String(payload.id) } };
    }
    throw new Error('Unknown application operation.');
  } catch (error) { return { ok: false, error: error.message || String(error) }; }
}
