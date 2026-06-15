// Tela de Admin — override manual de placar (rede de segurança caso a API atrase/erre)
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, orderBy, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderAdmin(container) {
  container.innerHTML = '<p class="loading">Carregando…</p>';
  let matches;
  try {
    const snap = await getDocs(query(collection(db, 'matches'), orderBy('kickoffTime')));
    matches = []; snap.forEach(d => matches.push({ id: d.id, ...d.data() }));
  } catch (e) {
    container.innerHTML = `<p class="empty">Erro: ${e.message}</p>`;
    return;
  }
  if (!matches.length) {
    container.innerHTML = '<p class="empty">Sem jogos. Rode o sincronizador.</p>';
    return;
  }

  const wrap = document.createElement('div');
  const head = document.createElement('div');
  head.innerHTML = `<h2 class="stage-title">Admin — corrigir placar</h2>
    <p class="hint">Normalmente o placar entra sozinho pela API. Use isto só se ela atrasar/errar.
    Marque <b>fixar</b> para impedir que o sincronizador sobrescreva sua correção.</p>`;
  wrap.appendChild(head);

  matches.forEach(m => {
    const kickoff = m.kickoffTime && m.kickoffTime.toDate ? m.kickoffTime.toDate() : new Date(m.kickoffTime);
    const when = kickoff.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <span class="ar-when">${when}</span>
      <span class="ar-teams">${esc(m.homeTeam)} x ${esc(m.awayTeam)}</span>
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

  container.innerHTML = '';
  container.appendChild(wrap);
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
