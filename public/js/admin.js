// Tela de Admin — (1) override manual de placar e (2) ver palpites dos participantes.
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, orderBy, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { translateTeam } from './teams.js';
import { resolveFullBracket, ROUND_LABELS, MATCH_STAGE } from './bracket.js';

const STAGE_TO_ROUND = {
  LAST_32: 'R32', LAST_16: 'R16', QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF', THIRD_PLACE: '3RD', FINAL: 'FINAL',
};

export async function renderAdmin(container) {
  container.innerHTML = '<p class="loading">Carregando…</p>';
  let matches, usersSnap, predsSnap, koSnap;
  try {
    [matches, usersSnap, predsSnap, koSnap] = await Promise.all([
      getDocs(query(collection(db, 'matches'), orderBy('kickoffTime'))),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'predictions')),
      getDocs(collection(db, 'koPredictions')),
    ]);
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro: ${e.message}</p>`;
    return;
  }
  const matchList = []; matches.forEach(d => matchList.push({ id: d.id, ...d.data() }));
  if (!matchList.length) {
    container.innerHTML = '<p class="empty">Sem jogos. Rode o sincronizador.</p>';
    return;
  }

  container.innerHTML = '';
  container.appendChild(buildScoreEditor(matchList));
  container.appendChild(buildPredictionsViewer(matchList, usersSnap, predsSnap, koSnap));
}

// ---------- Seção 1: corrigir placar ----------
function buildScoreEditor(matchList) {
  const wrap = document.createElement('div');
  const head = document.createElement('div');
  head.innerHTML = `<h2 class="stage-title">Admin — corrigir placar</h2>
    <p class="hint">Normalmente o placar entra sozinho pela API. Use isto só se ela atrasar/errar.
    Marque <b>fixar</b> para impedir que o sincronizador sobrescreva sua correção.</p>`;
  wrap.appendChild(head);

  matchList.forEach(m => {
    const kickoff = toDate(m.kickoffTime);
    const when = kickoff.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <span class="ar-when">${when}</span>
      <span class="ar-teams">${esc(translateTeam(m.homeTeam))} x ${esc(translateTeam(m.awayTeam))}</span>
      <input type="number" min="0" class="ar h" value="${m.homeScore ?? ''}" aria-label="gols casa" />
      <input type="number" min="0" class="ar a" value="${m.awayScore ?? ''}" aria-label="gols fora" />
      <label class="ar-lock"><input type="checkbox" class="ar-ovr" ${m.manualOverride ? 'checked' : ''}/> fixar</label>
      <button class="ar-save">Salvar</button>`;
    row.querySelector('.ar-save').addEventListener('click', async () => {
      const h = parseInt(row.querySelector('.ar.h').value, 10);
      const a = parseInt(row.querySelector('.ar.a').value, 10);
      const ovr = row.querySelector('.ar-ovr').checked;
      if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) { alert('Placar inválido.'); return; }
      try {
        await updateDoc(doc(db, 'matches', m.id), {
          homeScore: h, awayScore: a, status: 'finished', manualOverride: ovr, updatedAt: serverTimestamp()
        });
        row.classList.add('saved-row');
      } catch (e) { alert('Erro ao salvar: ' + e.message); }
    });
    wrap.appendChild(row);
  });
  return wrap;
}

