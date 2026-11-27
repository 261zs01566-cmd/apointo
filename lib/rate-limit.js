'use strict';
// 簡易的な回数制限（サーバのメモリ上で数える。再起動すると数え直し）

function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }

  return function isAllowed(key, now = Date.now()) {
    // たまった古い記録を掃除する
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.resetAt <= now) hits.delete(k);
      }
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

// 接続元の識別。Renderなどのプロキシ経由なら x-forwarded-for を使う
function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

module.exports = { createLimiter, clientKey };
