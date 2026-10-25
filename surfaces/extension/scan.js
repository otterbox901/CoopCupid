/** Board-independent scan orchestration, tested with a paginated board double. */
export async function scanJobs({ board, signal, onProgress, delay = () => new Promise(r => setTimeout(r, 700)) }) {
  const original = await board('snapshot');
  await board('ensureFolder');
  let page = await board('navigate', { direction: 'first' });
  const jobs = new Map();
  const pages = new Set();
  const assertFilters = snapshot => {
    if (snapshot.filterKey !== original.filterKey) throw new Error('Your filters changed during the search. Run Search again with the new filters.');
  };
  assertFilters(page);
  while (!signal.aborted) {
    const signature = page.postings.map(p => p.id).join(',');
    if (pages.has(signature) && signature) throw new Error('WaterlooWorks repeated a results page. Search stopped to avoid missing jobs.');
    pages.add(signature);
    for (const listing of page.postings) {
      if (signal.aborted) break;
      assertFilters(await board('snapshot'));
      if (jobs.has(listing.id)) continue;
      const detail = await board('detail', { id: listing.id });
      if (signal.aborted) break;
      jobs.set(listing.id, { ...listing, ...detail, title: detail.title || listing.title, org: detail.org || listing.org });
      await onProgress({ postings: [...jobs.values()], filters: original.filters, page: page.page, complete: false });
      await delay();
    }
    if (signal.aborted || !page.hasNext) break;
    page = await board('navigate', { direction: 'next' });
    assertFilters(page);
  }
  assertFilters(await board('snapshot'));
  const result = { postings: [...jobs.values()], filters: original.filters, page: page.page, complete: !signal.aborted };
  await onProgress(result);
  return result;
}
