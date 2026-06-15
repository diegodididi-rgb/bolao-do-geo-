// Palpites do mata-mata previsto (bracket do próprio usuário): carregar e salvar.
// Mesma lógica write-once dos palpites de grupo, mas numa coleção própria
// (chave = nº do jogo do chaveamento, 73-104).
import { db } from './firebase-config.js';
import {
  collection, query, where, getDocs, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Retorna Map: matchNum -> { home, away, winner }
export async function loadUserKoPredictions(uid) {
  const snap = await getDocs(query(collection(db, 'koPredictions'), where('uid', '==', uid)));
  const map = new Map();
  snap.forEach(d => {
    const x = d.data();
    map.set(x.matchNum, { home: x.homeScore, away: x.awayScore, winner: x.winner });
  });
  return map;
}

// winner: 'home' | 'away' — obrigatório quando o placar previsto é empate
// (define quem o usuário acha que avança nos pênaltis).
export async function saveKoPrediction(uid, matchNum, home, away, winner) {
  const id = `${uid}_${matchNum}`;
  await setDoc(doc(db, 'koPredictions', id), {
    uid, matchNum, homeScore: home, awayScore: away, winner, updatedAt: serverTimestamp()
  });
}
