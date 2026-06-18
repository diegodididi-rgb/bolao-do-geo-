// ===================================================================
//  SINCRONIZADOR — football-data.org -> Firestore
//  Puxa os 104 jogos da Copa 2026 (1 requisição) e grava/atualiza
//  a coleção "matches". Roda na GitHub Action (a cada X min) ou local.
//
//  Variáveis de ambiente necessárias:
//   - FOOTBALL_DATA_TOKEN     -> token da football-data.org
//   - FIREBASE_SERVICE_ACCOUNT -> JSON da chave de service account (string)
// ===================================================================
import admin from 'firebase-admin';

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const SA    = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!TOKEN) { console.error('Falta FOOTBALL_DATA_TOKEN'); process.exit(1); }
if (!SA)    { console.error('Falta FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }

let serviceAccount;
try { serviceAccount = JSON.parse(SA.trim().replace(/^﻿/, '')); }
catch (e) { console.error('FIREBASE_SERVICE_ACCOUNT não é um JSON válido:', e.message); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function mapStatus(s) {
  if (s === 'FINISHED') return 'finished';
  if (s === 'IN_PLAY' || s === 'PAUSED') return 'in_play';
  return 'scheduled';
}

// quem avançou no confronto (importa no mata-mata, p/ empates decididos nos
// pênaltis): HOME_TEAM -> 'home', AWAY_TEAM -> 'away', resto -> null.
function mapWinner(w) {
  if (w === 'HOME_TEAM') return 'home';
  if (w === 'AWAY_TEAM') return 'away';
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Busca os jogos com algumas tentativas: a football-data.org às vezes derruba a
// conexão (UND_ERR_SOCKET "other side closed") ou responde 429/5xx. Em vez de
// falhar o sync inteiro na 1ª falha de rede, tenta de novo com espera crescente.
async function fetchMatches(attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
        headers: { 'X-Auth-Token': TOKEN },
        signal: AbortSignal.timeout(30000), // 30s por tentativa
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      if (!res.ok) { // 4xx (ex.: token inválido) -> não adianta repetir
        console.error('football-data', res.status, await res.text());
        process.exit(1);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      const cause = e.cause?.code || e.name || e.message;
      console.warn(`Tentativa ${i}/${attempts} falhou (${cause}).`);
      if (i < attempts) await sleep(2000 * i); // 2s, 4s, 6s…
    }
  }
  throw lastErr;
}

async function main() {
  const { matches } = await fetchMatches();
  console.log('Jogos recebidos da API:', matches.length);

  // jogos com correção manual fixada -> não sobrescrever placar/status
  const existing = await db.collection('matches').get();
  const fixed = new Set();
  existing.forEach(d => { if (d.get('manualOverride') === true) fixed.add(d.id); });

  let batch = db.batch(), ops = 0, total = 0;
  for (const m of matches) {
    const id = String(m.id);
    const data = {
      homeTeam:  m.homeTeam?.name ?? 'A definir',
      homeTla:   m.homeTeam?.tla  ?? null,
      homeCrest: m.homeTeam?.crest ?? null,
      awayTeam:  m.awayTeam?.name ?? 'A definir',
      awayTla:   m.awayTeam?.tla  ?? null,
      awayCrest: m.awayTeam?.crest ?? null,
      stage:     m.stage,
      group:     m.group ?? null,
      matchday:  m.matchday ?? null,
      kickoffTime: admin.firestore.Timestamp.fromDate(new Date(m.utcDate)),
      lastSync:  admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!fixed.has(id)) {
      data.status    = mapStatus(m.status);
      data.homeScore = m.score?.fullTime?.home ?? null;
      data.awayScore = m.score?.fullTime?.away ?? null;
      data.winner    = mapWinner(m.score?.winner); // 'home' | 'away' | null
    }
    batch.set(db.collection('matches').doc(id), data, { merge: true });
    ops++; total++;
    if (ops === 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops) await batch.commit();

  console.log(`OK: ${total} jogos gravados/atualizados | ${fixed.size} override(s) preservado(s).`);

  await recomputeRanking();
}

// Recalcula o ranking e salva num ÚNICO doc (rankings/current). Assim o app lê
// 1 documento por abertura, em vez de varrer todas as coleções (economia enorme
// de leituras no plano gratuito). Reusa o cálculo puro de scoring.js.
async function recomputeRanking() {
  try {
    const { computeRanking } = await import(new URL('../public/js/scoring.js', import.meta.url).href);
    const [usersSnap, matchesSnap, predsSnap, koSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('matches').get(),
      db.collection('predictions').get(),
      db.collection('koPredictions').get(),
    ]);
    const ms = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : null;
    const usersArr = [];   usersSnap.forEach(d => usersArr.push({ uid: d.id, displayName: d.get('displayName'), scoreFromMs: ms(d.get('scoreFrom')) }));
    const matchesArr = []; matchesSnap.forEach(d => { const x = d.data(); matchesArr.push({ id: d.id, ...x, kickoffMs: ms(x.kickoffTime) }); });
    const predsArr = [];   predsSnap.forEach(d => predsArr.push(d.data()));
    const koArr = [];      koSnap.forEach(d => koArr.push(d.data()));

    const rows = computeRanking(usersArr, matchesArr, predsArr, koArr);
    await db.collection('rankings').doc('current').set({
      rows,
      count: rows.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Ranking recalculado e salvo: ${rows.length} participante(s).`);
  } catch (e) {
    // não falha o sync inteiro só porque o ranking não pôde ser recalculado
    console.error('Aviso: não foi possível recalcular o ranking:', e.message);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
