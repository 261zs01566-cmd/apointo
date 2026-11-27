'use strict';
// データベース接続（アプリ全体で1つのPrisma Clientを共有する）
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({ log: ['warn', 'error'] });

module.exports = prisma;
