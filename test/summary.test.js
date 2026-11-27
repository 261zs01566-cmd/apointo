'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { summarize } = require('../lib/summary');

const candidates = [{ id: 1 }, { id: 2 }, { id: 3 }];
const answer = (...statuses) => ({
  responses: statuses.map((status, i) => ({ candidateId: i + 1, status })),
});

test('○が一番多い日がおすすめになる', () => {
  const result = summarize(candidates, [
    answer('OK', 'OK', 'NG'),
    answer('NG', 'OK', 'MAYBE'),
    answer('OK', 'OK', 'OK'),
  ]);
  assert.deepStrictEqual(result.bestIds, [2]);
  assert.deepStrictEqual(result.counts.get(2), { ok: 3, maybe: 0, ng: 0 });
  assert.deepStrictEqual(result.perfectIds, [2]);
});

test('○が同数なら△が多い日を選び、完全に同じなら両方を返す', () => {
  const result = summarize(candidates, [answer('OK', 'OK', 'NG'), answer('MAYBE', 'MAYBE', 'NG')]);
  assert.deepStrictEqual(result.bestIds, [1, 2]);

  const tie = summarize(candidates, [answer('OK', 'MAYBE', 'NG'), answer('OK', 'NG', 'NG')]);
  assert.deepStrictEqual(tie.bestIds, [1]);
});

test('回答がない・○がない場合はおすすめなし', () => {
  assert.deepStrictEqual(summarize(candidates, []).bestIds, []);
  assert.deepStrictEqual(summarize(candidates, [answer('NG', 'MAYBE', 'NG')]).bestIds, []);
});
