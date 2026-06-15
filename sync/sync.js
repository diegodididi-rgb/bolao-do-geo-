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
try { serviceAccount = JSON.parse(SA); }
catch (e) { console.error('FIREBASE_SERVICE_ACCOUNT não é um JSON válido.'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function mapStatus(s) {
  if (s === 'FINISHED') return 'finished';
  if (s === 'IN_PLAY' || s === 'PAUSED') return 'in_play';
  return 'scheduled';
}

async function main() {
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': TOKEN }
  });
  if (!res.ok) {
    console.error('football-data', res.status, await res.text());
    process.exit(1);
  }
  const { matches } = await res.json();
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
    }
    batch.set(db.collection('matches').doc(id), data, { merge: true });
    ops++; total++;
    if (ops === 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops) await batch.commit();

  console.log(`OK: ${total} jogos gravados/atualizados | ${fixed.size} override(s) preservado(s).`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
