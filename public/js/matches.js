// Lista de jogos + entrada de palpites
// Regras de uso: pode palpitar em QUALQUER jogo (inclusive já encerrados, pois os
// palpites foram feitos antes no papel). Cada palpite é WRITE-ONCE: salvou, não edita.
import { db } from './firebase-config.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadUserPredictions, savePrediction } from './predictions.js';
import { loadUserKoPredictions, saveKoPrediction } from './koPredictions.js';
import { computeGroupStandings, rankThirdPlaced } from './standings.js';
import { R32_FIXTURES, KO_TREE, ROUND_LABELS, resolveFullBracket } from './bracket.js';
import { translateTeam } from './teams.js';

// Jogos de abertura — palpite BLOQUEADO (ids da football-data):
// 537327 = México x África do Sul · 537328 = Coreia do Sul x R. Tcheca
export const BLOCKED = new Set(['537327', '537328']);

const KO_ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'];

export async function renderMatches(container, user) {
  container.innerHTML = '<p class="loading">Carregando jogos…</p>';
  let matches, preds, koPreds;
  try {
    const [snap, p, kp] = await Promise.all([
      getDocs(query(collection(db, 'matches'), orderBy('kickoffTime'))),
      loadUserPredictions(user.uid),
      loadUserKoPredictions(user.uid),
    ]);
    matches = []; snap.forEach(d => matches.push({ id: d.id, ...d.data() }));
    preds = p; koPreds = kp;
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao carregar jogos: ${e.message}</p>`;
    return;
  }
  if (!matches.length) {
    container.innerHTML = '<p class="empty">Os jogos ainda não foram carregados.<br>Rode o sincronizador (sync) para popular a tabela.</p>';
    return;
  }

  const refresh = () => renderMatches(container, user);
  const groupMatches = matches.filter(m => m.stage === 'GROUP_STAGE');

  // mapa nome do time -> escudo, construído a partir dos jogos de grupo
  const teamCrest = new Map();
  for (const m of groupMatches) {
    if (m.homeTeam) teamCrest.set(m.homeTeam, m.homeCrest);
    if (m.awayTeam) teamCrest.set(m.awayTeam, m.awayCrest);
  }

  container.innerHTML = '';
  const note = document.createElement('p');
  note.className = 'hint top-note';
  note.innerHTML = '📝 Transcreva aqui os palpites do seu papel — vale para <b>qualquer jogo</b>, inclusive os que já aconteceram. Atenção: depois de salvar, o palpite é <b>definitivo</b> (não dá para editar).';
  container.appendChild(note);

  const sec = document.createElement('section');
  sec.className = 'stage';
  sec.innerHTML = '<h2 class="stage-title">Fase de grupos</h2>';
  for (const m of groupMatches) sec.appendChild(matchCard(m, preds.get(m.id), user, refresh));
  container.appendChild(sec);

  // Mata-mata previsto: montado a partir dos palpites de grupo do usuário.
  // Os jogos de abertura (BLOCKED) não entram na conta — não dá para palpitar
  // neles; no chaveamento eles usam o resultado REAL (já aconteceram).
  const palpitaveis = groupMatches.filter(m => !BLOCKED.has(m.id));
  const done = palpitaveis.filter(m => preds.get(m.id)).length;
  const total = palpitaveis.length;
  if (done < total) {
    const ko = document.createElement('section');
    ko.className = 'stage';
    ko.innerHTML = `<h2 class="stage-title">Mata-mata (seu chaveamento)</h2>
      <p class="hint top-note">🔒 Termine os palpites da fase de grupos para o app montar o <b>seu</b> chaveamento previsto.
      Progresso: <b>${done}/${total}</b>.</p>`;
    container.appendChild(ko);
  } else {
    renderKoBracket(container, groupMatches, preds, koPreds, teamCrest, user, refresh);
  }
}

function renderKoBracket(container, groupMatches, preds, koPreds, teamCrest, user, refresh) {
  // monta os jogos de grupo com os PALPITES do usuário (não o resultado real).
  // Exceção: jogos de abertura (BLOCKED) usam o resultado REAL, pois já
  // aconteceram e não há palpite para eles.
  const predictedGroupMatches = groupMatches.map(m => {
    if (BLOCKED.has(m.id)) return { ...m }; // já traz homeScore/awayScore reais do sync
    const p = preds.get(m.id);
    return { ...m, homeScore: p ? p.home : null, awayScore: p ? p.away : null };
  });
  const standings = computeGroupStandings(predictedGroupMatches);
  const thirds = rankThirdPlaced(standings);
  const resolved = resolveFullBracket(standings, thirds, koPreds); // Map matchNum(73-104) -> {home, away}

  const byRound = new Map();
  for (const fx of R32_FIXTURES) addToRound(byRound, 'R32', fx.match);
  for (const node of KO_TREE) addToRound(byRound, node.round, node.match);

  const intro = document.createElement('p');
  intro.className = 'hint top-note';
  intro.innerHTML = '🏆 Este é o <b>seu chaveamento</b>, montado a partir dos seus palpites de grupo: classificações previstas → confrontos previstos. Palpite o placar de cada confronto (também <b>definitivo</b>) para avançar seu time no chaveamento.';
  container.appendChild(intro);

  for (const round of KO_ROUND_ORDER) {
    const nums = byRound.get(round);
    if (!nums) continue;
    const sec = document.createElement('section');
    sec.className = 'stage';
    sec.innerHTML = `<h2 class="stage-title">${ROUND_LABELS[round]}</h2>`;
    for (const num of nums) {
      sec.appendChild(koMatchCard(num, resolved.get(num), koPreds.get(num), teamCrest, user, refresh));
    }
    container.appendChild(sec);
  }
}

function addToRound(byRound, round, matchNum) {
  if (!byRound.has(round)) byRound.set(round, []);
  byRound.get(round).push(matchNum);
}

function matchCard(m, pred, user, refresh) {
  const card = document.createElement('div');
  card.className = 'match';

  const kickoff  = toDate(m.kickoffTime);
  const finished = m.status === 'finished' && m.homeScore != null && m.awayScore != null;
  const hasPred  = pred != null;            // write-once: já palpitou?
  const blocked  = BLOCKED.has(m.id);       // jogos de abertura: palpite bloqueado
  const editable = !hasPred && !blocked;
  const when     = kickoff.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const vh = hasPred ? pred.home : '';
  const va = hasPred ? pred.away : '';

  // monta o rodapé conforme os 4 cenários
  const footParts = [];
  if (finished) footParts.push(`<span class="official">Oficial: ${m.homeScore} x ${m.awayScore}</span>`);
  if (finished && hasPred) {
    const pts   = sign(pred.home - pred.away) === sign(m.homeScore - m.awayScore) ? 1 : 0;
    const exact = pred.home === m.homeScore && pred.away === m.awayScore;
    footParts.push(`<span class="badge ${pts ? 'ok' : 'no'}">${pts} pt${exact ? ' ⭐' : ''}</span>`);
  }
  if (blocked && !hasPred) footParts.push(`<span class="locked">🚫 Palpite bloqueado</span>`);
  else if (hasPred && !finished) footParts.push(`<span class="locked">✓ Palpite enviado — definitivo</span>`);
  else if (editable) footParts.push(`<button class="save">Salvar palpite</button>`);

  card.innerHTML = `
    <div class="match-meta">
      <span>${groupLabel(m.group)}</span>
      <span>${when} (Brasília)</span>
    </div>
    <div class="match-row">
      <div class="team home"><span>${esc(translateTeam(m.homeTeam))}</span>${crest(m.homeCrest)}</div>
      <div class="scores">
        <input type="number" min="0" inputmode="numeric" class="sc home" value="${vh}" ${editable ? '' : 'disabled'} aria-label="gols ${esc(translateTeam(m.homeTeam))}" />
        <span class="x">x</span>
        <input type="number" min="0" inputmode="numeric" class="sc away" value="${va}" ${editable ? '' : 'disabled'} aria-label="gols ${esc(translateTeam(m.awayTeam))}" />
      </div>
      <div class="team away">${crest(m.awayCrest)}<span>${esc(translateTeam(m.awayTeam))}</span></div>
    </div>
    <div class="match-foot">${footParts.join(' ')}</div>`;

  if (editable) {
    const btn = card.querySelector('.save');
    btn.addEventListener('click', async () => {
      const h = parseInt(card.querySelector('.sc.home').value, 10);
      const a = parseInt(card.querySelector('.sc.away').value, 10);
      if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
        alert('Preencha os dois placares com números ≥ 0.'); return;
      }
      if (!confirm(`Confirmar palpite:\n\n${translateTeam(m.homeTeam)} ${h} x ${a} ${translateTeam(m.awayTeam)}\n\n⚠️ Depois de salvar NÃO dá para editar.`)) return;
      btn.disabled = true; btn.textContent = 'Salvando…';
      try {
        await savePrediction(user.uid, m.id, h, a);
        await refresh();   // re-renderiza: trava o card (write-once)
      } catch (e) {
        alert('Não foi possível salvar este palpite.');
        btn.disabled = false; btn.textContent = 'Salvar palpite';
      }
    });
  }
  return card;
}

// Card de um confronto do chaveamento PREVISTO (jogos 73-104).
// pred (se existir) = { home, away, winner } já salvo pelo usuário.
function koMatchCard(matchNum, teams, pred, teamCrest, user, refresh) {
  const card = document.createElement('div');
  card.className = 'match';

  if (!teams || !teams.home || !teams.away) {
    card.innerHTML = `<div class="match-foot"><span class="locked">🔒 Aguardando os palpites dos jogos anteriores do seu chaveamento</span></div>`;
    return card;
  }

  const { home, away } = teams;
  const hasPred = pred != null;
  const vh = hasPred ? pred.home : '';
  const va = hasPred ? pred.away : '';

  const footParts = [];
  if (hasPred) {
    const winnerName = pred.winner === 'home' ? home : away;
    footParts.push(`<span class="locked">✓ Palpite enviado — definitivo</span>`);
    footParts.push(`<span class="badge ok">Avança no seu bracket: ${esc(translateTeam(winnerName))}</span>`);
  } else {
    footParts.push(`<button class="save">Salvar palpite</button>`);
  }

  card.innerHTML = `
    <div class="match-row">
      <div class="team home"><span>${esc(translateTeam(home))}</span>${crest(teamCrest.get(home))}</div>
      <div class="scores">
        <input type="number" min="0" inputmode="numeric" class="sc home" value="${vh}" ${hasPred ? 'disabled' : ''} aria-label="gols ${esc(translateTeam(home))}" />
        <span class="x">x</span>
        <input type="number" min="0" inputmode="numeric" class="sc away" value="${va}" ${hasPred ? 'disabled' : ''} aria-label="gols ${esc(translateTeam(away))}" />
      </div>
      <div class="team away">${crest(teamCrest.get(away))}<span>${esc(translateTeam(away))}</span></div>
    </div>
    ${hasPred ? '' : `
    <div class="ko-tiebreak">
      <label class="hint">Se empatar, quem avança nos pênaltis?
        <select class="ko-winner">
          <option value="home">${esc(translateTeam(home))}</option>
          <option value="away">${esc(translateTeam(away))}</option>
        </select>
      </label>
    </div>`}
    <div class="match-foot">${footParts.join(' ')}</div>`;

  if (!hasPred) {
    const btn = card.querySelector('.save');
    btn.addEventListener('click', async () => {
      const h = parseInt(card.querySelector('.sc.home').value, 10);
      const a = parseInt(card.querySelector('.sc.away').value, 10);
      if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
        alert('Preencha os dois placares com números ≥ 0.'); return;
      }
      const winner = h === a ? card.querySelector('.ko-winner').value : (h > a ? 'home' : 'away');
      const winnerName = winner === 'home' ? home : away;
      if (!confirm(`Confirmar palpite:\n\n${translateTeam(home)} ${h} x ${a} ${translateTeam(away)}\n\nAvança no seu chaveamento: ${translateTeam(winnerName)}\n\n⚠️ Depois de salvar NÃO dá para editar.`)) return;
      btn.disabled = true; btn.textContent = 'Salvando…';
      try {
        await saveKoPrediction(user.uid, matchNum, h, a, winner);
        await refresh();
      } catch (e) {
        alert('Não foi possível salvar este palpite.');
        btn.disabled = false; btn.textContent = 'Salvar palpite';
      }
    });
  }
  return card;
}

function crest(url) { return url ? `<img class="crest" src="${url}" alt="" loading="lazy" />` : `<span class="crest ph"></span>`; }
function groupLabel(g) { return g ? g.replace('GROUP_', 'Grupo ') : ''; }
function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }
function toDate(t) { return t && t.toDate ? t.toDate() : new Date(t); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
