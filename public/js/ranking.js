// Ranking — calcula a pontuação na hora (no navegador)
// Regra: +1 ponto por acertar o resultado (vitória/empate/derrota).
// Desempate: maior nº de placares exatos ("cravados").
import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderRanking(container, currentUid) {
  container.innerHTML = '<p class="loading">Calculando ranking…</p>';

  let usersSnap, matchesSnap, predsSnap;
  try {
    [usersSnap, matchesSnap, predsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'matches')),
      getDocs(collection(db, 'predictions')),
    ]);
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao montar o ranking: ${e.message}</p>`;
    return;
  }

  const users = new Map();
  usersSnap.forEach(d => users.set(d.id, { name: d.data().displayName || 'Sem nome', points: 0, exact: 0, played: 0 }));

  const finished = new Map();
  matchesSnap.forEach(d => {
    const m = d.data();
    if (m.status === 'finished' && m.homeScore != null && m.awayScore != null) finished.set(d.id, m);
  });

  predsSnap.forEach(d => {
    const p = d.data();
    const m = finished.get(p.matchId);
    const u = users.get(p.uid);
    if (!m || !u) return;
    u.played++;
    if (sign(p.homeScore - p.awayScore) === sign(m.homeScore - m.awayScore)) u.points++;
    if (p.homeScore === m.homeScore && p.awayScore === m.awayScore) u.exact++;
  });

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
    <p class="hint">Pontos = acertos de resultado. Desempate por nº de placares cravados (⭐).</p>`;
  container.innerHTML = html;
}

function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
