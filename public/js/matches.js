// Lista de jogos + entrada de palpites
// Regras de uso: pode palpitar em QUALQUER jogo (inclusive já encerrados, pois os
// palpites foram feitos antes no papel). Cada palpite é WRITE-ONCE: salvou, não edita.
import { db } from './firebase-config.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadUserPredictions, savePrediction } from './predictions.js';
import { loadUserKoPredictions, saveKoPrediction } from './koPredictions.js';
import { ROUND_LABELS, resolveFullBracket, R32_MATCHES } from './bracket.js';
import { translateTeam } from './teams.js';

// Jogos de abertura — palpite BLOQUEADO (ids da football-data):
// 537327 = México x África do Sul · 537328 = Coreia do Sul x R. Tcheca
export const BLOCKED = new Set(['537327', '537328']);

// Layout do chaveamento (duas pontas convergindo na final), na ordem do PDF.
// Esquerda alimenta a Semifinal 1 (jogo 101); direita, a Semifinal 2 (102).
const BR_LEFT  = { R32: [74, 77, 73, 75, 83, 84, 81, 82], R16: [89, 90, 93, 94], QF: [97, 98], SF: [101] };
const BR_RIGHT = { SF: [102], QF: [99, 100], R16: [91, 92, 95, 96], R32: [76, 78, 79, 80, 86, 88, 85, 87] };
const BR_LEFT_ORDER  = ['R32', 'R16', 'QF', 'SF'];
const BR_RIGHT_ORDER = ['SF', 'QF', 'R16', 'R32'];

// ===== Aba "Palpites (Grupos)" =====
export async function renderGroups(container, user) {
  container.innerHTML = '<p class="loading">Carregando jogos…</p>';
  let matches, preds;
  try {
    const [snap, p] = await Promise.all([
      getDocs(query(collection(db, 'matches'), orderBy('kickoffTime'))),
      loadUserPredictions(user.uid),
    ]);
    matches = []; snap.forEach(d => matches.push({ id: d.id, ...d.data() }));
    preds = p;
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao carregar jogos: ${e.message}</p>`;
    return;
  }
  if (!matches.length) {
    container.innerHTML = '<p class="empty">Os jogos ainda não foram carregados.<br>Rode o sincronizador (sync) para popular a tabela.</p>';
    return;
  }

  const refresh = () => renderGroups(container, user);
  const groupMatches = matches.filter(m => m.stage === 'GROUP_STAGE');

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

  // dica de progresso + apontar para a aba do mata-mata
  const palpitaveis = groupMatches.filter(m => !BLOCKED.has(m.id));
  const done = palpitaveis.filter(m => preds.get(m.id)).length;
  const total = palpitaveis.length;
  const tip = document.createElement('p');
  tip.className = 'hint top-note';
  tip.innerHTML = done < total
    ? `Faltam <b>${total - done}</b> palpite(s) de grupo. Complete todos para liberar o <b>seu chaveamento</b> na aba “Palpites (Mata-mata)”. Progresso: <b>${done}/${total}</b>.`
    : '✅ Fase de grupos completa! Vá para a aba <b>Palpites (Mata-mata)</b> para montar e palpitar o seu chaveamento.';
  container.appendChild(tip);
}

// ===== Aba "Palpites (Mata-mata)" =====
export async function renderKnockout(container, user) {
  container.innerHTML = '<p class="loading">Carregando…</p>';
  let matches, koPreds;
  try {
    const [snap, kp] = await Promise.all([
      getDocs(query(collection(db, 'matches'), orderBy('kickoffTime'))),
      loadUserKoPredictions(user.uid),
    ]);
    matches = []; snap.forEach(d => matches.push({ id: d.id, ...d.data() }));
    koPreds = kp;
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao carregar: ${e.message}</p>`;
    return;
  }
  if (!matches.length) {
    container.innerHTML = '<p class="empty">Os jogos ainda não foram carregados.</p>';
    return;
  }

  const refresh = () => renderKnockout(container, user);
  const groupMatches = matches.filter(m => m.stage === 'GROUP_STAGE');

  // todas as 48 seleções (nome -> escudo), a partir dos jogos de grupo
  const teamCrest = new Map();
  for (const m of groupMatches) {
    if (m.homeTeam && m.homeTeam !== 'A definir') teamCrest.set(m.homeTeam, m.homeCrest);
    if (m.awayTeam && m.awayTeam !== 'A definir') teamCrest.set(m.awayTeam, m.awayCrest);
  }

  container.innerHTML = '';
  renderKoBracket(container, koPreds, teamCrest, user, refresh);
}

