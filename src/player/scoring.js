export const SCORING_MODES = Object.freeze(['fixed', 'speed_weighted']);

export function calculatePoints({ isCorrect, points, responseTimeMs, timeLimitSeconds, mode }) {
  if (!SCORING_MODES.includes(mode)) throw new TypeError(`Unknown scoring mode: ${mode}`);
  if (!isCorrect || points === 0) return 0;
  if (mode === 'fixed') return points;
  const timeLimitMs = timeLimitSeconds * 1000;
  const elapsed = Math.min(Math.max(responseTimeMs, 0), timeLimitMs);
  const remainingRatio = 1 - elapsed / timeLimitMs;
  return Math.round(points * (0.5 + remainingRatio * 0.5));
}

export function rankPlayers(players) {
  const sorted = [...players].sort((left, right) =>
    right.score - left.score || left.joinOrder - right.joinOrder || left.nickname.localeCompare(right.nickname));
  let previousScore;
  let rank = 0;
  return Object.freeze(sorted.map((player, index) => {
    if (player.score !== previousScore) rank = index + 1;
    previousScore = player.score;
    return Object.freeze({ participantId: player.id, nickname: player.nickname, score: player.score, rank });
  }));
}
