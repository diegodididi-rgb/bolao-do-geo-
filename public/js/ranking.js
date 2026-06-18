// Ranking — lê o ranking JÁ CALCULADO e salvo pelo sincronizador (1 documento:
// rankings/current), em vez de varrer todas as coleções a cada abertura. Isso
// derruba o consumo de leituras do Firestore (essencial no plano gratuito).
//
// O cálculo em si mora em scoring.js (função pura), usada pelo sync 4x/dia.
// Se o ranking ainda não foi salvo, mostramos um aviso — NÃO varremos as
// coleções no navegador (isso queimaria a cota de leitura a cada abertura).
import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderRanking(container, currentUid) {
  container.innerHTML = '<p class="loading">Carregando ranking…</p>';

  let snap;
  try {
    snap = await getDoc(doc(db, 'rankings', 'current'));
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro ao carregar o ranking: ${e.message}</p>`;
    return;
  }

  if (!snap.exists() || !Array.isArray(snap.data().rows)) {
    container.innerHTML = `<p class="empty">O ranking ainda não foi calculado.<br>
      Ele é atualizado automaticamente às <b>16h, 19h, 22h e 00h</b> (Brasília). Volte após o próximo horário.</p>`;
    return;
  }

  const d = snap.data();
  renderTable(container, d.rows, currentUid, toDate(d.updatedAt));
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
    : 'Recalcula automaticamente às 16h, 19h, 22h e 00h.';
  html += `<p class="hint">Pontos = acertos de resultado (grupos) + acertos de quem avançou no seu mata-mata. Desempate por nº de placares cravados (⭐).<br>${when}</p>`;
  container.innerHTML = html;
}

function toDate(t) { return t && t.toDate ? t.toDate() : (t ? new Date(t) : null); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
