// Palpites do mata-mata previsto (bracket do próprio usuário): carregar e salvar.
// Mesma lógica write-once dos palpites de grupo, mas numa coleção própria
// (chave = nº do jogo do chaveamento, 73-104).
import { db } from './firebase-config.js';
import {
  collection, query, where, getDocs, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Retorna Map: matchNum -> { home, away, winner, homeTeam?, awayTeam? }
// home/away = placar previsto; homeTeam/awayTeam = nomes dos times escolhidos
// nas listas (só nos 16-avos, 73-88).
export async function loadUserKoPredictions(uid) {
  const snap = await getDocs(query(collection(db, 'koPredictions'), where('uid', '==', uid)));
  const map = new Map();
  snap.forEach(d => {
    const x = d.data();
    const v = { home: x.homeScore, away: x.awayScore, winner: x.winner };
    if (x.homeTeam) v.homeTeam = x.homeTeam;
    if (x.awayTeam) v.awayTeam = x.awayTeam;
    map.set(x.matchNum, v);
  });
  return map;
}

// winner: 'home' | 'away' — obrigatório quando o placar previsto é empate
// (define quem o usuário acha que avança nos pênaltis).
// teams: { homeTeam, awayTeam } — os times escolhidos nas listas; obrigatório
// nos jogos de 16-avos (73-88) e omitido nas fases seguintes (saem em cascata).
export async function saveKoPrediction(uid, matchNum, home, away, winner, teams) {
  const id = `${uid}_${matchNum}`;
  const data = { uid, matchNum, homeScore: home, awayScore: away, winner, updatedAt: serverTimestamp() };
  if (teams && teams.homeTeam) data.homeTeam = teams.homeTeam;
  if (teams && teams.awayTeam) data.awayTeam = teams.awayTeam;
  await setDoc(doc(db, 'koPredictions', id), data);
}
