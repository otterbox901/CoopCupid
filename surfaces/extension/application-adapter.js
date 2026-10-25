import { applicationCommand } from './application-page.js';
import * as storage from './storage.js';

export function createApplicationAdapter(board, searchTabId, onStatus) {
  const openTabs = new Set();
  const call = async (tabId, command, payload) => {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: applicationCommand, args: [command, payload] });
    if (!result?.result?.ok) throw new Error(result?.result?.error || 'Application tab disconnected. Check WaterlooWorks before retrying.');
    return result.result.value;
  };
  const settled = async (tabId, id, signal) => {
    for (let i = 0; i < 120; i++) {
      if (signal.aborted) return false;
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        try { const result = await call(tabId, 'inspect', { id }); if (result) return result; } catch { /* Wait for wizard initialization after navigation. */ }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('The application wizard did not load. Review its tab.');
  };
  return {
    members: async () => (await board('folder')).ids,
    detail: id => board('detail', { id }),
    prepare: async (posting, resume, signal) => {
      const launch = await board('applicationForm', { id: posting.id });
      if (!launch.ready || signal.aborted) return { ready: false, reason: launch.reason || 'Stopped.' };
      const source = await chrome.tabs.get(searchTabId);
      const tab = await chrome.tabs.create({ url: source.url, active: false });
      openTabs.add(tab.id);
      for (let i = 0; i < 120; i++) {
        if (signal.aborted) return { ready: false, reason: 'Stopped.' };
        if ((await chrome.tabs.get(tab.id)).status === 'complete') break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      await call(tab.id, 'launch', { id: posting.id, fields: launch.fields });
      const inspected = await settled(tab.id, posting.id, signal);
      if (!inspected?.ready || signal.aborted) {
        await chrome.tabs.remove(tab.id); openTabs.delete(tab.id);
        return { ready: false, reason: inspected?.reason || 'Stopped.' };
      }
      onStatus(`Uploading ${resume.name} for ${posting.title}…`);
      const bytes = new Uint8Array(resume.data);
      let binary = ''; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      const prepared = await call(tab.id, 'prepare', { id: posting.id, resume: { name: resume.name, base64: btoa(binary) } });
      if (!prepared.ready) { await chrome.tabs.remove(tab.id); openTabs.delete(tab.id); }
      return { ...prepared, tabId: tab.id, id: posting.id };
    },
    submit: async (prepared, resume, signal) => {
      if (signal.aborted) return { confirmed: false };
      // Durable uncertainty marker survives a closed panel or interrupted browser.
      await storage.write('inflight', { id: prepared.id, resume: resume.name, at: new Date().toISOString() });
      if (signal.aborted) { await storage.write('inflight', null); return { confirmed: false, stopped: true }; }
      const receipt = await call(prepared.tabId, 'submit', { id: prepared.id });
      if (receipt.confirmed) {
        await storage.write('inflight', null);
        await chrome.tabs.remove(prepared.tabId); openTabs.delete(prepared.tabId);
      }
      return receipt;
    },
    cleanup: async (keepForReview = false) => {
      if (!keepForReview) await Promise.allSettled([...openTabs].map(tabId => chrome.tabs.remove(tabId)));
      openTabs.clear();
    },
  };
}
