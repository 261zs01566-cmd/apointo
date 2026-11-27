'use strict';
// 入力チェック（ブラウザのチェックは回避できるので、サーバ側で必ず検査する）
const { limits } = require('../config');

const STATUSES = ['OK', 'MAYBE', 'NG'];

// 絵文字なども1文字として数える
function countChars(text) {
  return [...text].length;
}

// 1行の文字列に整える（制御文字を空白にして前後の空白を除く）
function cleanLine(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim();
}

// 複数行の文字列に整える（改行は残す）
function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .trim();
}

// 'YYYY-MM-DD' が実在する日付か
function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// 日本時間の今日の日付（'YYYY-MM-DD'）
function todayJst(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// イベント作成フォームの検査
// input: { title, description, dates: string[], notes: string[] }
function validateEventInput(input, now = new Date()) {
  const errors = [];
  const title = cleanLine(input.title);
  const description = cleanText(input.description);

  if (!title) errors.push('イベント名を入力してください。');
  else if (countChars(title) > limits.titleMax) {
    errors.push(`イベント名は${limits.titleMax}文字以内で入力してください。`);
  }
  if (countChars(description) > limits.descriptionMax) {
    errors.push(`説明は${limits.descriptionMax}文字以内で入力してください。`);
  }

  const today = todayJst(now);
  const lastDay = addDays(today, limits.futureDaysMax);
  const dates = input.dates || [];
  const notes = input.notes || [];
  const candidates = [];
  const seen = new Set();

  dates.forEach((rawDate, index) => {
    const date = cleanLine(rawDate);
    const note = cleanLine(notes[index]);
    if (!date && !note) return; // 空の行は無視する
    if (!date) {
      errors.push('時間のメモだけが入力されている候補があります。日付も入力してください。');
      return;
    }
    if (!isValidDateString(date)) {
      errors.push(`「${date.slice(0, 20)}」は正しい日付ではありません。`);
      return;
    }
    if (date < today) {
      errors.push(`${date} は過ぎた日付です。今日以降の日付を選んでください。`);
      return;
    }
    if (date > lastDay) {
      errors.push(`${date} は先すぎます。${limits.futureDaysMax}日以内の日付を選んでください。`);
      return;
    }
    if (countChars(note) > limits.noteMax) {
      errors.push(`時間のメモは${limits.noteMax}文字以内で入力してください。`);
      return;
    }
    const key = `${date}|${note}`;
    if (seen.has(key)) {
      errors.push(`${date} が同じ内容で重複しています。`);
      return;
    }
    seen.add(key);
    candidates.push({ date, note });
  });

  if (candidates.length === 0) errors.push('候補日を1つ以上入力してください。');
  if (candidates.length > limits.candidatesMax) {
    errors.push(`候補日は${limits.candidatesMax}件までです。`);
  }

  // 日付順に並べる（同じ日付なら入力順）
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    value: { title, description, candidates },
  };
}

// 回答フォームの検査
// input: { name, statuses: {候補ID: 'OK'|'MAYBE'|'NG'}, notes: {候補ID: string} }
function validateAnswerInput(input, candidateIds) {
  const errors = [];
  const name = cleanLine(input.name);
  if (!name) errors.push('名前を入力してください。');
  else if (countChars(name) > limits.nameMax) {
    errors.push(`名前は${limits.nameMax}文字以内で入力してください。`);
  }

  const responses = [];
  let missing = false;
  let noteTooLong = false;
  for (const id of candidateIds) {
    const status = input.statuses?.[id];
    const note = cleanLine(input.notes?.[id]);
    if (!STATUSES.includes(status)) {
      missing = true;
      continue;
    }
    if (countChars(note) > limits.noteMax) noteTooLong = true;
    responses.push({ candidateId: id, status, note });
  }
  if (missing) errors.push('すべての候補日に ○・△・× のどれかを選んでください。');
  if (noteTooLong) errors.push(`一言メモは${limits.noteMax}文字以内で入力してください。`);

  return { ok: errors.length === 0, errors, value: { name, responses } };
}

module.exports = {
  STATUSES,
  countChars,
  cleanLine,
  cleanText,
  isValidDateString,
  todayJst,
  addDays,
  validateEventInput,
  validateAnswerInput,
};