function renderKoBracket(container, koPreds, teamCrest, user, refresh) {
  const resolved = resolveFullBracket(koPreds); // Map matchNum(73-104) -> {home, away}
  const allTeams = [...teamCrest.keys()];        // as 48 seleções

  const intro = document.createElement('p');
  intro.className = 'hint top-note';
  intro.innerHTML = '🏆 Monte aqui o <b>seu mata-mata</b> como você fez no papel. Nos <b>16-avos</b>, escolha as duas seleções de cada confronto nas <b>listas</b> (cada seleção só pode ser usada uma vez). Das oitavas em diante, o confronto sai sozinho de quem você marcar como vencedor. Preencha o placar e salve (também <b>definitivo</b>). <span class="nowrap">↔ arraste para os lados</span> para ver o chaveamento inteiro.';
  container.appendChild(intro);

  const onSave = async (matchNum, h, a, winner, teams) => {
    await saveKoPrediction(user.uid, matchNum, h, a, winner, teams);
    await refresh();
  };
  container.appendChild(buildKoBracket(resolved, koPreds, teamCrest, onSave, allTeams));
}

// Monta o chaveamento visual (esquerda → final ← direita) seguindo a ordem do PDF.
// onSave(matchNum, h, a, winner, teams?) -> Promise. Exportado para teste visual.
export function buildKoBracket(resolved, koPreds, teamCrest, onSave, allTeams = []) {
  // seleções já escolhidas em jogos de 16-avos salvos (p/ não repetir nas listas)
  const usedTeams = new Set();
  for (const [n, p] of koPreds) {
    if (!R32_MATCHES.has(n) || !p) continue;
    if (p.homeTeam) usedTeams.add(p.homeTeam);
    if (p.awayTeam) usedTeams.add(p.awayTeam);
  }

  const card = (n) => koCard(n, resolved.get(n), koPreds.get(n), teamCrest, onSave, allTeams, usedTeams);

  const scroll = el('div', 'kobracket-scroll');
  const bracket = el('div', 'kobracket');

  const left = el('div', 'kob-side left');
  for (const r of BR_LEFT_ORDER) left.appendChild(roundCol(r, BR_LEFT[r], card));
  bracket.appendChild(left);

  const center = el('div', 'kob-center');
  center.appendChild(centerLabel('🏆 Final'));
  center.appendChild(card(104));
  center.appendChild(centerLabel('3º lugar'));
  center.appendChild(card(103));
  bracket.appendChild(center);

  const right = el('div', 'kob-side right');
  for (const r of BR_RIGHT_ORDER) right.appendChild(roundCol(r, BR_RIGHT[r], card));
  bracket.appendChild(right);

  scroll.appendChild(bracket);
  return scroll;
}

function roundCol(round, nums, card) {
  const col = el('div', 'kob-round');
  const head = el('div', 'kob-round-head');
  head.textContent = ROUND_LABELS[round];
  col.appendChild(head);
  const body = el('div', 'kob-col');
  for (const n of nums) body.appendChild(card(n));
  col.appendChild(body);
  return col;
}

