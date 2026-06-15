// Ranking — calcula a pontuação na hora (no navegador)
// Regra: +1 ponto por acertar o resultado. Desempate: maior nº de placares exatos.
//
// FASE DE GRUPOS: +1 se acertou o resultado (vitória/empate/derrota); cravou o
//   placar exato conta como desempate.
// MATA-MATA: usa o chaveamento que os palpites do usuário criaram. Para cada
//   confronto previsto, se na MESMA fase da Copa real esse confronto aconteceu
//   de verdade e o usuário acertou QUEM AVANÇOU -> +1; placar exato = desempate.
//   Se o palpite criou um confronto que não existiu naquela fase -> sem ponto.
import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { computeGroupStandings, rankThirdPlaced } from './standings.js';
import { resolveFullBracket, MATCH_STAGE } from './bracket.js';

export async function renderRanking(container, currentUid) {
  container.innerHTML = '<p class="loading">Calculando ranking…</p>';

  let usersSnap, matchesSnap, predsSnap, koSnap;
  try {
    [usersSnap, matchesSnap, predsSnap, koSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'matches')),
      getDocs(collection(db, 'predictions')),
      getDocs(collection(db, 'koPredictions')),
    ]);
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao montar o ranking: ${e.message}</p>`;
    return;
  }

  const users = new Map();
  usersSnap.forEach(d => users.set(d.id, { name: d.data().displayName || 'Sem nome', points: 0, exact: 0 }));

  // ---- jogos: separa grupos (metadados) e resultados reais ----
  const allMatches = [];
  matchesSnap.forEach(d => allMatches.push({ id: d.id, ...d.data() }));
  const groupMeta = allMatches.filter(m => m.stage === 'GROUP_STAGE');

  const finishedGroup = new Map(); // matchId -> jogo finalizado (fase de grupos)
  const realKoByStage = new Map(); // stage -> [jogos reais finalizados do mata-mata]
  for (const m of allMatches) {
    const done = m.status === 'finished' && m.homeScore != null && m.awayScore != null;
    if (!done) continue;
    if (m.stage === 'GROUP_STAGE') finishedGroup.set(m.id, m);
    else {
      if (!realKoByStage.has(m.stage)) realKoByStage.set(m.stage, []);
      realKoByStage.get(m.stage).push(m);
    }
  }

  // ---- palpites agrupados por usuário ----
  const groupPredsByUid = new Map(); // uid -> Map(matchId -> {home, away})
  predsSnap.forEach(d => {
    const p = d.data();
    if (!groupPredsByUid.has(p.uid)) groupPredsByUid.set(p.uid, new Map());
    groupPredsByUid.get(p.uid).set(p.matchId, { home: p.homeScore, away: p.awayScore });
  });
  const koPredsByUid = new Map(); // uid -> Map(matchNum -> {home, away, winner})
  koSnap.forEach(d => {
    const p = d.data();
    if (!koPredsByUid.has(p.uid)) koPredsByUid.set(p.uid, new Map());
    koPredsByUid.get(p.uid).set(p.matchNum, { home: p.homeScore, away: p.awayScore, winner: p.winner });
  });

  // ---- pontuação: fase de grupos ----
  for (const [uid, gp] of groupPredsByUid) {
    const u = users.get(uid);
    if (!u) continue;
    for (const [matchId, pred] of gp) {
      const m = finishedGroup.get(matchId);
      if (!m) continue;
      if (sign(pred.home - pred.away) === sign(m.homeScore - m.awayScore)) u.points++;
      if (pred.home === m.homeScore && pred.away === m.awayScore) u.exact++;
    }
  }

  // ---- pontuação: mata-mata (chaveamento criado pelos palpites) ----
  for (const [uid, kp] of koPredsByUid) {
    const u = users.get(uid);
    if (!u || !kp.size) continue;

    const gp = groupPredsByUid.get(uid) || new Map();
    const predictedGroupMatches = groupMeta.map(m => {
      const p = gp.get(m.id);
      return { group: m.group, homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore: p ? p.home : null, awayScore: p ? p.away : null };
    });
    const standings = computeGroupStandings(predictedGroupMatches);
    const thirds = rankThirdPlaced(standings);
    const resolved = resolveFullBracket(standings, thirds, kp);

    for (const [matchNum, pred] of kp) {
      const teams = resolved.get(matchNum);
      if (!teams || !teams.home || !teams.away) continue;
      const realList = realKoByStage.get(MATCH_STAGE[matchNum]);
      if (!realList) continue; // essa fase ainda não rolou na Copa real
      const real = findPair(realList, teams.home, teams.away);
      if (!real) continue;     // confronto previsto não aconteceu nessa fase -> errado

      // acertou quem avançou?
      const userAdv = pred.winner === 'home' ? teams.home : teams.away;
      const realAdv = advancerOf(real);
      if (realAdv && userAdv === realAdv) u.points++;

      // cravou o placar (na orientação do jogo real)?
      const realHomeGoals = real.homeTeam === teams.home ? real.homeScore : real.awayScore;
      const realAwayGoals = real.homeTeam === teams.away ? real.homeScore : real.awayScore;
      if (pred.home === realHomeGoals && pred.away === realAwayGoals) u.exact++;
    }
  }

  const rows = [...users.entries()].map(([uid, u]) => ({ uid, ...u }));
  rows.sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name, 'pt-BR'));

  if (!rows.length) {
    container.innerHTML = '<p class="empty">Ninguém cadastrado ainda.</p>';
    return;
  }

  let html = `<table class="ranking"><thead><tr>
      <th>#</th><th>Participante</th><th>Pontos</th><th>Cravados ⭐</th>
    </tr></thead><tbody>`;
  rows.forEach((r, i) => {
    html += `<tr class="${r.uid === currentUid ? 'me' : ''}">
      <td>${i + 1}</td><td>${esc(r.name)}</td><td class="pts">${r.points}</td><td>${r.exact}</td>
    </tr>`;
  });
  html += `</tbody></table>
    <p class="hint">Pontos = acertos de resultado (grupos) + acertos de quem avançou no mata-mata do seu chaveamento. Desempate por nº de placares cravados (⭐).</p>`;
  container.innerHTML = html;
}

// acha um jogo real cujo par de times é exatamente {a, b} (ordem indiferente)
function findPair(list, a, b) {
  return list.find(m => (m.homeTeam === a && m.awayTeam === b) || (m.homeTeam === b && m.awayTeam === a)) || null;
}

// quem avançou no jogo real: usa o campo winner (vindo do sync); se faltar,
// deduz pelo placar (só funciona quando não foi empate decidido nos pênaltis).
function advancerOf(m) {
  if (m.winner === 'home') return m.homeTeam;
  if (m.winner === 'away') return m.awayTeam;
  if (m.homeScore > m.awayScore) return m.homeTeam;
  if (m.awayScore > m.homeScore) return m.awayTeam;
  return null;
}

function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
