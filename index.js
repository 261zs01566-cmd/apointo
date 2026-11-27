'use strict';
// HTTPサーバを起動する
const http = require('node:http');
const config = require('./config');
const router = require('./lib/router');
const prisma = require('./lib/db');
const { startCleanup } = require('./lib/cleanup');

const server = http
  .createServer((req, res) => {
    router.route(req, res);
  })
  .on('error', (e) => {
    console.error('Server Error', e);
  })
  .on('clientError', (e, socket) => {
    console.error('Client Error', e.message);
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection', reason);
});

server.listen(config.port, () => {
  console.info(`Listening on ${config.port}`);
  startCleanup();
});

// Renderなどが停止を知らせたら、処理中のリクエストを終えてから終了する
process.on('SIGTERM', () => {
  console.info('SIGTERM received');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10000).unref();
});
