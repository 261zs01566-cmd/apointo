'use strict';
// リクエストのパスとメソッドに応じて、処理を振り分ける
const config = require('../config');
const events = require('./events-handler');
const {
  applySecurityHeaders,
  createContext,
  sendError,
  redirect,
  safeNextPath,
  HttpError,
  maskPath,
  isInsecureRequest,
} = require('./http-utils');
const { serveStatic } = require('./static');

const ID = '([A-Za-z0-9_-]{12})';

// [メソッド, パスの形, 処理]
const routes = [
  ['GET', /^\/$/, (ctx) => events.handleTop(ctx)],
  ['POST', /^\/events$/, (ctx) => events.handleCreate(ctx)],
  ['GET', new RegExp(`^/e/${ID}$`), (ctx, m) => events.handleShow(ctx, m[1])],
  ['POST', new RegExp(`^/e/${ID}/answers$`), (ctx, m) => events.handleAnswer(ctx, m[1])],
  ['POST', new RegExp(`^/e/${ID}/answers/(\\d{1,9})/delete$`), (ctx, m) => events.handleDeleteAnswer(ctx, m[1], m[2])],
  ['POST', new RegExp(`^/e/${ID}/close$`), (ctx, m) => events.handleSetClosed(ctx, m[1])],
  ['POST', new RegExp(`^/e/${ID}/delete$`), (ctx, m) => events.handleDeleteEvent(ctx, m[1])],
  ['GET', new RegExp(`^/e/${ID}/m/([A-Za-z0-9_-]{1,64})$`), (ctx, m) => events.handleOwnerLink(ctx, m[1], m[2])],
  ['GET', /^\/theme$/, handleTheme],
];

// 表示モード（ライト/ダーク）をCookieに保存して、元のページに戻る
function handleTheme(ctx) {
  const to = ctx.url.searchParams.get('to') === 'dark' ? 'dark' : 'light';
  ctx.cookies.set(config.themeCookie, to, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  redirect(ctx.res, safeNextPath(ctx.url.searchParams.get('next')));
}

async function route(req, res) {
  const startedAt = Date.now();
  applySecurityHeaders(res);
  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('不正なリクエストです');
    return;
  }
  res.on('finish', () => {
    console.info(`${req.method} ${maskPath(pathname)} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });

  // 死活確認用（Renderのヘルスチェックなど）
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  const ctx = createContext(req, res);
  try {
    // 本番では、暗号化されていないHTTPでのアクセスを禁止する
    if (isInsecureRequest(req)) {
      sendError(ctx, 404, 'ページが見つかりません', 'HTTPSでアクセスしてください。');
      return;
    }
    if (await serveStatic(req, res, pathname)) return;

    let pathMatched = false;
    for (const [method, pattern, handler] of routes) {
      const match = pattern.exec(pathname);
      if (!match) continue;
      pathMatched = true;
      const allowHead = method === 'GET' && req.method === 'HEAD';
      if (req.method !== method && !allowHead) continue;
      await handler(ctx, match);
      return;
    }
    if (pathMatched) {
      res.setHeader('Allow', 'GET, POST');
      sendError(ctx, 405, '許可されていない操作です', 'この操作には対応していません。');
      return;
    }
    sendError(ctx, 404, 'ページが見つかりません', 'URLが間違っているか、ページが存在しません。');
  } catch (error) {
    handleError(ctx, error);
  }
}

function handleError(ctx, error) {
  if (ctx.res.headersSent) {
    ctx.res.end();
    return;
  }
  if (error instanceof HttpError) {
    sendError(ctx, error.status, '送信できませんでした', error.message);
    return;
  }
  console.error('Unexpected Error', error);
  sendError(ctx, 500, 'エラーが発生しました', 'しばらくしてからもう一度お試しください。');
}

module.exports = { route };
