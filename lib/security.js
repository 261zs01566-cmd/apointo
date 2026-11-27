'use strict';
// 乱数・ハッシュ・CSRFトークンなど、セキュリティに関する部品
const crypto = require('node:crypto');

// CSRFトークンの署名に使う秘密の文字列。環境変数 APP_SECRET を優先する。
// 未設定の場合は起動のたびにランダムに作る（再起動すると開いたままのフォームは無効になる）。
const appSecret = process.env.APP_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.APP_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('APP_SECRET が未設定です。環境変数に設定してください。');
}

// イベントID（URLに入る。推測されにくい12文字）
function newEventId() {
  return crypto.randomBytes(9).toString('base64url');
}

// 管理用キー（24文字）
function newOwnerToken() {
  return crypto.randomBytes(18).toString('base64url');
}

// ブラウザ識別子（Cookieに入る。22文字）
function newVisitorId() {
  return crypto.randomBytes(16).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// タイミング攻撃を避けた文字列比較
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ブラウザごとのCSRFトークン（フォームに埋め込み、送信時に検証する）
function csrfTokenFor(visitorId) {
  return crypto
    .createHmac('sha256', appSecret)
    .update(`csrf:${visitorId}`)
    .digest('base64url');
}

function verifyCsrf(visitorId, token) {
  if (!visitorId || !token) return false;
  return safeEqual(csrfTokenFor(visitorId), token);
}

module.exports = {
  newEventId,
  newOwnerToken,
  newVisitorId,
  sha256,
  safeEqual,
  csrfTokenFor,
  verifyCsrf,
};
