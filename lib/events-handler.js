'use strict';
// イベントの作成・表示・回答・管理のリクエストを処理する
const config = require('../config');
const prisma = require('./db');
const security = require('./security');
const { createLimiter, clientKey } = require('./rate-limit');
const {
  render,
  sendError,
  redirect,
  readForm,
  baseUrlOf,
} = require('./http-utils');
const { validateEventInput, validateAnswerInput, todayJst, cleanLine } = require('./validators');
const { buildEventView } = require('./view-model');

const { limits, rateLimit, ownerCookiePrefix, retentionDays } = config;
const ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

const createLimiterFn = createLimiter({ windowMs: rateLimit.windowMs, max: rateLimit.createEvent });
const answerLimiterFn = createLimiter({ windowMs: rateLimit.windowMs, max: rateLimit.answer });

const CSRF_MESSAGE =
  'フォームの有効期限が切れたか、不正な送信です。ページを開き直してからもう一度お試しください。';

function ownerCookieName(eventId) {
  return `${ownerCookiePrefix}${eventId}`;
}

function setOwnerCookie(ctx, eventId, token) {
  ctx.cookies.set(ownerCookieName(eventId), token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: (retentionDays + 1) * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function loadEvent(id) {
  if (!ID_PATTERN.test(id)) return null;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      candidates: { orderBy: { position: 'asc' } },
      answers: { orderBy: { createdAt: 'asc' }, include: { responses: true } },
    },
  });
  if (!event || event.expiresAt <= new Date()) return null;
  return event;
}

// 管理用キーのCookieが正しければ、そのキーを返す（正しくなければ null）
function ownerTokenOf(ctx, event) {
  const token = ctx.cookies.get(ownerCookieName(event.id));
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  return security.safeEqual(security.sha256(token), event.ownerTokenHash) ? token : null;
}

function notFound(ctx) {
  sendError(ctx, 404, 'ページが見つかりません', 'URLが間違っているか、イベントの保存期間が過ぎて削除された可能性があります。');
}

function checkCsrf(ctx, params) {
  if (security.verifyCsrf(ctx.visitorId, params.get('csrf'))) return true;
  sendError(ctx, 400, '送信できませんでした', CSRF_MESSAGE);
  return false;
}

// ---------- トップページ・イベント作成 ----------

const EMPTY_ROWS = 3;

function renderTop(ctx, { errors = [], form = null } = {}, status = 200) {
  const rows = form ? form.rows : [];
  while (rows.length < EMPTY_ROWS) rows.push({ date: '', note: '' });
  render(
    ctx,
    'top',
    {
      pageTitle: '',
      csrf: ctx.csrf,
      today: todayJst(),
      limits,
      retentionDays,
      errors,
      form: { title: form ? form.title : '', description: form ? form.description : '', rows },
    },
    status
  );
}

function handleTop(ctx) {
  renderTop(ctx);
}

async function handleCreate(ctx) {
  const params = await readForm(ctx.req);
  if (!checkCsrf(ctx, params)) return;
  if (!createLimiterFn(clientKey(ctx.req))) {
    sendError(ctx, 429, '作成回数の上限です', '短時間にたくさん作成されました。しばらく待ってからお試しください。');
    return;
  }

  const dates = params.getAll('date').slice(0, limits.candidatesMax + 5);
  const notes = params.getAll('note').slice(0, limits.candidatesMax + 5);
  const result = validateEventInput({
    title: params.get('title'),
    description: params.get('description'),
    dates,
    notes,
  });
  if (!result.ok) {
    renderTop(
      ctx,
      {
        errors: result.errors,
        form: {
          title: cleanLine(params.get('title')).slice(0, 200),
          description: String(params.get('description') ?? '').slice(0, 600),
          rows: dates.map((date, i) => ({
            date: String(date).slice(0, 10),
            note: String(notes[i] ?? '').slice(0, 60),
          })),
        },
      },
      400
    );
    return;
  }

  if ((await prisma.event.count()) >= limits.eventsTotalMax) {
    sendError(ctx, 503, '現在混み合っています', 'イベントの保存数が上限に達しています。時間をおいてお試しください。');
    return;
  }

  const { title, description, candidates } = result.value;
  const id = security.newEventId();
  const token = security.newOwnerToken();
  await prisma.event.create({
    data: {
      id,
      title,
      description,
      ownerTokenHash: security.sha256(token),
      expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
      candidates: {
        create: candidates.map((candidate, index) => ({
          date: new Date(`${candidate.date}T00:00:00Z`),
          note: candidate.note,
          position: index,
        })),
      },
    },
  });
  setOwnerCookie(ctx, id, token);
  redirect(ctx.res, `/e/${id}`);
}

// ---------- イベントページ ----------

