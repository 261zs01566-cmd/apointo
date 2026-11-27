'use strict';
// 表示用の整形

const dayFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  timeZone: 'UTC', // 日付のみのデータなので、ずれないようUTCで整形する
});
const yearFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  timeZone: 'UTC',
});

// 例: 12月5日(金)。今年以外は「2027年」を前に付ける
function formatCandidateDate(date, nowYear = new Date().getFullYear()) {
  const day = dayFormatter.format(date).replace(/\((.)\)/, '($1)');
  const year = Number(yearFormatter.format(date).replace(/\D/g, ''));
  return year === nowYear ? day : `${year}年${day}`;
}

// 削除されるまでの残り日数（切り上げ）
function daysUntil(target, now = new Date()) {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000));
}

module.exports = { formatCandidateDate, daysUntil };
