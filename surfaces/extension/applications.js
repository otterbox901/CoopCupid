/** Conservative preflight. A score never overrides application requirements. */
export function eligibility(posting) {
  const app = posting.application;
  if (!app?.verified) return 'Application requirements could not be verified.';
  if (app.hasApplication) return 'Already applied.';
  if (!app.canApply) return 'WaterlooWorks says you cannot apply.';
  if (app.external) return 'Requires an external application.';
  if (app.hasPreScreening) return 'Requires pre-screening answers.';
  if (/\bcover\s*letter\b/i.test(app.requirementsText)) return 'Mentions a cover letter; review in WaterlooWorks.';
  if (/\b(portfolio|writing sample|additional (?:document|information)|supplemental|questionnaire)\b/i.test(app.requirementsText)) return 'May require additional documents or information.';
  if (/\b(?:email|send|submit|include|attach|complete|answer|provide|apply)\b/i.test(app.additionalInfo || '')) return 'Additional application instructions need review.';
  return null;
}

/**
 * Sequential batch runner. Revalidates membership and eligibility for each job.
 * Submission adapters must return a confirmed receipt; uncertain outcomes halt
 * the entire batch and must never be blindly retried.
 */
export async function runApplications({ ids, resume, adapter, signal, onProgress = () => {} }) {
  if (!resume?.data || !resume?.name) throw new Error('Select a résumé before applying.');
  const results = [];
  for (const id of [...new Set(ids.map(String))]) {
    if (signal.aborted) break;
    const record = { id, status: 'checking', reason: '' };
    results.push(record);
    onProgress(structuredClone(results));
    try {
      const members = await adapter.members();
      if (signal.aborted) break;
      if (!members.map(String).includes(id)) {
        record.status = 'skipped'; record.reason = 'Removed from coopcupid.';
      } else {
        const posting = await adapter.detail(id);
        if (signal.aborted) break;
        const reason = eligibility(posting);
        if (reason) { record.status = 'skipped'; record.reason = reason; }
        else {
          record.status = 'preparing'; onProgress(structuredClone(results));
          const prepared = await adapter.prepare(posting, resume, signal);
          if (signal.aborted) break;
          if (!prepared.ready) { record.status = 'skipped'; record.reason = prepared.reason; }
          else {
            const stillMember = (await adapter.members()).map(String).includes(id);
            if (signal.aborted) break;
            const finalReason = stillMember ? eligibility(await adapter.detail(id)) : 'Removed from coopcupid.';
            if (signal.aborted) break;
            if (finalReason) {
              record.status = 'skipped'; record.reason = finalReason;
              onProgress(structuredClone(results)); continue;
            }
            record.status = 'submitting'; onProgress(structuredClone(results));
            // Stop prevents the next submission; an in-flight submission needs its receipt.
            const receipt = await adapter.submit(prepared, resume, signal);
            if (receipt?.stopped) { record.status = 'stopped'; record.reason = 'Stopped before submission.'; break; }
            if (!receipt?.confirmed) throw new Error('Submission outcome is uncertain. Check WaterlooWorks before retrying.');
            record.status = 'applied'; record.reason = 'Confirmed by WaterlooWorks.';
          }
        }
      }
    } catch (error) {
      record.status = 'failed'; record.reason = error.message;
      onProgress(structuredClone(results));
      break;
    }
    onProgress(structuredClone(results));
  }
  for (const record of results) if (['checking', 'preparing'].includes(record.status)) {
    record.status = 'stopped'; record.reason = 'Stopped before submission.';
  }
  onProgress(structuredClone(results));
  return results;
}
