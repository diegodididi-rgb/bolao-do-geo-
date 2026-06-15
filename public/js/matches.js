// Lista de jogos + entrada de palpites
// Regras de uso: pode palpitar em QUALQUER jogo (inclusive já encerrados, pois os
// palpites foram feitos antes no papel). Cada palpite é WRITE-ONCE: salvou, não edita.
import { db } from './firebase-config.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadUserPredictions, savePrediction } from './predictions.js';
import { loadUserKoPredictions, saveKoPrediction } from './koPredictions.js';
import { computeGroupStandings } from './standings.js';
import { ROUND_LABELS, resolveFullBracket, thirdByGroup, THIRD_SLOTS } from './bracket.js';
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
    container.innerHTML = `<p class="empty">Erro ao carregar: ${e.message}</p>`;
    return;
  }
  if (!matches.length) {
    container.innerHTML = '<p class="empty">Os jogos ainda não foram carregados.</p>';
    return;
  }

  const refresh = () => renderKnockout(container, user);
  const groupMatches = matches.filter(m => m.stage === 'GROUP_STAGE');

  // mapa nome do time -> escudo, construído a partir dos jogos de grupo
  const teamCrest = new Map();
  for (const m of groupMatches) {
    if (m.homeTeam) teamCrest.set(m.homeTeam, m.homeCrest);
    if (m.awayTeam) teamCrest.set(m.awayTeam, m.awayCrest);
  }

  // os jogos de abertura (BLOCKED) não entram na conta (não dá para palpitar)
  const palpitaveis = groupMatches.filter(m => !BLOCKED.has(m.id));
  const done = palpitaveis.filter(m => preds.get(m.id)).length;
  const total = palpitaveis.length;

  container.innerHTML = '';
  if (done < total) {
    const ko = document.createElement('section');
    ko.className = 'stage';
    ko.innerHTML = `<h2 class="stage-title">Seu chaveamento</h2>
      <p class="hint top-note">🔒 Complete os palpites da fase de grupos na aba <b>“Palpites (Grupos)”</b> para o app montar o <b>seu</b> chaveamento previsto.<br>Faltam <b>${total - done}</b> de <b>${total}</b>.</p>`;
    container.appendChild(ko);
    return;
  }
  renderKoBracket(container, groupMatches, preds, koPreds, teamCrest, user, refresh);
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
  const resolved = resolveFullBracket(standings, koPreds); // Map matchNum(73-104) -> {home, away}
  const thirdTeams = thirdByGroup(standings);              // letra do grupo -> nome do 3º colocado

  const intro = document.createElement('p');
  intro.className = 'hint top-note';
  intro.innerHTML = '🏆 Monte aqui o <b>seu mata-mata</b> como você fez no papel. Os mandantes (1º/2º dos grupos) já vêm dos seus palpites; nos jogos com <b>3º colocado</b>, escolha o time na <b>lista</b>. Depois preencha o placar e salve (também <b>definitivo</b>). <span class="nowrap">↔ arraste para os lados</span> para ver o chaveamento inteiro.';
  container.appendChild(intro);

  const onSave = async (matchNum, h, a, winner, thirdGroup) => {
    await saveKoPrediction(user.uid, matchNum, h, a, winner, thirdGroup);
    await refresh();
  };
  container.appendChild(buildKoBracket(resolved, koPreds, teamCrest, onSave, thirdTeams));
}

