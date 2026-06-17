// Estrutura do mata-mata da Copa 2026 (16-avos até a final, jogos 73-104).
//
// Os 16-avos (73-88) são montados pelo PRÓPRIO usuário: ele escolhe os dois
// times de cada confronto numa lista (caixa de seleção) com as 48 seleções,
// reproduzindo o chaveamento que fez no papel. A escolha fica salva em
// koPreds[n].homeTeam / koPreds[n].awayTeam. As fases seguintes (89-104) saem
// em cascata, a partir de quem o usuário marca como vencedor de cada jogo.

// Lista dos jogos de 16-avos (apenas os números importam — os times vêm da
// escolha do usuário, não mais das classificações de grupo).
export const R32_FIXTURES = [
  { match: 73 }, { match: 74 }, { match: 75 }, { match: 76 },
  { match: 77 }, { match: 78 }, { match: 79 }, { match: 80 },
  { match: 81 }, { match: 82 }, { match: 83 }, { match: 84 },
  { match: 85 }, { match: 86 }, { match: 87 }, { match: 88 },
];

// Conjunto dos números de jogo dos 16-avos (para detectar a 1ª rodada).
export const R32_MATCHES = new Set(R32_FIXTURES.map(f => f.match));

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

// Monta o chaveamento COMPLETO previsto (jogos 73-104) a partir dos palpites de
// mata-mata do usuário (koPreds: Map matchNum -> { home, away, winner, homeTeam?,
// awayTeam? }). Nos 16-avos (73-88) os dois times são os que o usuário ESCOLHEU
// nas listas (homeTeam/awayTeam); das oitavas em diante (89-104), os times saem
// em cascata, a partir de quem o usuário marcou como vencedor de cada jogo.
// Devolve Map(matchNum -> { home, away }); slots ainda indefinidos vêm com null.
export function resolveFullBracket(koPreds) {
  const resolved = new Map();
  for (const fx of R32_FIXTURES) {
    const p = koPreds.get(fx.match);
    resolved.set(fx.match, { home: p?.homeTeam ?? null, away: p?.awayTeam ?? null });
  }
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
