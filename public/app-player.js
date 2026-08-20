import { pageTitle } from './page-titles.js';
const joinPanel = document.querySelector('#join');
const gamePanel = document.querySelector('#game');
const requestedPin = new URLSearchParams(location.search).get('pin');
if (requestedPin) document.querySelector('[name="joinCode"]').value = requestedPin.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
let player = loadPlayer(requestedPin);
let timer;
let questionStarted;

document.querySelector('#join-form').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const input = Object.fromEntries(new FormData(form));
    input.joinCode = input.joinCode.toUpperCase();
    player = await api('/api/player/join', { method: 'POST', body: input });
    localStorage.setItem(`quizzes-player:${input.joinCode}`, JSON.stringify(player));
    await refresh();
  } catch (error) { form.querySelector('.error').textContent = error.message; }
};

async function refresh() {
  if (!player) return;
  try {
    const state = await api(`/api/player/state?participantId=${encodeURIComponent(player.participantId)}&reconnectToken=${encodeURIComponent(player.reconnectToken)}`);
    joinPanel.classList.add('hidden'); gamePanel.classList.remove('hidden');
    document.querySelector('#identity').textContent = state.player.nickname;
    if (state.phase === 'completed') return completed(state);
    if (state.phase === 'lobby') return lobby(state);
    if (state.phase === 'feedback') return feedback(state);
    question(state);
  } catch (error) { gamePanel.innerHTML = `<p class="error">${escape(error.message)}</p>`; }
}
function lobby(state) {
  document.title = pageTitle('Waiting to play');
  gamePanel.innerHTML = `<div class="result"><p class="eyebrow">You're in</p><h1>Hi, ${escape(state.player.nickname)}!</h1><p>Waiting for the host to start…</p></div>`;
  schedule();
}
function completed(state) {
  clearTimeout(timer); document.title = pageTitle('Final leaderboard');
  gamePanel.innerHTML = `<div class="result"><p class="eyebrow">Quiz complete</p><h1>Final leaderboard</h1><p class="score">${state.player.score} points</p>${leaders(state)}</div>`;
}
function question(state) {
  clearTimeout(timer); const q = state.question; const selected = new Set(); questionStarted = Date.now();
  document.title = pageTitle(`Question ${q.questionNumber}`);
  gamePanel.innerHTML = `<div class="meta"><span>Question ${q.questionNumber} of ${q.totalQuestions}</span><span class="timer"></span></div><h1>${escape(q.prompt)}</h1><p>${q.type === 'multiple_choice' ? 'Select all that apply' : 'Choose one answer'}</p><fieldset class="answers">${q.options.map((option) => `<button class="answer" type="button" data-id="${escape(option.id)}">${escape(option.text)}</button>`).join('')}</fieldset><button class="submit" disabled>Submit answer</button><p class="error"></p>`;
  const submit = gamePanel.querySelector('.submit');
  gamePanel.querySelectorAll('.answer').forEach((button) => button.onclick = () => {
    if (q.type === 'single_choice') { selected.clear(); gamePanel.querySelectorAll('.answer').forEach((item) => item.classList.remove('selected')); }
    selected.has(button.dataset.id) ? selected.delete(button.dataset.id) : selected.add(button.dataset.id);
    button.classList.toggle('selected', selected.has(button.dataset.id)); submit.disabled = !selected.size;
  });
  submit.onclick = async () => { try { await api('/api/player/answer', { method: 'POST', body: {
    sessionId: player.sessionId, participantId: player.participantId, questionId: q.questionId,
    optionIds: [...selected], responseTimeMs: Date.now() - questionStarted, reconnectToken: player.reconnectToken } }); await refresh();
  } catch (error) { gamePanel.querySelector('.error').textContent = error.message; } };
  const tick = () => { const seconds = Math.max(0, Math.ceil((new Date(q.closesAt) - Date.now()) / 1000));
    gamePanel.querySelector('.timer').textContent = `${seconds}s`; if (!seconds) refresh(); else timer = setTimeout(tick, 500); };
  tick();
}
function feedback(state) {
  clearTimeout(timer); const result = state.result; document.title = pageTitle('Answer feedback');
  gamePanel.innerHTML = `<div class="result"><p class="eyebrow">${result.timedOut ? 'Time expired' : result.isCorrect ? 'Correct!' : 'Not this time'}</p><h1>${result.isCorrect ? `+${result.pointsAwarded} points` : 'Keep going!'}</h1><div class="answers reveal">${result.reveal.map((option) => `<div class="answer ${option.isCorrect ? 'correct' : option.isSelected ? 'wrong' : ''}">${escape(option.text)} ${option.isCorrect ? '<strong>✓ Correct</strong>' : option.isSelected ? '<strong>✕ Your answer</strong>' : ''}</div>`).join('')}</div><p>${escape(result.explanation || '')}</p><p class="score">Score: ${result.totalScore}</p><h2>Live leaderboard</h2>${leaders(state)}<p>Waiting for the host to continue…</p></div>`;
  schedule();
}
function leaders(state) { return `<ol class="leaderboard">${state.leaderboard.map((entry) => `<li class="${entry.participantId === state.player.id ? 'you' : ''}"><span>#${entry.rank} ${escape(entry.nickname)}</span><strong>${entry.score}</strong></li>`).join('')}</ol>`; }
function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 1000); }
async function api(path, options = {}) { const response = await fetch(path, { ...options,
  headers: options.body ? { 'content-type': 'application/json' } : {}, body: options.body ? JSON.stringify(options.body) : undefined });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Something went wrong'); return body; }
function escape(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function loadPlayer(pin) { try { return JSON.parse(localStorage.getItem(`quizzes-player:${String(pin).toUpperCase()}`)); } catch { return null; } }
refresh();
