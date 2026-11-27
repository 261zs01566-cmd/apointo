'use strict';
// HTTPの共通処理（セキュリティヘッダ、画面の描画、リダイレクト、フォームの読み取り）
const path = require('node:path');
const pug = require('pug');
const Cookies = require('cookies');
const config = require('../config');
const security = require('./security');

const viewsDir = path.join(__dirname, '..', 'views');

// すべてのレスポンスに付けるセキュリティ関連のヘッダ
function applySecurityHeaders(res) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; " +
      "form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  // 共有URLや管理用キーが外部に漏れないよう、リファラは送らない
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }
}

const ID_COOKIE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// リクエストごとの情報をまとめたオブジェクト
function createContext(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const cookies = new Cookies(req, res, { secure: config.isProduction });
  const ctx = {
    req,
    res,
    url,
    cookies,
    theme: cookies.get(config.themeCookie) === 'dark' ? 'dark' : 'light',
  };
  let visitorId = null;
  // ブラウザ識別子は、必要になったときに初めて発行する
  Object.defineProperty(ctx, 'visitorId', {
    get() {
      if (visitorId) return visitorId;
      const current = cookies.get(config.visitorCookie);
      if (current && ID_COOKIE_PATTERN.test(current)) {
        visitorId = current;
      } else {
        visitorId = security.newVisitorId();
        cookies.set(config.visitorCookie, visitorId, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: YEAR_MS,
          path: '/',
        });
      }
      return visitorId;
    },
  });
  Object.defineProperty(ctx, 'csrf', {
    get() {
      return security.csrfTokenFor(ctx.visitorId);
    },
  });
  return ctx;
}

// Pugテンプレートを描画して返す
function render(ctx, view, locals = {}, status = 200) {
  const html = pug.renderFile(path.join(viewsDir, `${view}.pug`), {
    appName: config.appName,
    theme: ctx.theme,
    currentPath: safeNextPath(ctx.url.pathname),
    ...locals,
    cache: config.isProduction,
  });
  ctx.res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  ctx.res.end(html);
}

function sendError(ctx, status, title, message) {
  render(ctx, 'error', { pageTitle: title, status, title, message }, status);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

// リダイレクト先として安全なパスだけを通す（外部サイトへの転送を防ぐ）
function safeNextPath(value) {
  return typeof value === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(value) && !value.startsWith('//')
    ? value
    : '/';
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// POSTされたフォームを読み取る（大きすぎる場合は拒否する）
function readForm(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!type.startsWith('application/x-www-form-urlencoded')) {
      reject(new HttpError(415, '対応していない送信形式です。'));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > config.limits.bodyBytesMax) {
        reject(new HttpError(413, '送信されたデータが大きすぎます。'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
  });
}

// アクセスログに出すパス（管理用キーは伏せる）
function maskPath(pathname) {
  return pathname.replace(/(\/m\/)[^/]+/, '$1***');
}

// 本番で、暗号化されていないHTTPでのアクセスか
function isInsecureRequest(req) {
  return config.isProduction && req.headers['x-forwarded-proto'] === 'http';
}

// 共有用URLの先頭部分
function baseUrlOf(req) {
  if (config.baseUrl) return config.baseUrl.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || (config.isProduction ? 'https' : 'http');
  return `${proto}://${req.headers.host || 'localhost'}`;
}

module.exports = {
  applySecurityHeaders,
  createContext,
  render,
  sendError,
  redirect,
  safeNextPath,
  HttpError,
  readForm,
  maskPath,
  isInsecureRequest,
  baseUrlOf,
};
