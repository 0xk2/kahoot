const $ = (selector) => document.querySelector(selector);
let sessions = [];

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Request failed');
  return body;
}

async function load() {
  try {
    sessions = await request('/api/host/sessions');
    render();
  } catch (error) { message(error.message); }
}

function render() {
  const active = sessions.filter(({ status }) => ['lobby', 'active'].includes(status));
  const past = sessions.filter(({ status }) => ['completed', 'cancelled'].includes(status));
  $('#active-count').textContent = count(active.length, 'session');
  $('#past-count').textContent = count(past.length, 'session');
  $('#active').innerHTML = active.length ? active.map(activeCard).join('') : empty('No sessions are live right now.', 'Choose a published quiz to get started.');
  $('#past').innerHTML = past.length ? past.map(resultRow).join('') : empty('No past results yet.', 'Completed games will appear here.');
  document.querySelectorAll('[data-action]').forEach((button) => button.onclick = () => act(button));
  document.querySelectorAll('[data-results]').forEach((button) => button.onclick = () => showResults(button.dataset.results));
}

function activeCard(room) {
  const players = room.participants.filter(({ status }) => status !== 'removed');
  const disconnected = players.filter(({ status }) => status === 'disconnected').length;
  return `<article class="session-card"><div class="card-top"><span class="status ${room.status}">${room.status === 'lobby' ? 'Lobby open' : 'In progress'}</span><span class="pin">PIN ${room.joinCode}</span></div><h3>${escapeHtml(room.quiz?.title ?? 'Deleted quiz')}</h3><p>${room.quiz?.questionCount ?? 0} questions · ${players.length} ${players.length === 1 ? 'player' : 'players'}${disconnected ? ` · ${disconnected} offline` : ''}</p><div class="players">${players.slice(0, 4).map(({ nickname }) => `<span>${escapeHtml(initials(nickname))}</span>`).join('')} ${players.length ? `<small>${escapeHtml(players.slice(0, 3).map(({ nickname }) => nickname).join(', '))}${players.length > 3 ? ` +${players.length - 3}` : ''}</small>` : '<small>Waiting for players</small>'}</div><div class="actions"><a href="/live?host=${room.joinCode}">Open display</a>${room.status === 'lobby' ? `<button class="primary" data-action="active" data-pin="${room.joinCode}" data-revision="${room.revision}">Start game</button>` : `<button class="primary" data-action="completed" data-pin="${room.joinCode}" data-revision="${room.revision}">End game</button>`}<button class="quiet" data-action="cancelled" data-pin="${room.joinCode}" data-revision="${room.revision}">Cancel</button></div></article>`;
}

function resultRow(room) {
  const winner = room.results?.[0];
  return `<article class="result-row"><div class="result-icon">${room.status === 'cancelled' ? '×' : '✓'}</div><div><h3>${escapeHtml(room.quiz?.title ?? 'Deleted quiz')}</h3><p>${formatDate(room.endedAt ?? room.createdAt)} · PIN ${room.joinCode}</p></div><div class="result-stat"><strong>${room.results?.length ?? 0}</strong><span>players</span></div><div class="result-stat winner"><strong>${winner ? escapeHtml(winner.nickname) : '—'}</strong><span>${winner ? `${winner.score.toLocaleString()} pts · winner` : room.status}</span></div>${room.results ? `<button data-results="${room.joinCode}">View results</button>` : '<span class="cancelled-label">Cancelled</span>'}</article>`;
}

async function act(button) {
  button.disabled = true;
  try {
    await request(`/api/rooms/${button.dataset.pin}/lifecycle`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: button.dataset.action, expectedRevision: Number(button.dataset.revision) }) });
    message(button.dataset.action === 'active' ? 'Game started.' : 'Session updated.');
    await load();
  } catch (error) { message(error.message); await load(); }
}

function showResults(pin) {
  const room = sessions.find((item) => item.joinCode === pin);
  $('#result-title').textContent = room.quiz?.title ?? 'Session';
  $('#result-summary').textContent = `${formatDate(room.endedAt)} · ${room.results.length} players · ${room.quiz?.questionCount ?? 0} questions`;
  $('#standings').innerHTML = room.results.map((result) => `<li><strong>${result.rank}</strong><span>${escapeHtml(result.nickname)}</span><b>${result.score.toLocaleString()} pts</b></li>`).join('');
  $('#result-dialog').showModal();
}

function formatDate(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function count(value, noun) { return `${value} ${noun}${value === 1 ? '' : 's'}`; }
function initials(value) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function empty(title, detail) { return `<div class="empty"><strong>${title}</strong><span>${detail}</span></div>`; }
function message(value) { $('#message').textContent = value; }
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = String(value); return node.innerHTML; }
$('#close').onclick = () => $('#result-dialog').close();
load();