// Card de um confronto do chaveamento (jogos 73-104).
// 16-avos (73-88) ainda não montados: o usuário escolhe as DUAS seleções em
// listas (todas as 48, menos as já usadas). Demais fases: os times vêm em
// cascata dos vencedores dos jogos anteriores.
function koCard(matchNum, teams, pred, teamCrest, onSave, allTeams, usedTeams) {
  const card = el('div', 'kob-match');
  const hasPred = pred != null;
  const isR32 = R32_MATCHES.has(matchNum);

  // 16-avos ainda não palpitado -> duas caixas de seleção
  if (isR32 && !hasPred) return r32PickCard(card, matchNum, teamCrest, onSave, allTeams, usedTeams);

  const home = teams ? teams.home : null;
  const away = teams ? teams.away : null;

  // fases seguintes ainda sem os dois times definidos -> aguardando
  if (!home || !away) {
    card.innerHTML = `<div class="kob-wait">🔒 aguardando<br>confrontos anteriores</div>`;
    return card;
  }

  const advSide = hasPred ? (pred.winner === 'home' ? 'home' : 'away') : null;
  const vh = hasPred ? pred.home : '';
  const va = hasPred ? pred.away : '';

  card.innerHTML = `
    <div class="kob-row home ${advSide === 'home' ? 'adv' : ''}" data-side="home">
      <span class="kob-team">${crest(teamCrest.get(home))}<span class="nm">${esc(translateTeam(home))}</span></span>
      <input type="number" min="0" inputmode="numeric" class="kob-sc home" value="${vh}" ${hasPred ? 'disabled' : ''} aria-label="gols mandante" />
    </div>
    <div class="kob-row away ${advSide === 'away' ? 'adv' : ''}" data-side="away">
      <span class="kob-team">${crest(teamCrest.get(away))}<span class="nm">${esc(translateTeam(away))}</span></span>
      <input type="number" min="0" inputmode="numeric" class="kob-sc away" value="${va}" ${hasPred ? 'disabled' : ''} aria-label="gols visitante" />
    </div>
    <div class="kob-foot">${hasPred ? '<span class="kob-status">✓ definitivo</span>' : '<button class="kob-save">Salvar</button>'}</div>`;

  if (!hasPred) {
    card.classList.add('editable');
    const rowH = card.querySelector('.kob-row.home');
    const rowA = card.querySelector('.kob-row.away');
    const scH  = card.querySelector('.kob-sc.home');
    const scA  = card.querySelector('.kob-sc.away');
    let pick = null; // escolha manual de quem avança (usada só em empate)

    const setAdv = (side) => {
      rowH.classList.toggle('adv', side === 'home');
      rowA.classList.toggle('adv', side === 'away');
    };
    const refreshAdv = () => {
      const h = parseInt(scH.value, 10), a = parseInt(scA.value, 10);
      if (!Number.isNaN(h) && !Number.isNaN(a)) {
        if (h > a) return setAdv('home');
        if (a > h) return setAdv('away');
      }
      setAdv(pick); // empate ou incompleto -> escolha manual
    };
    rowH.addEventListener('click', e => { if (e.target === scH) return; pick = 'home'; refreshAdv(); });
    rowA.addEventListener('click', e => { if (e.target === scA) return; pick = 'away'; refreshAdv(); });
    scH.addEventListener('input', refreshAdv);
    scA.addEventListener('input', refreshAdv);

    card.querySelector('.kob-save').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const h = parseInt(scH.value, 10), a = parseInt(scA.value, 10);
      if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) { alert('Preencha os dois placares com números ≥ 0.'); return; }
      const winner = h > a ? 'home' : (a > h ? 'away' : pick);
      if (!winner) { alert('Empate: toque no time que você acha que avança nos pênaltis.'); return; }
      const winnerName = winner === 'home' ? home : away;
      if (!confirm(`Confirmar palpite:\n\n${translateTeam(home)} ${h} x ${a} ${translateTeam(away)}\nAvança: ${translateTeam(winnerName)}\n\n⚠️ Depois de salvar NÃO dá para editar.`)) return;
      btn.disabled = true; btn.textContent = 'Salvando…';
      try { await onSave(matchNum, h, a, winner); } // sem teams: time vem da cascata
      catch (e) { alert('Não foi possível salvar este palpite.'); btn.disabled = false; btn.textContent = 'Salvar'; }
    });
  }
  return card;
}

