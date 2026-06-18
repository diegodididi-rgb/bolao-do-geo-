// Cálculo do ranking — função PURA (sem Firebase), compartilhada entre o
// sincronizador (Node, que calcula e salva em rankings/current 4x/dia) e o app
// (fallback, caso o ranking ainda não tenha sido salvo).
//
// Regra: +1 ponto por acertar o resultado. Desempate: maior nº de placares exatos.
//  - FASE DE GRUPOS: +1 se acertou o resultado; cravar o placar conta como desempate.
//  - MATA-MATA: usa o chaveamento montado pelo usuário; para cada confronto, se na
//    MESMA fase da Copa real ele aconteceu e o usuário acertou QUEM AVANÇOU -> +1;
//    placar exato = desempate; confronto que não existiu naquela fase -> sem ponto.
import { resolveFullBracket, MATCH_STAGE } from './bracket.js';

// Recebe arrays simples (vindos dos snapshots) e devolve as linhas do ranking
// já ordenadas: [{ uid, name, points, exact }].
//  usersArr:   [{ uid, displayName, scoreFromMs? }]  // scoreFromMs: só pontua jogos
//                com início >= esse instante (epoch ms); null/ausente = pontua tudo.
//  matchesArr: [{ id, stage, status, homeScore, awayScore, homeTeam, awayTeam, winner, kickoffMs? }]
//  predsArr:   [{ uid, matchId, homeScore, awayScore }]
//  koArr:      [{ uid, matchNum, homeScore, awayScore, winner, homeTeam?, awayTeam? }]
export function computeRanking(usersArr, matchesArr, predsArr, koArr) {
  const users = new Map();
  const scoreFrom = new Map(); // uid -> instante (ms) a partir do qual pontua
  for (const u of usersArr) {
    users.set(u.uid, { name: u.displayName || 'Sem nome', points: 0, exact: 0 });
    if (u.scoreFromMs != null) scoreFrom.set(u.uid, u.scoreFromMs);
  }

  // jogos finalizados: grupos por id; mata-mata real agrupado por fase
  const finishedGroup = new Map();
  const realKoByStage = new Map();
  for (const m of matchesArr) {
    const done = m.status === 'finished' && m.homeScore != null && m.awayScore != null;
    if (!done) continue;
    if (m.stage === 'GROUP_STAGE') finishedGroup.set(m.id, m);
    else {
      if (!realKoByStage.has(m.stage)) realKoByStage.set(m.stage, []);
      realKoByStage.get(m.stage).push(m);
    }
  }

  // palpites por usuário
  const groupPredsByUid = new Map();
  for (const p of predsArr) {
    if (!groupPredsByUid.has(p.uid)) groupPredsByUid.set(p.uid, new Map());
    groupPredsByUid.get(p.uid).set(p.matchId, { home: p.homeScore, away: p.awayScore });
  }
  const koPredsByUid = new Map();
  for (const p of koArr) {
    if (!koPredsByUid.has(p.uid)) koPredsByUid.set(p.uid, new Map());
    const v = { home: p.homeScore, away: p.awayScore, winner: p.winner };
    if (p.homeTeam) v.homeTeam = p.homeTeam;
    if (p.awayTeam) v.awayTeam = p.awayTeam;
    koPredsByUid.get(p.uid).set(p.matchNum, v);
  }

  // pontuação: fase de grupos
  for (const [uid, gp] of groupPredsByUid) {
    const u = users.get(uid);
    if (!u) continue;
    const sf = scoreFrom.get(uid);
    for (const [matchId, pred] of gp) {
      const m = finishedGroup.get(matchId);
      if (!m) continue;
      if (sf != null && m.kickoffMs != null && m.kickoffMs < sf) continue; // antes da data de início
      if (sign(pred.home - pred.away) === sign(m.homeScore - m.awayScore)) u.points++;
      if (pred.home === m.homeScore && pred.away === m.awayScore) u.exact++;
    }
  }

  // pontuação: mata-mata (chaveamento montado pelo usuário)
  for (const [uid, kp] of koPredsByUid) {
    const u = users.get(uid);
    if (!u || !kp.size) continue;
    const sf = scoreFrom.get(uid);
    const resolved = resolveFullBracket(kp);
    for (const [matchNum, pred] of kp) {
      const teams = resolved.get(matchNum);
      if (!teams || !teams.home || !teams.away) continue;
      const realList = realKoByStage.get(MATCH_STAGE[matchNum]);
      if (!realList) continue;
      const real = findPair(realList, teams.home, teams.away);
      if (!real) continue;
      if (sf != null && real.kickoffMs != null && real.kickoffMs < sf) continue; // antes da data de início
      const userAdv = pred.winner === 'home' ? teams.home : teams.away;
      const realAdv = advancerOf(real);
      if (realAdv && userAdv === realAdv) u.points++;
      const realHomeGoals = real.homeTeam === teams.home ? real.homeScore : real.awayScore;
      const realAwayGoals = real.homeTeam === teams.away ? real.homeScore : real.awayScore;
      if (pred.home === realHomeGoals && pred.away === realAwayGoals) u.exact++;
    }
  }

  const rows = [...users.entries()].map(([uid, u]) => ({ uid, name: u.name, points: u.points, exact: u.exact }));
  rows.sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name, 'pt-BR'));
  return rows;
}

// acha um jogo real cujo par de times é exatamente {a, b} (ordem indiferente)
function findPair(list, a, b) {
  return list.find(m => (m.homeTeam === a && m.awayTeam === b) || (m.homeTeam === b && m.awayTeam === a)) || null;
}

// quem avançou no jogo real: usa o campo winner (do sync); senão deduz pelo placar.
function advancerOf(m) {
  if (m.winner === 'home') return m.homeTeam;
  if (m.winner === 'away') return m.awayTeam;
  if (m.homeScore > m.awayScore) return m.homeTeam;
  if (m.awayScore > m.homeScore) return m.awayTeam;
  return null;
}

function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }
