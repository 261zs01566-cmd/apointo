'use strict';
// 回答の集計。いちばん参加しやすい候補日を求める

// candidates: [{ id }], answers: [{ responses: [{ candidateId, status }] }]
function summarize(candidates, answers) {
  const counts = new Map();
  for (const candidate of candidates) {
    counts.set(candidate.id, { ok: 0, maybe: 0, ng: 0 });
  }
  for (const answer of answers) {
    for (const response of answer.responses) {
      const count = counts.get(response.candidateId);
      if (!count) continue;
      if (response.status === 'OK') count.ok += 1;
      else if (response.status === 'MAYBE') count.maybe += 1;
      else if (response.status === 'NG') count.ng += 1;
    }
  }

  // ○の数が多い順に、同数なら△の数が多い順に比べる。○が1つもなければ該当なし
  let best = null;
  let bestIds = [];
  for (const candidate of candidates) {
    const count = counts.get(candidate.id);
    if (count.ok === 0) continue;
    if (
      best === null ||
      count.ok > best.ok ||
      (count.ok === best.ok && count.maybe > best.maybe)
    ) {
      best = count;
      bestIds = [candidate.id];
    } else if (count.ok === best.ok && count.maybe === best.maybe) {
      bestIds.push(candidate.id);
    }
  }

  // 全員が○の候補日
  const perfectIds =
    answers.length === 0
      ? []
      : candidates
          .filter((candidate) => counts.get(candidate.id).ok === answers.length)
          .map((candidate) => candidate.id);

  return { counts, bestIds, perfectIds };
}

module.exports = { summarize };
