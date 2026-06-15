# Sincronizador — football-data.org → Firestore

Puxa os 104 jogos da Copa 2026 (1 requisição) e grava/atualiza a coleção `matches`.
Mantém placares, status e os confrontos do mata-mata atualizados automaticamente.

## Variáveis de ambiente
- `FOOTBALL_DATA_TOKEN` — token da football-data.org.
- `FIREBASE_SERVICE_ACCOUNT` — conteúdo (string JSON) da chave de service account do Firebase.

## Rodar localmente (Windows / PowerShell)
```powershell
cd sync
npm install
$env:FOOTBALL_DATA_TOKEN = "SEU_TOKEN"
$env:FIREBASE_SERVICE_ACCOUNT = Get-Content ..\serviceAccount.json -Raw
node sync.js
```

## Rodar localmente (bash)
```bash
cd sync
npm install
export FOOTBALL_DATA_TOKEN="SEU_TOKEN"
export FIREBASE_SERVICE_ACCOUNT="$(cat ../serviceAccount.json)"
node sync.js
```

## Em produção
Roda sozinho pela GitHub Action `.github/workflows/sync.yml` (cron a cada 10 min).
Os dois valores acima vêm dos **GitHub Secrets**.

## Observações
- Mapeamento de status: `FINISHED → finished`, `IN_PLAY`/`PAUSED → in_play`, resto → `scheduled`.
- O `id` do documento em `matches` é o `id` do jogo na football-data (estável).
- Jogos com `manualOverride: true` (corrigidos na tela de Admin) **não** têm o placar
  sobrescrito pelo sync.
