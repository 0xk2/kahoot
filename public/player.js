const joinPanel = document.querySelector('#join');
const gamePanel = document.querySelector('#game');
const identity = document.querySelector('#identity');
let player = JSON.parse(sessionStorage.getItem('kahoot-player') || 'null');
let questionStarted = 0;
let timer;

document.querySelector('#join-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const input = Object.fromEntries(new FormData(form));
    await api('/api/player/harness/reset', { method: 'POST', body: { scoringMode: input.scoringMode } });
    delete input.scoringMode;
    player = await api('/api/player/join', { method: 'POST', body: input });
    sessionStorage.setItem('kahoot-player', JSON.stringify(player));
    await refresh();
  } catch (error) { form.querySelector('.error').textContent = error.message; }
});

async function refresh() {
  if (!player) return;
  try {
    const state = await api(`/api/player/state?participantId=${encodeURIComponent(player.participantId)}`);
    joinPanel.classList.add('hidden'); gamePanel.classList.remove('hidden'); identity.textContent = state.player.nickname;
    if (state.phase === 'completed') return renderCompleted(state);
    if (state.phase === 'lobby') return renderLobby(state);
    renderQuestion(state);
  } catch { sessionStorage.removeItem('kahoot-player'); player = null; }
}

function renderLobby(state) { gamePanel.innerHTML = `<div class="result"><p class="eyebrow">You're in</p><h1>Hi, ${escape(state.player.nickname)}!</h1><p>Waiting for the host to start…</p></div>`; }
function renderCompleted(state) { clearInterval(timer); gamePanel.innerHTML = `<div class="result"><p class="eyebrow">Quiz complete</p><h1>Final leaderboard</h1><p class="score">${state.player.score} points</p>${leaderboard(state.leaderboard, state.player.id)}</div>`; }
function renderQuestion(state) {
  clearInterval(timer); const q = state.question; const selected = new Set();
  if (state.phase === 'feedback') return renderFeedback(state);
  questionStarted = Date.now();
  gamePanel.innerHTML = `<div class="meta"><span>Question ${q.questionNumber} of ${q.totalQuestions}</span><span class="timer"></span></div><h1>${escape(q.prompt)}</h1><p>${q.type === 'multiple_choice' ? 'Select all that apply' : 'Choose one answer'}</p><fieldset class="answers">${q.options.map((option) => `<button class="answer" type="button" data-id="${escape(option.id)}">${escape(option.text)}</button>`).join('')}</fieldset><button class="submit" disabled>Submit answer</button><p class="error" role="alert"></p>`;
  const submit = gamePanel.querySelector('.submit');
  for (const button of gamePanel.querySelectorAll('.answer')) button.onclick = () => {
    if (q.type === 'single_choice') { selected.clear(); gamePanel.querySelectorAll('.answer').forEach((item) => item.classList.remove('selected')); }
    selected.has(button.dataset.id) ? selected.delete(button.dataset.id) : selected.add(button.dataset.id);
    button.classList.toggle('selected', selected.has(button.dataset.id)); submit.disabled = !selected.size;
  };
  submit.onclick = async () => { try { await api('/api/player/answer', { method: 'POST', body: { sessionId: player.sessionId, participantId: player.participantId, questionId: q.questionId, optionIds: [...selected], responseTimeMs: Date.now() - questionStarted } }); await refresh(); } catch (error) { gamePanel.querySelector('.error').textContent = error.message; } };
  const updateTimer = () => { const seconds = Math.max(0, Math.ceil((new Date(q.closesAt) - Date.now()) / 1000)); gamePanel.querySelector('.timer').textContent = `${seconds}s`; };
  updateTimer(); timer = setInterval(updateTimer, 1000);
}
function renderFeedback(state) {
  clearInterval(timer); const result = state.result;
  gamePanel.innerHTML = `<div class="result"><p class="eyebrow">${result.isCorrect ? 'Correct!' : 'Not this time'}</p><h1>${result.isCorrect ? `+${result.pointsAwarded} points` : 'Keep going!'}</h1><p class="mode">${state.scoringMode === 'fixed' ? 'Fixed points' : 'Speed-weighted'} scoring</p><div class="answers reveal">${result.reveal.map((option) => `<div class="answer ${option.isCorrect ? 'correct' : option.isSelected ? 'wrong' : ''}">${escape(option.text)} ${option.isCorrect ? '<strong>✓ Correct</strong>' : option.isSelected ? '<strong>✕ Your answer</strong>' : ''}</div>`).join('')}</div><p>${escape(result.explanation || '')}</p><p class="score">Score: ${result.totalScore}</p><h2>Live leaderboard</h2>${leaderboard(state.leaderboard, state.player.id)}<p>Waiting for the next question…</p></div>`;
}
function leaderboard(entries, playerId) { return `<ol class="leaderboard">${entries.map((entry) => `<li class="${entry.participantId === playerId ? 'you' : ''}"><span>#${entry.rank} ${escape(entry.nickname)}</span><strong>${entry.score}</strong></li>`).join('')}</ol>`; }
async function api(path, options = {}) { const response = await fetch(path, { ...options, headers: options.body ? { 'content-type': 'application/json' } : {}, body: options.body ? JSON.stringify(options.body) : undefined }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Something went wrong'); return body; }
function escape(value) { const element = document.createElement('span'); element.textContent = value; return element.innerHTML; }
document.querySelector('#next').onclick = async () => { await api('/api/player/harness/advance', { method: 'POST', body: {} }); await refresh(); };
document.querySelector('#rivals').onclick = async () => { await api('/api/player/harness/rivals', { method: 'POST', body: {} }); await refresh(); };
document.querySelector('#reset').onclick = async () => { await api('/api/player/harness/reset', { method: 'POST', body: { scoringMode: 'speed_weighted' } }); sessionStorage.removeItem('kahoot-player'); location.reload(); };
refresh();
