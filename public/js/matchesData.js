// Carregador da lista de jogos — lê 1 ÚNICO documento (snapshots/matches) que o
// sincronizador mantém com os 104 jogos, em vez de varrer a coleção inteira
// (104 leituras) a cada abertura de tela. Economia grande no plano gratuito.
//
// Fallback: se o snapshot ainda não existir (antes do 1º sync que o gera), lê a
// coleção `matches` normalmente — para a tela nunca ficar vazia.
import { db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Devolve um array de jogos [{ id, homeTeam, ..., kickoffTime, status, ... }],
// ordenado por horário (o snapshot já é gravado ordenado).
export async function loadMatches() {
  try {
    const snap = await getDoc(doc(db, 'snapshots', 'matches'));
    if (snap.exists() && Array.isArray(snap.data().matches)) {
      return snap.data().matches;
    }
  } catch (e) {
    // ignora e cai no fallback (ex.: regra ainda não propagou após o deploy)
  }
  // fallback: coleção completa (só antes do 1º sync com snapshot, ou se ele falhar)
  const qs = await getDocs(query(collection(db, 'matches'), orderBy('kickoffTime')));
  const arr = [];
  qs.forEach(d => arr.push({ id: d.id, ...d.data() }));
  return arr;
}
