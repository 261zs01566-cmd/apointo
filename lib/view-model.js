'use strict';
// データベースの内容を、画面（Pug）で使いやすい形に変換する
const { summarize } = require('./summary');
const { formatCandidateDate, daysUntil } = require('./format');

// event: candidates と answers(responses 付き) を含むイベント
// visitorHash: 閲覧者のブラウザ識別子のハッシュ
function buildEventView({ event, visitorHash, owner, baseUrl, now = new Date() }) {
  const { counts, bestIds, perfectIds } = summarize(event.candidates, event.answers);

  const columns = event.candidates.map((candidate) => ({
    id: candidate.id,
    label: formatCandidateDate(candidate.date, now.getFullYear()),
    note: candidate.note,
    counts: counts.get(candidate.id),
    isBest: bestIds.includes(candidate.id),
    isPerfect: perfectIds.includes(candidate.id),
  }));

  const rows = event.answers.map((answer) => {
    const byCandidate = new Map(answer.responses.map((r) => [r.candidateId, r]));
    return {
      id: answer.id,
      name: answer.name,
      isMine: visitorHash !== null && answer.visitorHash === visitorHash,
      cells: event.candidates.map((candidate) => {
        const response = byCandidate.get(candidate.id);
        return { status: response ? response.status : null, note: response ? response.note : '' };
      }),
    };
  });

  // 一言メモの一覧（スマホなど狭い画面で、表の下に見せる）
  const notesList = [];
  rows.forEach((row) => {
    row.cells.forEach((cell, index) => {
      if (cell.note) {
        notesList.push({
          name: row.name,
          label: columns[index].label,
          status: cell.status,
          note: cell.note,
        });
      }
    });
  });

  const own = rows.find((row) => row.isMine);
  const ownAnswer = own
    ? {
        name: own.name,
        statuses: Object.fromEntries(own.cells.map((cell, i) => [columns[i].id, cell.status])),
        notes: Object.fromEntries(own.cells.map((cell, i) => [columns[i].id, cell.note])),
      }
    : null;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    closed: event.closed,
    daysLeft: daysUntil(event.expiresAt, now),
    shareUrl: `${baseUrl}/e/${event.id}`,
    manageUrl: owner ? `${baseUrl}/e/${event.id}/m/${owner.token}` : null,
    isOwner: Boolean(owner),
    columns,
    rows,
    notesList,
    hasNotes: notesList.length > 0,
    ownAnswer,
    best: columns.filter((column) => column.isBest),
  };
}

module.exports = { buildEventView };
