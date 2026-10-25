import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankLocally } from '../src/rank/local.ts';
import type { Posting } from '../src/schema.ts';
const resume = 'Software developer with experience building Python React SQL applications and testing reliable systems using Git Linux Docker JavaScript.';
const job = (id: string, jdText: string, competition?: Posting['competition']): Posting => ({ id, board: 'test', title: 'Developer', org: 'Employer', jdText, ...(competition ? { competition } : {}) });
test('ranks skill matches above unrelated jobs and explains missing skills', () => {
  const results = rankLocally(resume, [job('a', 'Python React SQL Rust'), job('b', 'Accounting bookkeeping financial analysis')]);
  assert.equal(results[0]?.posting.id, 'a');
  assert.deepEqual(results[0]?.matched, ['python', 'sql', 'react']);
  assert.deepEqual(results[0]?.gaps, ['rust']);
});
test('competition improves interview score without changing fit', () => {
  const results = rankLocally(resume, [job('a', 'Python React', { applicantCount: 5, openings: 5 }), job('b', 'Python React', { applicantCount: 200, openings: 1 })]);
  assert.equal(results[0]?.posting.id, 'a');
  assert.equal(results[0]?.fit, results[1]?.fit);
  assert.ok(results[0]!.interview > results[1]!.interview);
});
test('handles unavailable, negative, and zero-opening competition without NaN', () => {
  const results = rankLocally(resume, [job('a', ''), job('b', 'Rust', { applicantCount: -1, openings: 0 })]);
  for (const r of results) {
    assert.ok(r.fit >= 0 && r.fit <= 100);
    assert.ok(r.interview >= 0 && r.interview <= 100);
    assert.match(r.reasons.join(), /unavailable/);
  }
});
test('preserves C, C++, C#, R, and aliases without substring matches', () => {
  const [result] = rankLocally('Experienced C++ C# R Nodejs developer with many projects building reliable applications for customers on production systems.', [job('a', 'C C++ C# R Node.js Rust')]);
  assert.deepEqual(result?.matched, ['c++', 'c#', 'r', 'node.js']);
  assert.deepEqual(result?.gaps, ['c', 'rust']);
});
test('requires meaningful resume text and deterministically resolves ties', () => {
  assert.throws(() => rankLocally('', []), /10 words/);
  assert.deepEqual(rankLocally(resume, [job('b', 'Python'), job('a', 'Python')]).map(r => r.posting.id), ['a', 'b']);
});
