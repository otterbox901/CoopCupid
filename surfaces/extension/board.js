/** Executed in the page's MAIN world. Keep every helper inside this function. */
export async function boardCommand(command, payload = {}) {
  try {
    if (location.hostname !== 'waterlooworks.uwaterloo.ca' || !location.pathname.endsWith('/jobs.htm')) {
      throw new Error('Open the WaterlooWorks Jobs / Applications search page first.');
    }
    const root = typeof dataViewerApp !== 'undefined' ? dataViewerApp : null;
    if (!root) throw new Error('WaterlooWorks search is not ready. Reload the page and open All Jobs.');
    const text = value => {
      const template = document.createElement('template');
      template.innerHTML = String(value ?? '');
      template.content.querySelectorAll('script, style').forEach(el => el.remove());
      return [...template.content.childNodes].map(node => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
    };
    const token = fn => {
      const match = String(fn).match(/action:\s*['"]([^'"]+)['"]/);
      if (!match) throw new Error('WaterlooWorks has changed: could not identify this operation.');
      return match[1];
    };
    const post = async (fn, data = {}, json = true) => {
      const body = new URLSearchParams({ action: token(fn) });
      for (const [key, value] of Object.entries(data)) {
        // OrbisApp.js sets $.ajaxSetup({traditional: true}). Match its $.post
        // encoding: repeated bare keys, rather than jQuery's default key[].
        if (Array.isArray(value)) value.forEach(v => body.append(key, String(v)));
        else body.append(key, String(value));
      }
      const response = await fetch(location.pathname, { method: 'POST', credentials: 'same-origin', body, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`WaterlooWorks returned ${response.status}. Please retry later.`);
      const raw = await response.text();
      if (/name=["'](?:password|username)|<title>[^<]*(?:login|sign in)/i.test(raw)) throw new Error('Your WaterlooWorks session expired. Sign in again.');
      if (!json) return raw;
      let result;
      try { result = JSON.parse(raw); } catch { throw new Error('Unexpected response from WaterlooWorks. Sign in again or reload the page.'); }
      if (result?.error) throw new Error(text(result.message) || 'WaterlooWorks could not complete this operation.');
      return result;
    };
    const methods = typeof dataViewerRoot !== 'undefined' ? dataViewerRoot.methods : null;
    const folders = async () => {
      const value = await post(methods?.getFolders);
      if (!Array.isArray(value)) throw new Error('Unrecognized folder response.');
      return value;
    };
    const getFolder = async (create = false) => {
      let all = await folders();
      let folder = all.find(f => text(f.name).toLowerCase() === 'coopcupid') || all.find(f => text(f.name).toLowerCase() === 'coopmatch');
      if (!folder && create) {
        if (all.length >= (root.maxFolders ?? 10)) throw new Error('Your WaterlooWorks folder limit is reached. Free a folder or rename one to coopcupid.');
        await post(typeof docViewerEmptyState !== 'undefined' ? docViewerEmptyState.methods.createUpdateFolder : null, { folderName: 'coopcupid' });
        all = await folders();
        folder = all.find(f => text(f.name).toLowerCase() === 'coopcupid') || all.find(f => text(f.name).toLowerCase() === 'coopmatch');
        root.getFolders();
      }
      if (!folder) throw new Error('No coopcupid folder yet. Run Search to create it.');
      return { id: String(folder.id), name: text(folder.name) };
    };
    const folderMemberships = async () => {
      const map = await post(methods?.getPostingsInFolders);
      if (!map || typeof map !== 'object') throw new Error('Unrecognized folder membership response.');
      return map;
    };
    const membership = async folderId => {
      const map = await folderMemberships();
      return Object.entries(map).filter(([, ids]) => Array.isArray(ids) && ids.map(String).includes(String(folderId))).map(([id]) => id);
    };
    const snapshot = () => {
      const table = document.querySelector('.data-viewer-table');
      if (!table) throw new Error('Switch WaterlooWorks to table view before searching.');
      const labels = [...table.querySelectorAll('thead th')].map(th => text(th.querySelector('.js--data-grid--header--label')?.textContent));
      const postings = [...table.querySelectorAll('tbody tr')].flatMap(row => {
        const input = row.querySelector('input[id^="resultRow_"]');
        if (!input) return [];
        const cells = [...row.children];
        const value = label => text(cells[labels.indexOf(label)]?.textContent);
        const number = label => {
          const raw = value(label).replace(/,/g, '');
          return /^\d+$/.test(raw) ? Number(raw) : undefined;
        };
        return [{ id: String(input.value), board: 'waterlooworks', title: value('Job Title'), org: value('Organization'),
          location: value('City'), levelsAccepted: value('Level').split(',').map(s => s.trim()).filter(Boolean),
          jdText: '', competition: { applicantCount: number('Apps'), openings: number('Openings') },
          deadlineLabel: value('App Deadline') }];
      });
      const filters = [...document.querySelectorAll('[aria-label^="Clear Filter:"], [aria-label^="Clear Filter: Keyword:"]')]
        .map(el => el.getAttribute('aria-label').replace(/^Clear Filter:\s*/, ''));
      // Some builds expose applied values through the viewer. Include them in the
      // fingerprint, while keeping human-readable filter chips as the display.
      const applied = root.$dataViewer?.appliedFilters;
      const filterKey = JSON.stringify({ filters, applied: applied && typeof applied === 'object' ? applied : null });
      const active = document.querySelector('.pagination__link.active');
      const next = document.querySelector('[aria-label="Go to next page"]');
      return { postings, filters, filterKey, page: text(active?.textContent) || '1',
        hasNext: !!next && !next.classList.contains('disabled') && next.getAttribute('aria-disabled') !== 'true',
        countLabel: text(document.querySelector('.table--view__pagination--data')?.textContent) };
    };
    if (command === 'snapshot') return { ok: true, value: snapshot() };
    if (command === 'ensureFolder') return { ok: true, value: await getFolder(true) };
    if (command === 'folder') {
      const folder = await getFolder();
      return { ok: true, value: { ...folder, ids: await membership(folder.id) } };
    }
    if (command === 'add') {
      const folder = await getFolder(true);
      const before = await membership(folder.id);
      if (!before.includes(String(payload.id))) {
        await post(typeof folderAssignSidebar !== 'undefined' ? folderAssignSidebar.methods.saveForm : null,
          { postingIds: [payload.id], newFolder: false, nameInput: '', selectedFolder: folder.id, blacklist: false });
        if (!(await membership(folder.id)).includes(String(payload.id))) throw new Error('WaterlooWorks did not confirm the job was saved.');
        root.getPostingsInFolders();
      }
      return { ok: true, value: folder };
    }
    if (command === 'remove') {
      const folder = await getFolder();
      const id = String(payload.id);
      if (!/^\d+$/.test(id)) throw new Error('Invalid posting ID.');
      const map = await folderMemberships();
      const existing = Array.isArray(map[id]) ? [...new Set(map[id].map(String))] : [];
      if (existing.includes(folder.id)) {
        const remaining = existing.filter(value => value !== folder.id);
        // The board's folder editor accepts one selectedFolder. Preserve another
        // assignment when present, and refuse a shape it cannot safely express.
        if (remaining.length > 1) throw new Error('This job belongs to multiple other folders. Remove it from coopcupid in WaterlooWorks.');
        await post(typeof folderAssignSidebar !== 'undefined' ? folderAssignSidebar.methods.saveForm : null,
          { postingIds: [id], newFolder: false, nameInput: '', selectedFolder: remaining[0] ?? '', blacklist: false });
        const updated = await folderMemberships();
        const assigned = Array.isArray(updated[id]) ? updated[id].map(String) : [];
        if (assigned.includes(folder.id) || remaining.some(value => !assigned.includes(value))) throw new Error('WaterlooWorks did not confirm the folder removal.');
        root.getPostingsInFolders();
      }
      return { ok: true, value: folder };
    }
    if (command === 'navigate') {
      const selector = payload.direction === 'first' ? '[aria-label="Go to first page"]' : '[aria-label="Go to next page"]';
      const before = snapshot();
      const button = document.querySelector(selector);
      if (!button || button.classList.contains('disabled')) return { ok: true, value: before };
      button.click();
      for (let n = 0; n < 120; n++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        const after = snapshot();
        if (after.page !== before.page && after.postings.map(p => p.id).join() !== before.postings.map(p => p.id).join()) return { ok: true, value: after };
      }
      throw new Error('Timed out loading the next results page. Search stopped before skipping any results.');
    }
    if (command === 'detail') {
      const id = String(payload.id);
      if (!/^\d+$/.test(id)) throw new Error('Invalid posting ID.');
      const data = await post(typeof getPostingData === 'function' ? getPostingData : null, { postingId: id });
      const overview = await post(typeof getPostingOverview === 'function' ? getPostingOverview : null, { postingId: id }, false);
      const app = data.applicationData ?? {};
      const dom = document.createElement('template'); dom.innerHTML = overview;
      const field = label => {
        const el = [...dom.content.querySelectorAll('span,strong')].find(el => text(el.textContent) === label);
        return el ? text(el.parentElement?.querySelector('p')?.textContent || el.parentElement?.textContent).replace(label, '').trim() : null;
      };
      const required = field('Application Documents Required:');
      const additional = field('Additional Application Information:');
      return { ok: true, value: { id, board: 'waterlooworks', title: text(data.position), org: text(data.org), jdText: text(overview),
        application: { canApply: app.canApply === true, hasApplication: app.hasApplication === true,
          external: !!app.website || !!app.expressedIntention, hasPreScreening: data.hasPreScreening === true,
          verified: Object.hasOwn(app, 'canApply'), requirementsText: required ?? text(overview), additionalInfo: additional ?? '' } } };
    }
    if (command === 'applicationForm') {
      const data = await post(methods?.createApplication, { postingId: payload.id });
      if (data.modalContent || data.expressedIntention || !data.form || typeof data.form !== 'object') {
        return { ok: true, value: { ready: false, reason: 'This job requires an additional application step.' } };
      }
      return { ok: true, value: { ready: true, fields: data.form } };
    }
    if (command === 'open') {
      // Use the board's existing modal, rather than inventing a posting URL.
      const input = document.querySelector(`#resultRow_${CSS.escape(String(payload.id))}`);
      const link = input?.closest('tr')?.querySelector('td a');
      if (!link) throw new Error('This job is on another results page. Search its ID in WaterlooWorks to open it.');
      link.click();
      return { ok: true, value: true };
    }
    throw new Error('Unsupported WaterlooWorks operation.');
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}