// Card de 16-avos ainda não montado: duas listas com as 48 seleções (menos as
// já usadas em outros jogos), placar e escolha de quem avança.
function r32PickCard(card, matchNum, teamCrest, onSave, allTeams, usedTeams) {
  const sorted = allTeams.slice().sort((a, b) => translateTeam(a).localeCompare(translateTeam(b), 'pt-BR'));
  const options = () => ['<option value="">— escolha a seleção —</option>']
    .concat(sorted.filter(t => !usedTeams.has(t)).map(t => `<option value="${esc(t)}">${esc(translateTeam(t))}</option>`))
    .join('');

  card.classList.add('editable');
  card.innerHTML = `
    <div class="kob-row home" data-side="home">
      <span class="kob-team"><select class="kob-pick home" aria-label="mandante">${options()}</select></span>
      <input type="number" min="0" inputmode="numeric" class="kob-sc home" value="" aria-label="gols mandante" />
    </div>
    <div class="kob-row away" data-side="away">
      <span class="kob-team"><select class="kob-pick away" aria-label="visitante">${options()}</select></span>
      <input type="number" min="0" inputmode="numeric" class="kob-sc away" value="" aria-label="gols visitante" />
    </div>
    <div class="kob-foot"><button class="kob-save">Salvar</button></div>`;

  const rowH = card.querySelector('.kob-row.home');
  const rowA = card.querySelector('.kob-row.away');
  const scH  = card.querySelector('.kob-sc.home');
  const scA  = card.querySelector('.kob-sc.away');
  const selH = card.querySelector('.kob-pick.home');
  const selA = card.querySelector('.kob-pick.away');
  let pick = null;

  // não deixa escolher a mesma seleção nos dois lados
  const syncOptions = () => {
    for (const o of selA.options) o.disabled = !!o.value && o.value === selH.value;
    for (const o of selH.options) o.disabled = !!o.value && o.value === selA.value;
  };
  selH.addEventListener('change', syncOptions);
  selA.addEventListener('change', syncOptions);

  const setAdv = (side) => {
    rowH.classList.toggle('adv', side === 'home');
    rowA.classList.toggle('adv', side === 'away');
  };
  const refreshAdv = () => {
    const h = parseInt(scH.value, 10), a = parseInt(scA.value, 10);
    if (!Number.isNaN(h) && !Number.isNaN(a)) {
      if (h > a) return setAdv('home');
      if (a > h) return setAdv('away');
    }
    setAdv(pick);
  };
  rowH.addEventListener('click', e => { if (e.target === scH || e.target === selH) return; pick = 'home'; refreshAdv(); });
  rowA.addEventListener('click', e => { if (e.target === scA || e.target === selA) return; pick = 'away'; refreshAdv(); });
  scH.addEventListener('input', refreshAdv);
  scA.addEventListener('input', refreshAdv);

  card.querySelector('.kob-save').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const homeTeam = selH.value, awayTeam = selA.value;
    if (!homeTeam || !awayTeam) { alert('Escolha as duas seleções do confronto nas listas.'); return; }
    if (homeTeam === awayTeam) { alert('As duas seleções precisam ser diferentes.'); return; }
    const h = parseInt(scH.value, 10), a = parseInt(scA.value, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) { alert('Preencha os dois placares com números ≥ 0.'); return; }
    const winner = h > a ? 'home' : (a > h ? 'away' : pick);
    if (!winner) { alert('Empate: toque na seleção que você acha que avança nos pênaltis.'); return; }
    const winnerName = winner === 'home' ? homeTeam : awayTeam;
    if (!confirm(`Confirmar palpite:\n\n${translateTeam(homeTeam)} ${h} x ${a} ${translateTeam(awayTeam)}\nAvança: ${translateTeam(winnerName)}\n\n⚠️ Depois de salvar NÃO dá para editar.`)) return;
    btn.disabled = true; btn.textContent = 'Salvando…';
    try { await onSave(matchNum, h, a, winner, { homeTeam, awayTeam }); }
    catch (e) { alert('Não foi possível salvar este palpite.'); btn.disabled = false; btn.textContent = 'Salvar'; }
  });
  return card;
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function centerLabel(t) { const e = el('div', 'kob-center-label'); e.textContent = t; return e; }

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

function crest(url) { return url ? `<img class="crest" src="${url}" alt="" loading="lazy" />` : `<span class="crest ph"></span>`; }
function groupLabel(g) { return g ? g.replace('GROUP_', 'Grupo ') : ''; }
function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }
function toDate(t) { return t && t.toDate ? t.toDate() : new Date(t); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
