// Aba "Copa do Mundo" — a REALIDADE: classificações reais dos grupos + jogos e
// chaveamento reais (preenchidos pela API). Somente leitura.
import { computeGroupStandings } from './standings.js';
import { translateTeam } from './teams.js';
import { loadMatches } from './matchesData.js';

const STAGE_LABELS = {
  LAST_32: '16-avos de final',
  LAST_16: 'Oitavas de final',
  QUARTER_FINALS: 'Quartas de final',
  SEMI_FINALS: 'Semifinais',
  THIRD_PLACE: 'Disputa de 3º lugar',
  FINAL: 'Final'
};
const KO_ORDER = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'];

export async function renderReal(container) {
  container.innerHTML = '<p class="loading">Carregando a Copa…</p>';
  let matches;
  try {
    matches = await loadMatches();
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao carregar: ${e.message}</p>`;
    return;
  }
  if (!matches.length) { container.innerHTML = '<p class="empty">Jogos ainda não carregados.</p>'; return; }

  const groupMatches = matches.filter(m => m.stage === 'GROUP_STAGE');
  const standings = computeGroupStandings(groupMatches);

  container.innerHTML = '';
  const intro = document.createElement('p');
  intro.className = 'hint top-note';
  intro.innerHTML = '🌎 Esta é a <b>Copa real</b>: classificações e chaveamento conforme acontecem de verdade. Compare com a aba <b>Palpites</b> (a sua simulação).';
  container.appendChild(intro);

  // ----- Classificação dos grupos -----
  const gSec = document.createElement('section');
  gSec.className = 'stage';
  gSec.innerHTML = '<h2 class="stage-title">Classificação dos grupos</h2>';
  const grid = document.createElement('div');
  grid.className = 'groups-grid';
  [...standings.keys()].sort().forEach(g => grid.appendChild(groupTable(g, standings.get(g))));
  gSec.appendChild(grid);
  container.appendChild(gSec);

  // ----- Mata-mata real -----
  const koByStage = new Map();
  for (const m of matches) {
    if (m.stage === 'GROUP_STAGE') continue;
    if (!koByStage.has(m.stage)) koByStage.set(m.stage, []);
    koByStage.get(m.stage).push(m);
  }
  for (const stage of KO_ORDER) {
    const list = koByStage.get(stage);
    if (!list) continue;
    const sec = document.createElement('section');
    sec.className = 'stage';
    sec.innerHTML = `<h2 class="stage-title">${STAGE_LABELS[stage] || stage}</h2>`;
    list.forEach(m => sec.appendChild(koRow(m)));
    container.appendChild(sec);
  }
}

function groupTable(g, rows) {
  const box = document.createElement('div');
  box.className = 'group-box';
  let html = `<h3>${g.replace('GROUP_', 'Grupo ')}</h3>
    <table class="standings"><thead><tr><th></th><th>Time</th><th>P</th><th>SG</th><th>Pts</th></tr></thead><tbody>`;
  rows.forEach((r, i) => {
    const cls = i < 2 ? 'q1' : (i === 2 ? 'q3' : '');
    html += `<tr class="${cls}"><td>${i + 1}</td><td>${esc(translateTeam(r.team))}</td><td>${r.P}</td><td>${r.GD > 0 ? '+' + r.GD : r.GD}</td><td class="pts">${r.Pts}</td></tr>`;
  });
  html += '</tbody></table>';
  box.innerHTML = html;
  return box;
}

function koRow(m) {
  const finished = m.status === 'finished' && m.homeScore != null && m.awayScore != null;
  const kickoff = m.kickoffTime && m.kickoffTime.toDate ? m.kickoffTime.toDate() : new Date(m.kickoffTime);
  const when = kickoff.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'match';
  div.innerHTML = `
    <div class="match-meta"><span>${when} (Brasília)</span>${finished ? '<span>encerrado</span>' : ''}</div>
    <div class="match-row">
      <div class="team home"><span>${esc(translateTeam(m.homeTeam))}</span>${crest(m.homeCrest)}</div>
      <div class="scores"><span class="ko-score">${finished ? m.homeScore : '–'}</span><span class="x">x</span><span class="ko-score">${finished ? m.awayScore : '–'}</span></div>
      <div class="team away">${crest(m.awayCrest)}<span>${esc(translateTeam(m.awayTeam))}</span></div>
    </div>`;
  return div;
}

function crest(url) { return url ? `<img class="crest" src="${url}" alt="" loading="lazy" />` : `<span class="crest ph"></span>`; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
