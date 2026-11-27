'use strict';
process.env.APP_SECRET = 'test-secret-for-unit-tests';
const test = require('node:test');
const assert = require('node:assert');
const security = require('../lib/security');
const { resolveFile } = require('../lib/static');
const { safeNextPath, maskPath } = require('../lib/http-utils');
const { createLimiter } = require('../lib/rate-limit');

test('IDとキーは推測しにくい長さ・文字種で、毎回異なる', () => {
  const id = security.newEventId();
  assert.match(id, /^[A-Za-z0-9_-]{12}$/);
  assert.match(security.newOwnerToken(), /^[A-Za-z0-9_-]{24}$/);
  assert.match(security.newVisitorId(), /^[A-Za-z0-9_-]{22}$/);
  assert.notStrictEqual(id, security.newEventId());
});

test('CSRFトークンは、そのブラウザ専用で、他のブラウザや空では通らない', () => {
  const token = security.csrfTokenFor('visitor-A');
  assert.ok(security.verifyCsrf('visitor-A', token));
  assert.ok(!security.verifyCsrf('visitor-B', token));
  assert.ok(!security.verifyCsrf('visitor-A', 'forged'));
  assert.ok(!security.verifyCsrf('visitor-A', ''));
  assert.ok(!security.verifyCsrf('', token));
});

test('safeEqual は同じ文字列だけ true', () => {
  assert.ok(security.safeEqual('abc', 'abc'));
  assert.ok(!security.safeEqual('abc', 'abd'));
  assert.ok(!security.safeEqual('abc', 'abcd'));
});

test('静的ファイル: フォルダの外に出るパスは配信しない', () => {
  assert.ok(resolveFile('/style.css'));
  assert.ok(resolveFile('/vendor/bootstrap/css/bootstrap.min.css'));
  assert.strictEqual(resolveFile('/vendor/bootstrap/../../package.json'), null);
  assert.strictEqual(resolveFile('/vendor/bootstrap/..%2F..%2Fpackage.json'), null);
  assert.strictEqual(resolveFile('/vendor/bootstrap/%00'), null);
  assert.strictEqual(resolveFile('/package.json'), null);
  assert.strictEqual(resolveFile('/.env'), null);
});

test('リダイレクト先は同じサイト内のパスだけ許可する', () => {
  assert.strictEqual(safeNextPath('/e/abcdefghijkl'), '/e/abcdefghijkl');
  assert.strictEqual(safeNextPath('//evil.example.com'), '/');
  assert.strictEqual(safeNextPath('https://evil.example.com'), '/');
  assert.strictEqual(safeNextPath('/\\evil'), '/');
  assert.strictEqual(safeNextPath(undefined), '/');
});

test('ログに出すパスでは管理用キーを伏せる', () => {
  assert.strictEqual(maskPath('/e/abcdefghijkl/m/SECRETSECRET'), '/e/abcdefghijkl/m/***');
  assert.strictEqual(maskPath('/e/abcdefghijkl'), '/e/abcdefghijkl');
});

test('回数制限: 上限を超えると拒否し、時間が過ぎると復活する', () => {
  const limiter = createLimiter({ windowMs: 1000, max: 2 });
  assert.ok(limiter('ip', 0));
  assert.ok(limiter('ip', 10));
  assert.ok(!limiter('ip', 20));
  assert.ok(limiter('other', 20));
  assert.ok(limiter('ip', 1500));
});
