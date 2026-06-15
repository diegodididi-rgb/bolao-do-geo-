// Estrutura oficial do mata-mata da Copa 2026 (16-avos até a final, jogos 73-104).
// Usada tanto para montar o chaveamento PREVISTO (a partir dos palpites de grupo)
// quanto, no futuro, para o chaveamento REAL.
//
// Notação dos códigos de "slot": '1A' = 1º do Grupo A, '2B' = 2º do Grupo B,
// '3:74' = melhor 3º colocado encaixado no jogo 74 (ver THIRD_SLOTS).
import { THIRD_PLACE_TABLE } from './thirdPlaceTable.js';

// 16-avos de final (jogos 73-88)
export const R32_FIXTURES = [
  { match: 73, home: '2A',  away: '2B' },
  { match: 74, home: '1E',  away: '3:74' },
  { match: 75, home: '1F',  away: '2C' },
  { match: 76, home: '1C',  away: '2F' },
  { match: 77, home: '1I',  away: '3:77' },
  { match: 78, home: '2E',  away: '2I' },
  { match: 79, home: '1A',  away: '3:79' },
  { match: 80, home: '1L',  away: '3:80' },
  { match: 81, home: '1D',  away: '3:81' },
  { match: 82, home: '1G',  away: '3:82' },
  { match: 83, home: '2K',  away: '2L' },
  { match: 84, home: '1H',  away: '2J' },
  { match: 85, home: '1B',  away: '3:85' },
  { match: 86, home: '1J',  away: '2H' },
  { match: 87, home: '1K',  away: '3:87' },
  { match: 88, home: '2D',  away: '2G' },
];

// Para cada jogo de 16-avos que recebe um "melhor 3º colocado", o conjunto de
// grupos dos quais aquele 3º pode vir (regra oficial FIFA, Anexo C).
export const THIRD_SLOTS = {
  74: ['A', 'B', 'C', 'D', 'F'],
  77: ['C', 'D', 'F', 'G', 'H'],
  79: ['C', 'E', 'F', 'H', 'I'],
  80: ['E', 'H', 'I', 'J', 'K'],
  81: ['B', 'E', 'F', 'I', 'J'],
  82: ['A', 'E', 'H', 'I', 'J'],
  85: ['E', 'F', 'G', 'I', 'J'],
  87: ['D', 'E', 'I', 'J', 'L'],
};

// Oitavas (89-96), quartas (97-100), semis (101-102), 3º lugar (103) e final (104).
// home/away referenciam o vencedor (w) ou perdedor (l) de outro jogo do chaveamento.
export const KO_TREE = [
  { match: 89,  round: 'R16',   home: { w: 74 }, away: { w: 77 } },
  { match: 90,  round: 'R16',   home: { w: 73 }, away: { w: 75 } },
  { match: 91,  round: 'R16',   home: { w: 76 }, away: { w: 78 } },
  { match: 92,  round: 'R16',   home: { w: 79 }, away: { w: 80 } },
  { match: 93,  round: 'R16',   home: { w: 83 }, away: { w: 84 } },
  { match: 94,  round: 'R16',   home: { w: 81 }, away: { w: 82 } },
  { match: 95,  round: 'R16',   home: { w: 86 }, away: { w: 88 } },
  { match: 96,  round: 'R16',   home: { w: 85 }, away: { w: 87 } },
  { match: 97,  round: 'QF',    home: { w: 89 }, away: { w: 90 } },
  { match: 98,  round: 'QF',    home: { w: 93 }, away: { w: 94 } },
  { match: 99,  round: 'QF',    home: { w: 91 }, away: { w: 92 } },
  { match: 100, round: 'QF',    home: { w: 95 }, away: { w: 96 } },
  { match: 101, round: 'SF',    home: { w: 97 }, away: { w: 98 } },
  { match: 102, round: 'SF',    home: { w: 99 }, away: { w: 100 } },
  { match: 103, round: '3RD',   home: { l: 101 }, away: { l: 102 } },
  { match: 104, round: 'FINAL', home: { w: 101 }, away: { w: 102 } },
];

export const ROUND_LABELS = {
  R32: '16-avos de final',
  R16: 'Oitavas de final',
  QF: 'Quartas de final',
  SF: 'Semifinais',
  '3RD': 'Disputa de 3º lugar',
  FINAL: 'Final',
};

