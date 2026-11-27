'use strict';
// アプリ全体で使う設定値（複数のファイルで使う値をここにまとめる）

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  appName: 'あぽいんと！',
  isProduction,
  port: process.env.PORT || 8000,
  // 共有URLの先頭部分（未設定ならリクエストから組み立てる）
  baseUrl: process.env.BASE_URL || '',

  // Cookie の名前
  visitorCookie: 'visitor',
  themeCookie: 'theme',
  ownerCookiePrefix: 'ow_',

  // 入力の上限
  limits: {
    titleMax: 60,
    descriptionMax: 300,
    candidatesMax: 20,
    noteMax: 30,
    nameMax: 20,
    answersMax: 50,
    bodyBytesMax: 64 * 1024,
    futureDaysMax: 365,
    eventsTotalMax: 500, // 無料のデータベースを守るため、保存できるイベント総数を制限
  },

  // イベントの保存日数（作成から）
  retentionDays: 30,

  // 同じ接続元からの作成回数の制限（1時間あたり）
  rateLimit: {
    windowMs: 60 * 60 * 1000,
    createEvent: 10,
    answer: 60,
  },
};
