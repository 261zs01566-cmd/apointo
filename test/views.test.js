'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const pug = require('pug');
const { buildEventView } = require('../lib/view-model');
const config = require('../config');

const attack = '<script>alert("XSS!");</script>';
const escapedAttack = '&lt;script&gt;alert(&quot;XSS!&quot;);&lt;/script&gt;';

function sampleEvent() {
  return {
    id: 'abcdefghijkl',
    title: attack,
    description: attack,
    closed: false,
    expiresAt: new Date(Date.now() + 5 * 86400000),
    candidates: [
      { id: 1, date: new Date('2026-12-05T00:00:00Z'), note: attack, position: 0 },
      { id: 2, date: new Date('2026-12-06T00:00:00Z'), note: '', position: 1 },
    ],
    answers: [
      {
        id: 10,
        name: attack,
        visitorHash: 'hash-a',
        responses: [
          { candidateId: 1, status: 'OK', note: attack },
          { candidateId: 2, status: 'MAYBE', note: '20時以降なら' },
        ],
      },
    ],
  };
}

function renderEvent(owner) {
  const ev = buildEventView({
    event: sampleEvent(),
    visitorHash: 'hash-a',
    owner,
    baseUrl: 'http://localhost:8000',
  });
  return pug.renderFile(path.join(__dirname, '..', 'views', 'event.pug'), {
    appName: config.appName,
    theme: 'light',
    currentPath: '/e/abcdefghijkl',
    pageTitle: ev.title,
    csrf: 'csrf-token',
    ev,
    limits: config.limits,
    retentionDays: 30,
    errors: [],
    form: ev.ownAnswer,
  });
}

test('イベント名・説明・名前・メモに含まれるHTMLタグはエスケープされる', () => {
  const html = renderEvent(null);
  assert.ok(html.includes(escapedAttack));
  assert.ok(!html.includes('<script>alert'), 'スクリプトがそのまま出力されている');
});

test('管理用URLと主催者メニューは、主催者にだけ表示される', () => {
  assert.ok(!renderEvent(null).includes('/m/'));
  assert.ok(!renderEvent(null).includes('主催者メニュー'));
  const html = renderEvent({ token: 'OWNERTOKEN1234567890abcd' });
  assert.ok(html.includes('/e/abcdefghijkl/m/OWNERTOKEN1234567890abcd'));
  assert.ok(html.includes('主催者メニュー'));
});

test('自分の回答は初期値として入力欄に入り、一言メモは表に載る', () => {
  const html = renderEvent(null);
  assert.ok(html.includes('あなたの回答を修正する'));
  assert.ok(html.includes('20時以降なら'));
});

test('ビューモデル: 自分の回答の判定とおすすめの算出', () => {
  const view = buildEventView({
    event: sampleEvent(),
    visitorHash: 'hash-a',
    owner: null,
    baseUrl: 'http://localhost:8000',
  });
  assert.strictEqual(view.rows[0].isMine, true);
  assert.strictEqual(view.best.length, 1);
  assert.strictEqual(view.best[0].id, 1);
  const other = buildEventView({
    event: sampleEvent(),
    visitorHash: 'hash-b',
    owner: null,
    baseUrl: 'http://localhost:8000',
  });
  assert.strictEqual(other.rows[0].isMine, false);
  assert.strictEqual(other.ownAnswer, null);
});
