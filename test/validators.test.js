'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  validateEventInput,
  validateAnswerInput,
  isValidDateString,
  todayJst,
  addDays,
} = require('../lib/validators');

const now = new Date('2026-11-27T03:00:00Z'); // 日本時間 2026-11-27 12:00

test('todayJst は日本時間の日付を返す', () => {
  assert.strictEqual(todayJst(new Date('2026-11-27T16:00:00Z')), '2026-11-28');
  assert.strictEqual(todayJst(now), '2026-11-27');
});

test('isValidDateString は実在しない日付を拒否する', () => {
  assert.ok(isValidDateString('2026-12-05'));
  assert.ok(!isValidDateString('2026-02-30'));
  assert.ok(!isValidDateString('2026/12/05'));
  assert.ok(!isValidDateString('abc'));
});

test('イベント作成: 正しい入力は受け付け、候補は日付順に並ぶ', () => {
  const result = validateEventInput(
    {
      title: ' 新年会 ',
      description: '場所は未定',
      dates: ['2026-12-10', '', '2026-12-05'],
      notes: ['19:00〜', '', ''],
    },
    now
  );
  assert.ok(result.ok, result.errors.join());
  assert.strictEqual(result.value.title, '新年会');
  assert.deepStrictEqual(result.value.candidates, [
    { date: '2026-12-05', note: '' },
    { date: '2026-12-10', note: '19:00〜' },
  ]);
});

test('イベント作成: 空のタイトル・候補なし・過去日・重複を拒否する', () => {
  assert.ok(!validateEventInput({ title: '', dates: ['2026-12-05'], notes: [''] }, now).ok);
  assert.ok(!validateEventInput({ title: 'a', dates: ['', ''], notes: ['', ''] }, now).ok);
  assert.ok(!validateEventInput({ title: 'a', dates: ['2026-11-26'], notes: [''] }, now).ok);
  assert.ok(!validateEventInput({ title: 'a', dates: ['2026-12-05', '2026-12-05'], notes: ['', ''] }, now).ok);
  assert.ok(!validateEventInput({ title: 'a', dates: ['', '2026-12-05'], notes: ['メモのみ', ''] }, now).ok);
});

test('イベント作成: 文字数と件数の上限を守る', () => {
  assert.ok(!validateEventInput({ title: 'あ'.repeat(61), dates: ['2026-12-05'], notes: [''] }, now).ok);
  assert.ok(!validateEventInput({ title: 'a', dates: ['2026-12-05'], notes: ['あ'.repeat(31)] }, now).ok);
  const many = Array.from({ length: 21 }, (_, i) => addDays('2026-12-01', i));
  assert.ok(!validateEventInput({ title: 'a', dates: many, notes: many.map(() => '') }, now).ok);
  const twenty = many.slice(0, 20);
  assert.ok(validateEventInput({ title: 'a', dates: twenty, notes: twenty.map(() => '') }, now).ok);
});

test('回答: すべての候補に ○△× が必要', () => {
  const ok = validateAnswerInput(
    { name: 'たろう', statuses: { 1: 'OK', 2: 'MAYBE' }, notes: { 2: '20時以降なら' } },
    [1, 2]
  );
  assert.ok(ok.ok);
  assert.strictEqual(ok.value.responses[1].note, '20時以降なら');

  const missing = validateAnswerInput({ name: 'たろう', statuses: { 1: 'OK' }, notes: {} }, [1, 2]);
  assert.ok(!missing.ok);

  const invalid = validateAnswerInput({ name: 'たろう', statuses: { 1: 'OK', 2: 'HACK' }, notes: {} }, [1, 2]);
  assert.ok(!invalid.ok);
});

test('回答: 名前とメモの文字数を検査する', () => {
  assert.ok(!validateAnswerInput({ name: '', statuses: { 1: 'OK' }, notes: {} }, [1]).ok);
  assert.ok(!validateAnswerInput({ name: 'あ'.repeat(21), statuses: { 1: 'OK' }, notes: {} }, [1]).ok);
  assert.ok(!validateAnswerInput({ name: 'a', statuses: { 1: 'OK' }, notes: { 1: 'あ'.repeat(31) } }, [1]).ok);
});
