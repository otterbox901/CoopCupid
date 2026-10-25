import { tokenize, buildIndex, search } from './bm25.ts';
import type { Posting } from '../schema.ts';

// Phrase matching preserves skills such as C, R and Go, which generic tokenizers lose.
const SKILLS = [
  'python', 'java', 'javascript', 'typescript', 'c', 'c++', 'c#', 'r', 'go', 'rust',
  'sql', 'react', 'angular', 'vue', 'node.js', 'html', 'css', 'linux', 'git',
  'aws', 'azure', 'docker', 'kubernetes', 'terraform', 'postgresql', 'mongodb',
  'machine learning', 'pytorch', 'tensorflow', 'data analysis', 'excel', 'power bi',
  'tableau', 'statistics', 'matlab', 'solidworks', 'autocad', 'cad', 'fpga',
  'verilog', 'vhdl', 'embedded', 'pcb', 'circuits', 'mechanical design',
  'accounting', 'financial analysis', 'bookkeeping', 'marketing', 'sales',
  'project management', 'research', 'writing', 'customer service', 'figma',
  'user research', 'accessibility', 'testing', 'quality assurance', 'supply chain',
];
const ALIASES: [RegExp, string][] = [
  [/\bnodejs\b/g, 'node.js'], [/\bpostgres\b/g, 'postgresql'],
  [/(?<![\w.])js\b/g, 'javascript'], [/(?<![\w.])ts\b/g, 'typescript'],
  [/\bamazon web services\b/g, 'aws'], [/\bms excel\b/g, 'excel'],
];
function normalize(text: string): string {
  let result = text.toLowerCase();
  for (const [pattern, replacement] of ALIASES) result = result.replace(pattern, replacement);
  return result;
}
function contains(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9+#])${escaped}(?![a-z0-9+#])`, 'i').test(text);
}
export type LocalMatch = {
  posting: Posting;
  fit: number;
  interview: number;
  matched: string[];
  gaps: string[];
  reasons: string[];
};

/** Heuristic opportunity scores, never calibrated probabilities. No network or models. */
export function rankLocally(resume: string, postings: Posting[], priorTerms?: number): LocalMatch[] {
  const normalizedResume = normalize(resume);
  if (tokenize(normalizedResume).length < 10) throw new Error('Add at least 10 words of résumé text before searching.');
  const resumeTokens = new Set(tokenize(normalizedResume));
  const index = buildIndex(postings.map(p => ({ id: p.id, text: normalize(`${p.title} ${p.jdText} ${p.requirementsText ?? ''}`) })));
  const lexical = new Map(search(index, normalizedResume).map(p => [p.id, p.score]));
  const maxLexical = Math.max(1, ...lexical.values());
  return postings.map(posting => {
    const text = normalize(`${posting.title} ${posting.jdText} ${posting.requirementsText ?? ''}`);
    const skills = SKILLS.filter(skill => contains(text, skill));
    const matched = skills.filter(skill => contains(normalizedResume, skill));
    const gaps = skills.filter(skill => !contains(normalizedResume, skill));
    const titleTokens = tokenize(normalize(posting.title));
    const titleMatch = titleTokens.length ? titleTokens.filter(t => resumeTokens.has(t)).length / titleTokens.length : 0;
    const lexicalScore = (lexical.get(posting.id) ?? 0) / maxLexical;
    const coverage = skills.length ? matched.length / skills.length : lexicalScore;
    let fit = Math.round(100 * (0.65 * coverage + 0.25 * lexicalScore + 0.10 * titleMatch));
    const reasons = [skills.length ? `${matched.length} of ${skills.length} recognized posting skills appear in your résumé.` : 'Based on word overlap; no catalogued skills recognized.'];
    if (priorTerms !== undefined && posting.levelsAccepted?.length) {
      const level = priorTerms < 2 ? 'junior' : priorTerms < 4 ? 'intermediate' : 'senior';
      if (!posting.levelsAccepted.some(l => l.toLowerCase().includes(level))) {
        fit = Math.max(0, fit - 15);
        reasons.push(`Posting levels may not match your ${level} experience level.`);
      }
    }
    const { applicantCount, openings } = posting.competition ?? {};
    const hasCompetition = Number.isFinite(applicantCount) && applicantCount! >= 0 && Number.isFinite(openings) && openings! > 0;
    const competition = hasCompetition ? 100 / (1 + applicantCount! / openings! / 25) : 50;
    const interview = Math.round(fit * 0.85 + competition * 0.15);
    reasons.push(hasCompetition ? `${applicantCount} applicants for ${openings} opening(s); competition contributes 15% of the interview score.` : 'Competition data unavailable; a neutral competition value is used.');
    if (!posting.jdText.trim()) reasons.push('Description unavailable; this score uses listing information only.');
    return { posting, fit, interview, matched, gaps, reasons };
  }).sort((a, b) => b.interview - a.interview || b.fit - a.fit || a.posting.id.localeCompare(b.posting.id));
}
