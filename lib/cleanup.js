'use strict';
// 保存期間（作成から30日）を過ぎたイベントを自動で削除する
const prisma = require('./db');

async function deleteExpired() {
  try {
    const result = await prisma.event.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    if (result.count > 0) console.info(`期限切れのイベントを${result.count}件削除しました`);
  } catch (error) {
    console.error('Cleanup Error', error);
  }
}

function startCleanup() {
  deleteExpired();
  setInterval(deleteExpired, 60 * 60 * 1000).unref();
}

module.exports = { startCleanup, deleteExpired };
