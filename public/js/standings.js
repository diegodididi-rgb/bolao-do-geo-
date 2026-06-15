// Motor de classificação de grupos — reutilizado para a Copa REAL e para o
// bracket PREVISTO (a partir dos palpites). Recebe uma lista de jogos com
// { group, homeTeam, awayTeam, homeScore, awayScore } e devolve a tabela de
// cada grupo, já ordenada. Só contabiliza jogos com placar definido.
//
// Critérios de desempate aplicados: pontos -> saldo de gols -> gols pró ->
// confronto direto (pontos entre os empatados) -> ordem alfabética (fallback).

export function computeGroupStandings(matches) {
  const groups = new Map(); // group -> Map(teamName -> row)

  const row = (g, name) => {
    if (!groups.has(g)) groups.set(g, new Map());
    const m = groups.get(g);
    if (!m.has(name)) m.set(name, { team: name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 });
    return m.get(name);
  };

  // 1) registra os 4 times de cada grupo (mesmo sem jogos lançados)
  for (const mt of matches) {
    if (!mt.group) continue;
    if (isTeam(mt.homeTeam)) row(mt.group, mt.homeTeam);
    if (isTeam(mt.awayTeam)) row(mt.group, mt.awayTeam);
  }

  // 2) acumula resultados dos jogos com placar
  for (const mt of matches) {
    if (!mt.group) continue;
    if (mt.homeScore == null || mt.awayScore == null) continue;
    if (!isTeam(mt.homeTeam) || !isTeam(mt.awayTeam)) continue;
    const h = row(mt.group, mt.homeTeam), a = row(mt.group, mt.awayTeam);
    h.P++; a.P++;
    h.GF += mt.homeScore; h.GA += mt.awayScore;
    a.GF += mt.awayScore; a.GA += mt.homeScore;
    if (mt.homeScore > mt.awayScore)      { h.W++; a.L++; h.Pts += 3; }
    else if (mt.homeScore < mt.awayScore) { a.W++; h.L++; a.Pts += 3; }
    else                                  { h.D++; a.D++; h.Pts++; a.Pts++; }
  }

  const result = new Map();
  for (const [g, m] of groups) {
    const rows = [...m.values()];
    rows.forEach(r => r.GD = r.GF - r.GA);
    rows.sort((x, y) => cmp(x, y, matches, g));
    result.set(g, rows);
  }
  return result;
}

// Lista os terceiros colocados de todos os grupos, ordenada (melhores primeiro).
export function rankThirdPlaced(standings) {
  const thirds = [];
  for (const [g, rows] of standings) {
    if (rows[2]) thirds.push({ group: g, ...rows[2] });
  }
  thirds.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF || x.team.localeCompare(y.team, 'pt-BR'));
  return thirds;
}

function cmp(x, y, matches, g) {
  if (y.Pts !== x.Pts) return y.Pts - x.Pts;
  if (y.GD !== x.GD) return y.GD - x.GD;
  if (y.GF !== x.GF) return y.GF - x.GF;
  // confronto direto (pontos no jogo entre os dois, dentro do grupo)
  const hh = headToHead(x.team, y.team, matches, g);
  if (hh !== 0) return hh;
  return x.team.localeCompare(y.team, 'pt-BR');
}

function headToHead(t1, t2, matches, g) {
  let p1 = 0, p2 = 0;
  for (const mt of matches) {
    if (mt.group !== g) continue;
    if (mt.homeScore == null || mt.awayScore == null) continue;
    const set = [mt.homeTeam, mt.awayTeam];
    if (!set.includes(t1) || !set.includes(t2)) continue;
    const g1 = mt.homeTeam === t1 ? mt.homeScore : mt.awayScore;
    const g2 = mt.homeTeam === t2 ? mt.homeScore : mt.awayScore;
    if (g1 > g2) p1 += 3; else if (g2 > g1) p2 += 3; else { p1++; p2++; }
  }
  return p2 - p1; // mais pontos no confronto direto fica à frente
}

function isTeam(name) { return name && name !== 'A definir'; }
