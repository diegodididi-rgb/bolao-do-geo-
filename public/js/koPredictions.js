// Palpites do mata-mata previsto (bracket do próprio usuário): carregar e salvar.
// Mesma lógica write-once dos palpites de grupo, mas numa coleção própria
// (chave = nº do jogo do chaveamento, 73-104).
import { db } from './firebase-config.js';
import {
  collection, query, where, getDocs, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Retorna Map: matchNum -> { home, away, winner, thirdGroup? }
export async function loadUserKoPredictions(uid) {
  const snap = await getDocs(query(collection(db, 'koPredictions'), where('uid', '==', uid)));
  const map = new Map();
  snap.forEach(d => {
    const x = d.data();
    const v = { home: x.homeScore, away: x.awayScore, winner: x.winner };
    if (x.thirdGroup) v.thirdGroup = x.thirdGroup;
    map.set(x.matchNum, v);
  });
  return map;
}

// winner: 'home' | 'away' — obrigatório quando o placar previsto é empate
// (define quem o usuário acha que avança nos pênaltis).
// thirdGroup: letra do grupo do 3º colocado escolhido (só nos jogos de 16-avos
// que recebem um 3º colocado); para os demais jogos vem null/undefined.
export async function saveKoPrediction(uid, matchNum, home, away, winner, thirdGroup) {
  const id = `${uid}_${matchNum}`;
  const data = { uid, matchNum, homeScore: home, awayScore: away, winner, updatedAt: serverTimestamp() };
  if (thirdGroup) data.thirdGroup = thirdGroup;
  await setDoc(doc(db, 'koPredictions', id), data);
}