// ---------- Seção 2: ver palpites dos participantes ----------
function buildPredictionsViewer(matchList, usersSnap, predsSnap, koSnap) {
  const sec = document.createElement('section');
  sec.style.marginTop = '2rem';

  const users = [];
  usersSnap.forEach(d => users.push({ uid: d.id, name: d.data().displayName || d.data().email || d.id }));
  users.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // palpites por usuário
  const groupByUid = new Map();   // uid -> Map(matchId -> {home,away})
  predsSnap.forEach(d => {
    const p = d.data();
    if (!groupByUid.has(p.uid)) groupByUid.set(p.uid, new Map());
    groupByUid.get(p.uid).set(p.matchId, { home: p.homeScore, away: p.awayScore });
  });
  const koByUid = new Map();      // uid -> Map(matchNum -> {home,away,winner,homeTeam,awayTeam})
  koSnap.forEach(d => {
    const p = d.data();
    if (!koByUid.has(p.uid)) koByUid.set(p.uid, new Map());
    koByUid.get(p.uid).set(p.matchNum, { home: p.homeScore, away: p.awayScore, winner: p.winner, homeTeam: p.homeTeam, awayTeam: p.awayTeam });
  });

  const groupMatches = matchList.filter(m => m.stage === 'GROUP_STAGE');
  const finished = new Map();
  matchList.forEach(m => { if (m.status === 'finished' && m.homeScore != null && m.awayScore != null) finished.set(m.id, m); });

  sec.innerHTML = `<h2 class="stage-title">Admin — ver palpites</h2>
    <p class="hint">Escolha um participante para ver os palpites da fase de grupos e o mata-mata que ele montou.</p>`;

  const select = document.createElement('select');
  select.className = 'adm-user-select';
  select.innerHTML = '<option value="">— escolha um participante —</option>' +
    users.map(u => `<option value="${u.uid}">${esc(u.name)}</option>`).join('');
  sec.appendChild(select);

  const out = document.createElement('div');
  out.className = 'adm-pred-out';
  sec.appendChild(out);

  select.addEventListener('change', () => {
    const uid = select.value;
    if (!uid) { out.innerHTML = ''; return; }
    renderUserPredictions(out, {
      groupMatches, finished,
      gp: groupByUid.get(uid) || new Map(),
      kp: koByUid.get(uid) || new Map(),
    });
  });

  return sec;
}

function renderUserPredictions(out, { groupMatches, finished, gp, kp }) {
  out.innerHTML = '';

  // ----- Fase de grupos -----
  const gSec = document.createElement('div');
  const gDone = groupMatches.filter(m => gp.get(m.id)).length;
  gSec.innerHTML = `<h3 class="adm-sub">Fase de grupos <span class="hint">(${gDone}/${groupMatches.length} palpites)</span></h3>`;
  for (const m of groupMatches) {
    const p = gp.get(m.id);
    if (!p) continue;
    const fin = finished.get(m.id);
    let tag = '';
    if (fin) {
      const pt = sign(p.home - p.away) === sign(fin.homeScore - fin.awayScore) ? 1 : 0;
      const exact = p.home === fin.homeScore && p.away === fin.awayScore;
      tag = `<span class="adm-of">oficial ${fin.homeScore}-${fin.awayScore}</span>
             <span class="badge ${pt ? 'ok' : 'no'}">${pt} pt${exact ? ' ⭐' : ''}</span>`;
    }
    const line = document.createElement('div');
    line.className = 'adm-pline';
    line.innerHTML = `<span class="adm-pt">${esc(translateTeam(m.homeTeam))} <b>${p.home} x ${p.away}</b> ${esc(translateTeam(m.awayTeam))}</span> ${tag}`;
    gSec.appendChild(line);
  }
  out.appendChild(gSec);

  // ----- Mata-mata (o bracket que ele montou) -----
  const koSec = document.createElement('div');
  koSec.innerHTML = `<h3 class="adm-sub">Mata-mata (chaveamento dele)</h3>`;
  if (!kp.size) {
    koSec.innerHTML += '<p class="hint">Nenhum palpite de mata-mata ainda.</p>';
    out.appendChild(koSec);
    return;
  }
  // reconstrói o bracket dele (igual à aba Palpites Mata-mata)
  const resolved = resolveFullBracket(kp);

  const nums = [...kp.keys()].sort((a, b) => a - b);
  let lastRound = '';
  for (const n of nums) {
    const round = STAGE_TO_ROUND[MATCH_STAGE[n]] || '';
    if (round !== lastRound) {
      const h = document.createElement('div');
      h.className = 'adm-koround';
      h.textContent = ROUND_LABELS[round] || round;
      koSec.appendChild(h);
      lastRound = round;
    }
    const teams = resolved.get(n) || {};
    const p = kp.get(n);
    const homeName = teams.home ? translateTeam(teams.home) : '?';
    const awayName = teams.away ? translateTeam(teams.away) : '?';
    const advName = p.winner === 'home' ? homeName : awayName;
    const line = document.createElement('div');
    line.className = 'adm-pline';
    line.innerHTML = `<span class="adm-pt">${esc(homeName)} <b>${p.home} x ${p.away}</b> ${esc(awayName)}</span> <span class="hint">avança: ${esc(advName)}</span>`;
    koSec.appendChild(line);
  }
  out.appendChild(koSec);
}

function toDate(t) { return t && t.toDate ? t.toDate() : new Date(t); }
function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