function renderEvent(ctx, event, { status = 200, errors = [], form = null } = {}) {
  const token = ownerTokenOf(ctx, event);
  const view = buildEventView({
    event,
    visitorHash: security.sha256(ctx.visitorId),
    owner: token ? { token } : null,
    baseUrl: baseUrlOf(ctx.req),
  });
  render(
    ctx,
    'event',
    {
      pageTitle: view.title,
      csrf: ctx.csrf,
      ev: view,
      limits,
      retentionDays,
      errors,
      // 入力エラーで開き直した場合は入力値、そうでなければ自分の回答（あれば）を初期値にする
      form: form || view.ownAnswer || { name: '', statuses: {}, notes: {} },
    },
    status
  );
}

async function handleShow(ctx, id) {
  const event = await loadEvent(id);
  if (!event) return notFound(ctx);
  renderEvent(ctx, event);
}

// ---------- 回答 ----------

async function handleAnswer(ctx, id) {
  const params = await readForm(ctx.req);
  if (!checkCsrf(ctx, params)) return;
  const event = await loadEvent(id);
  if (!event) return notFound(ctx);
  if (event.closed) {
    sendError(ctx, 403, '受付を終了しています', 'このイベントは主催者によって締め切られています。');
    return;
  }
  if (!answerLimiterFn(clientKey(ctx.req))) {
    sendError(ctx, 429, '送信回数の上限です', '短時間にたくさん送信されました。しばらく待ってからお試しください。');
    return;
  }

  const statuses = {};
  const notes = {};
  for (const candidate of event.candidates) {
    statuses[candidate.id] = params.get(`s_${candidate.id}`);
    notes[candidate.id] = String(params.get(`n_${candidate.id}`) ?? '').slice(0, 200);
  }
  const name = String(params.get('name') ?? '').slice(0, 100);
  const result = validateAnswerInput(
    { name, statuses, notes },
    event.candidates.map((candidate) => candidate.id)
  );
  if (!result.ok) {
    renderEvent(ctx, event, { status: 400, errors: result.errors, form: { name, statuses, notes } });
    return;
  }

  const visitorHash = security.sha256(ctx.visitorId);
  const existing = event.answers.find((answer) => answer.visitorHash === visitorHash);
  if (!existing && event.answers.length >= limits.answersMax) {
    renderEvent(ctx, event, {
      status: 400,
      errors: [`回答は${limits.answersMax}人までです。`],
      form: { name, statuses, notes },
    });
    return;
  }

  const { name: cleanName, responses } = result.value;
  try {
    await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.response.deleteMany({ where: { answerId: existing.id } });
        await tx.answer.update({
          where: { id: existing.id },
          data: { name: cleanName, responses: { create: responses } },
        });
      } else {
        await tx.answer.create({
          data: { eventId: event.id, visitorHash, name: cleanName, responses: { create: responses } },
        });
      }
    });
  } catch (error) {
    // 同時に2回送信された場合（一意制約違反）は、保存済みとして扱う
    if (error.code !== 'P2002') throw error;
  }
  redirect(ctx.res, `/e/${event.id}`);
}

// ---------- 主催者の操作 ----------

// 主催者操作の共通の前処理。許可されなければ null を返す
async function prepareOwnerAction(ctx, id) {
  const params = await readForm(ctx.req);
  if (!checkCsrf(ctx, params)) return null;
  const event = await loadEvent(id);
  if (!event) {
    notFound(ctx);
    return null;
  }
  // 認可はサーバ側で必ず確認する
  if (!ownerTokenOf(ctx, event)) {
    sendError(ctx, 403, '操作できません', 'この操作はイベントを作成した主催者だけが行えます。管理用URLから開き直してください。');
    return null;
  }
  return { params, event };
}

async function handleSetClosed(ctx, id) {
  const prepared = await prepareOwnerAction(ctx, id);
  if (!prepared) return;
  const { params, event } = prepared;
  await prisma.event.update({ where: { id: event.id }, data: { closed: params.get('closed') === '1' } });
  redirect(ctx.res, `/e/${event.id}`);
}

async function handleDeleteEvent(ctx, id) {
  const prepared = await prepareOwnerAction(ctx, id);
  if (!prepared) return;
  await prisma.event.delete({ where: { id: prepared.event.id } });
  ctx.cookies.set(ownerCookieName(prepared.event.id), null, { path: '/' });
  redirect(ctx.res, '/');
}

async function handleDeleteAnswer(ctx, id, answerId) {
  const prepared = await prepareOwnerAction(ctx, id);
  if (!prepared) return;
  await prisma.answer.deleteMany({
    where: { id: Number(answerId), eventId: prepared.event.id },
  });
  redirect(ctx.res, `/e/${prepared.event.id}`);
}

// 管理用URLを開いたとき、このブラウザを主催者として登録する
async function handleOwnerLink(ctx, id, token) {
  const event = await loadEvent(id);
  if (
    !event ||
    !TOKEN_PATTERN.test(token) ||
    !security.safeEqual(security.sha256(token), event.ownerTokenHash)
  ) {
    return notFound(ctx);
  }
  setOwnerCookie(ctx, event.id, token);
  redirect(ctx.res, `/e/${event.id}`);
}

module.exports = {
  handleTop,
  handleCreate,
  handleShow,
  handleAnswer,
  handleSetClosed,
  handleDeleteEvent,
  handleDeleteAnswer,
  handleOwnerLink,
};