// Mapa nº do jogo (73-104) -> stage da football-data (p/ casar com a Copa real).
const ROUND_TO_STAGE = {
  R32: 'LAST_32', R16: 'LAST_16', QF: 'QUARTER_FINALS',
  SF: 'SEMI_FINALS', '3RD': 'THIRD_PLACE', FINAL: 'FINAL',
};
export const MATCH_STAGE = (() => {
  const m = {};
  for (const fx of R32_FIXTURES) m[fx.match] = 'LAST_32';
  for (const node of KO_TREE) m[node.match] = ROUND_TO_STAGE[node.round];
  return m;
})();

// Dadas as classificações de grupo (Map de standings.js) e a lista ordenada dos
// melhores 3ºs colocados (rankThirdPlaced), monta o encaixe dos 16-avos:
// devolve Map(matchNum -> { home: nomeDoTime|null, away: nomeDoTime|null }).
export function resolveR32(standings, thirds) {
  const firsts = new Map(), seconds = new Map(), thirdTeam = new Map();
  for (const [g, rows] of standings) {
    const key = gKey(g); // normaliza 'GROUP_A' -> 'A'
    if (rows[0]) firsts.set(key, rows[0].team);
    if (rows[1]) seconds.set(key, rows[1].team);
    if (rows[2]) thirdTeam.set(key, rows[2].team);
  }

  const qualified = thirds.slice(0, 8).map(t => gKey(t.group));
  const slotAssign = lookupThirdSlots(qualified); // matchNum -> grupo (tabela oficial FIFA)

  const resolved = new Map();
  for (const fx of R32_FIXTURES) {
    resolved.set(fx.match, {
      home: resolveCode(fx.home, firsts, seconds, thirdTeam, slotAssign),
      away: resolveCode(fx.away, firsts, seconds, thirdTeam, slotAssign),
    });
  }
  return resolved;
}

// normaliza a chave do grupo: 'GROUP_A' -> 'A' (e mantém 'A' como 'A')
function gKey(g) { return String(g).replace('GROUP_', ''); }

function resolveCode(code, firsts, seconds, thirdTeam, slotAssign) {
  if (code.startsWith('3:')) {
    const g = slotAssign[Number(code.slice(2))];
    return g ? (thirdTeam.get(g) || null) : null;
  }
  const pos = code[0], g = code[1];
  if (pos === '1') return firsts.get(g) || null;
  if (pos === '2') return seconds.get(g) || null;
  return null;
}

// Encaixa os 8 grupos qualificados (3ºs colocados) nos 8 slots usando a TABELA
// OFICIAL da FIFA (Anexo C, ver thirdPlaceTable.js) — mesma do simulador do GE.
// Devolve { nº do jogo : letra do grupo }. Se faltar combinação (ex.: <8 grupos),
// devolve {} (os slots ficam indefinidos).
function lookupThirdSlots(qualifiedGroups) {
  const key = [...new Set(qualifiedGroups)].sort().join('');
  const row = THIRD_PLACE_TABLE[key];
  if (!row) return {};
  const out = {};
  for (const m in row) out[Number(m)] = row[m];
  return out;
}

// Monta o chaveamento COMPLETO previsto (jogos 73-104) a partir das classificações
// de grupo previstas + dos palpites de mata-mata do usuário (koPreds: Map matchNum
// -> { home, away, winner }). Devolve Map(matchNum -> { home, away }) com os nomes
// dos times; slots ainda indefinidos vêm com null. Usado tanto na tela de Palpites
// quanto no cálculo do Ranking.
export function resolveFullBracket(standings, thirds, koPreds) {
  const resolved = resolveR32(standings, thirds);
  for (const node of KO_TREE) {
    resolved.set(node.match, {
      home: resolveRef(node.home, resolved, koPreds),
      away: resolveRef(node.away, resolved, koPreds),
    });
  }
  return resolved;
}

// Resolve o nome do time vencedor/perdedor de outro jogo do chaveamento, a partir
// do palpite (write-once) que o usuário salvou para aquele jogo.
function resolveRef(ref, resolved, koPreds) {
  const refMatch = ref.w ?? ref.l;
  const teams = resolved.get(refMatch);
  const pred = koPreds.get(refMatch);
  if (!teams || !pred || !teams.home || !teams.away) return null;
  const winnerSide = pred.winner === 'home' ? 'home' : 'away';
  const side = ref.l ? (winnerSide === 'home' ? 'away' : 'home') : winnerSide;
  return teams[side];
}
