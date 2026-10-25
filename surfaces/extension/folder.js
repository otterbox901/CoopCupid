export function matchesAboveThreshold(matches, threshold) {
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error('Choose an interview score cutoff from 0 to 100.');
  const seen = new Set();
  return matches.filter(match => {
    const id = String(match.posting.id);
    if (!(match.interview > threshold) || seen.has(id)) return false;
    seen.add(id); return true;
  });
}

/** Save the current scores as one fixed batch; never apply or rerank jobs. */
export async function saveMatchesAbove({ matches, threshold, board, signal, onProgress = () => {}, delay = () => new Promise(resolve => setTimeout(resolve, 700)) }) {
  const selected = matchesAboveThreshold(matches, threshold);
  if (signal.aborted) return { added: 0, alreadySaved: 0, total: selected.length, stopped: true };
  await board('ensureFolder');
  const folder = await board('folder');
  const ids = new Set(folder.ids.map(String));
  const pending = selected.filter(match => !ids.has(String(match.posting.id)));
  const state = { added: 0, alreadySaved: selected.length - pending.length, total: selected.length, stopped: false };
  await onProgress({ ...state, ids: [...ids] });
  for (const match of pending) {
    if (signal.aborted) break;
    await board('add', { id: String(match.posting.id) });
    ids.add(String(match.posting.id)); state.added++;
    await onProgress({ ...state, ids: [...ids] });
    if (!signal.aborted && state.added < pending.length) await delay();
  }
  state.stopped = signal.aborted;
  return state;
}
