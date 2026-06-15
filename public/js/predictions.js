// Palpites do usuário: carregar e salvar
import { db } from './firebase-config.js';
import {
  collection, query, where, getDocs, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Retorna Map: matchId -> { home, away }
export async function loadUserPredictions(uid) {
  const snap = await getDocs(query(collection(db, 'predictions'), where('uid', '==', uid)));
  const map = new Map();
  snap.forEach(d => {
    const x = d.data();
    map.set(x.matchId, { home: x.homeScore, away: x.awayScore });
  });
  return map;
}

// Cria/atualiza o palpite. As regras do Firestore bloqueiam após o apito.
export async function savePrediction(uid, matchId, home, away) {
  const id = `${uid}_${matchId}`;
  await setDoc(doc(db, 'predictions', id), {
    uid, matchId, homeScore: home, awayScore: away, updatedAt: serverTimestamp()
  });
}
