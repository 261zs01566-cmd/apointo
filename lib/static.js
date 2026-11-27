'use strict';
// 静的ファイル（CSS・JavaScript・アイコン・Bootstrap）の配信
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '..');

// URLと実際のファイルの対応。ここに書いたものだけを配信する
const files = {
  '/style.css': { file: path.join(root, 'public', 'style.css'), cache: 'no-cache' },
  '/app.js': { file: path.join(root, 'public', 'app.js'), cache: 'no-cache' },
  '/favicon.svg': { file: path.join(root, 'public', 'favicon.svg'), cache: 'public, max-age=86400' },
  '/favicon.ico': { file: path.join(root, 'public', 'favicon.svg'), cache: 'public, max-age=86400' },
};
const folders = [
  { prefix: '/vendor/bootstrap/', dir: path.join(root, 'node_modules', 'bootstrap', 'dist') },
  { prefix: '/vendor/bootstrap-icons/', dir: path.join(root, 'node_modules', 'bootstrap-icons', 'font') },
];

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function resolveFile(pathname) {
  if (files[pathname]) return files[pathname];
  for (const { prefix, dir } of folders) {
    if (!pathname.startsWith(prefix)) continue;
    let relative;
    try {
      relative = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      return null;
    }
    if (relative.includes('\0')) return null;
    const file = path.resolve(dir, relative);
    // フォルダの外に出るパス（../ など）は拒否する
    if (!file.startsWith(dir + path.sep)) return null;
    return { file, cache: 'public, max-age=86400' };
  }
  return null;
}

// 配信したら true、対象外のURLなら false を返す
async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const target = resolveFile(pathname);
  if (!target) return false;
  const type = mimeTypes[path.extname(target.file)];
  if (!type) return false;
  try {
    const body = await fs.readFile(target.file);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': target.cache,
    });
    res.end(body);
    return true;
  } catch {
    return false; // ファイルが無い場合は、通常の404ページになる
  }
}

module.exports = { serveStatic, resolveFile };