// Monta o chaveamento visual (esquerda → final ← direita) seguindo a ordem do PDF.
// onSave(matchNum, h, a, winner, thirdGroup?) -> Promise. Exportado para teste visual.
export function buildKoBracket(resolved, koPreds, teamCrest, onSave, thirdTeams = {}) {
  // terceiros já escolhidos em outros jogos (p/ não repetir na lista)
  const usedThirds = new Set();
  for (const [n, p] of koPreds) if (p && p.thirdGroup) usedThirds.add(p.thirdGroup);

  const card = (n) => koCard(n, resolved.get(n), koPreds.get(n), teamCrest, onSave, thirdTeams, usedThirds);

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

// Card compacto de um confronto do chaveamento previsto (jogos 73-104).
// Nos jogos de 16-avos que recebem um 3º colocado (THIRD_SLOTS), o time visitante
// é ESCOLHIDO pelo usuário numa lista suspensa (dentre os 3ºs dos grupos permitidos).
function koCard(matchNum, teams, pred, teamCrest, onSave, thirdTeams, usedThirds) {
  const card = el('div', 'kob-match');
  const hasPred = pred != null;
  const thirdGroups = THIRD_SLOTS[matchNum];        // grupos permitidos p/ o 3º (ou undefined)
  const isThirdSlot = !!thirdGroups;
  const home = teams ? teams.home : null;
  let away = teams ? teams.away : null;

  // mandante indefinido (depende de jogos anteriores) -> aguardando
  if (!home) {
    card.innerHTML = `<div class="kob-wait">🔒 aguardando<br>confrontos anteriores</div>`;
    return card;
  }
  // confronto normal (sem 3º) ainda sem o visitante definido -> aguardando
  if (!isThirdSlot && !away) {
    card.innerHTML = `<div class="kob-wait">🔒 aguardando<br>confrontos anteriores</div>`;
    return card;
  }

  const advSide = hasPred ? (pred.winner === 'home' ? 'home' : 'away') : null;
  const vh = hasPred ? pred.home : '';
  const va = hasPred ? pred.away : '';

  // monta o "lado visitante": time fixo OU lista suspensa de 3ºs (quando editável)
  let awayInner;
  if (isThirdSlot && !hasPred) {
    const opts = ['<option value="">— escolha o 3º —</option>'];
    for (const g of [...thirdGroups].sort()) {
      const t = thirdTeams[g];
      if (!t) continue;
      if (usedThirds.has(g)) continue;       // já usado em outro jogo
      opts.push(`<option value="${g}">${esc(translateTeam(t))} (3º ${g})</option>`);
    }
    awayInner = `<select class="kob-third">${opts.join('')}</select>`;
  } else {
    awayInner = `${crest(teamCrest.get(away))}<span class="nm">${esc(translateTeam(away))}</span>`;
  }

  card.innerHTML = `
    <div class="kob-row home ${advSide === 'home' ? 'adv' : ''}" data-side="home">
      <span class="kob-team">${crest(teamCrest.get(home))}<span class="nm">${esc(translateTeam(home))}</span></span>
      <input type="number" min="0" inputmode="numeric" class="kob-sc home" value="${vh}" ${hasPred ? 'disabled' : ''} aria-label="gols mandante" />
    </div>
    <div class="kob-row away ${advSide === 'away' ? 'adv' : ''}" data-side="away">
      <span class="kob-team">${awayInner}</span>
      <input type="number" min="0" inputmode="numeric" class="kob-sc away" value="${va}" ${hasPred ? 'disabled' : ''} aria-label="gols visitante" />
    </div>
    <div class="kob-foot">${hasPred ? '<span class="kob-status">✓ definitivo</span>' : '<button class="kob-save">Salvar</button>'}</div>`;

  if (!hasPred) {
    card.classList.add('editable');
    const rowH = card.querySelector('.kob-row.home');
    const rowA = card.querySelector('.kob-row.away');
    const scH  = card.querySelector('.kob-sc.home');
    const scA  = card.querySelector('.kob-sc.away');
    const sel  = card.querySelector('.kob-third');
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
    rowA.addEventListener('click', e => { if (e.target === scA || e.target === sel) return; pick = 'away'; refreshAdv(); });
    scH.addEventListener('input', refreshAdv);
    scA.addEventListener('input', refreshAdv);

    card.querySelector('.kob-save').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const thirdGroup = sel ? sel.value : null;
      if (isThirdSlot && !thirdGroup) { alert('Escolha o 3º colocado deste confronto na lista.'); return; }
      const awayName = isThirdSlot ? thirdTeams[thirdGroup] : away;
      const h = parseInt(scH.value, 10), a = parseInt(scA.value, 10);
      if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) { alert('Preencha os dois placares com números ≥ 0.'); return; }
      const winner = h > a ? 'home' : (a > h ? 'away' : pick);
      if (!winner) { alert('Empate: toque no time que você acha que avança nos pênaltis.'); return; }
      const winnerName = winner === 'home' ? home : awayName;
      if (!confirm(`Confirmar palpite:\n\n${translateTeam(home)} ${h} x ${a} ${translateTeam(awayName)}\nAvança: ${translateTeam(winnerName)}\n\n⚠️ Depois de salvar NÃO dá para editar.`)) return;
      btn.disabled = true; btn.textContent = 'Salvando…';
      try { await onSave(matchNum, h, a, winner, isThirdSlot ? thirdGroup : null); }
      catch (e) { alert('Não foi possível salvar este palpite.'); btn.disabled = false; btn.textContent = 'Salvar'; }
    });
  }
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
