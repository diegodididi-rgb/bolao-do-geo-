// Ranking — lê o ranking JÁ CALCULADO e salvo pelo sincronizador (1 documento:
// rankings/current), em vez de varrer todas as coleções a cada abertura. Isso
// derruba o consumo de leituras do Firestore (importante no plano gratuito).
//
// O cálculo em si mora em scoring.js (função pura), usada pelo sync 4x/dia.
// Fallback: se o ranking ainda não foi salvo (antes da 1ª atualização), calcula
// uma vez no navegador para não deixar a tela vazia.
import { db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { computeRanking } from './scoring.js';

export async function renderRanking(container, currentUid) {
  container.innerHTML = '<p class="loading">Carregando ranking…</p>';

  let snap;
  try {
    snap = await getDoc(doc(db, 'rankings', 'current'));
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao carregar o ranking: ${e.message}</p>`;
    return;
  }

  if (snap.exists() && Array.isArray(snap.data().rows)) {
    const d = snap.data();
    renderTable(container, d.rows, currentUid, toDate(d.updatedAt));
    return;
  }

  // ainda não há ranking salvo -> calcula uma vez (fallback)
  const rows = await computeLive(container);
  if (rows) renderTable(container, rows, currentUid, null);
}

// Fallback: varre as coleções e calcula na hora (só antes da 1ª atualização do sync).
async function computeLive(container) {
  try {
    const [usersSnap, matchesSnap, predsSnap, koSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'matches')),
      getDocs(collection(db, 'predictions')),
      getDocs(collection(db, 'koPredictions')),
    ]);
    const usersArr = []; usersSnap.forEach(d => usersArr.push({ uid: d.id, displayName: d.data().displayName }));
    const matchesArr = []; matchesSnap.forEach(d => matchesArr.push({ id: d.id, ...d.data() }));
    const predsArr = []; predsSnap.forEach(d => predsArr.push(d.data()));
    const koArr = []; koSnap.forEach(d => koArr.push(d.data()));
    return computeRanking(usersArr, matchesArr, predsArr, koArr);
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao montar o ranking: ${e.message}</p>`;
    return null;
  }
}

function renderTable(container, rows, currentUid, updatedAt) {
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
  html += '</tbody></table>';
  const when = updatedAt
    ? `Atualizado em ${updatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · recalcula automaticamente às 16h, 19h, 22h e 00h.`
    : 'Calculado agora (o ranking salvo aparece após a próxima atualização automática).';
  html += `<p class="hint">Pontos = acertos de resultado (grupos) + acertos de quem avançou no seu mata-mata. Desempate por nº de placares cravados (⭐).<br>${when}</p>`;
  container.innerHTML = html;
}

function toDate(t) { return t && t.toDate ? t.toDate() : (t ? new Date(t) : null); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
