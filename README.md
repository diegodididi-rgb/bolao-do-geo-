# 🏆 BOLÃO DO GEO — Copa do Mundo 2026

App de bolão: cada pessoa cria login/senha, palpita o **placar** dos jogos e a pontuação
aparece num **ranking**. Os jogos e resultados entram **automaticamente** pela API
football-data.org. Tudo em serviços **gratuitos**.

- **Pontuação:** acertou o resultado (vitória/empate/derrota) = **1 ponto**.
- **Desempate:** quem tiver mais **placares cravados** (acertou o placar exato) fica à frente.
- **Endereço final:** `https://bolaodogeo.web.app`

---

## Como funciona (arquitetura)

```
 Navegador (site estático)         GitHub Action (a cada 10 min)
 ┌───────────────────────┐         ┌──────────────────────────┐
 │ login / palpites /     │         │ sync.js                  │
 │ ranking                │         │  football-data.org  ───►  │
 │   │ lê/escreve         │         │  Firestore (matches)     │
 └───┼───────────────────┘         └───────────┬──────────────┘
     ▼                                          ▼
            ☁️  Firebase  (Auth + Firestore + Hosting)
```

O site **só fala com o Firebase**. A API de futebol é consultada pelo sincronizador
(fora do navegador), porque o token não pode ficar exposto e a API bloqueia chamadas
do navegador (CORS).

---

## Pré-requisitos
- Conta Google (para o Firebase) — grátis.
- Conta no GitHub — grátis.
- [Node.js 18+](https://nodejs.org) instalado (para o Firebase CLI e testes locais).
- Token da [football-data.org](https://www.football-data.org/client/register) (grátis).
  > ⚠️ O token enviado no chat foi exposto — **gere um novo** e use o novo.

---

## Passo a passo

### 1) Criar o projeto no Firebase
1. Acesse <https://console.firebase.google.com> → **Adicionar projeto** → nome `bolaodogeo`
   (o ID precisa ser único; se `bolaodogeo` estiver livre, ótimo — senão escolha outro e
   ajuste `.firebaserc` e `firebase-config.js`).
2. Menu **Criação → Authentication → Começar → Método de login → E-mail/senha → Ativar**.
3. Menu **Criação → Firestore Database → Criar banco → modo de produção** → região
   `southamerica-east1` (São Paulo).

### 2) Pegar a config do app web
1. Engrenagem (⚙️) → **Configurações do projeto** → seção **Seus apps** → ícone **Web `</>`**
   → registre o app (apelido: `bolao`).
2. Copie o objeto `firebaseConfig` e **cole em** [`public/js/firebase-config.js`](public/js/firebase-config.js),
   substituindo os `COLE_AQUI`.

### 3) Publicar o site e as regras
```bash
npm install -g firebase-tools
firebase login
cd bolao-do-geo
firebase deploy        # publica hosting + regras do Firestore
```
Saída esperada: `Hosting URL: https://bolaodogeo.web.app`.

### 4) Gerar a chave de service account (para o sincronizador)
1. Engrenagem (⚙️) → **Configurações do projeto → Contas de serviço → Gerar nova chave privada**.
2. Baixa um arquivo `.json`. **NÃO** coloque esse arquivo no repositório.

### 5) Subir para o GitHub e configurar os secrets
1. Crie um repositório **público** no GitHub (público = GitHub Actions ilimitado e grátis).
2. Faça push deste projeto.
3. No repositório: **Settings → Secrets and variables → Actions → New repository secret**, crie:
   - `FOOTBALL_DATA_TOKEN` → seu token novo da football-data.
   - `FIREBASE_SERVICE_ACCOUNT` → cole **todo o conteúdo** do `.json` da etapa 4.

### 6) Popular os jogos
- No GitHub: aba **Actions → "Sincronizar placares" → Run workflow**.
- Em ~30s a coleção `matches` é preenchida com os 104 jogos. Daí em diante roda sozinho
  a cada 10 min (placares atualizam automaticamente).

### 7) Virar admin
1. Cadastre-se no site (com seu e-mail).
2. No **Console → Firestore → coleção `users` → seu documento** → adicione/edite o campo
   `isAdmin` = `true` (booleano). Recarregue o site: a aba **Admin** aparece.

Pronto! Compartilhe `https://bolaodogeo.web.app` com a galera. 🎉

---

## Testar localmente (opcional, antes do deploy)
```bash
cd bolao-do-geo
firebase emulators:start        # ou: npx serve public
```
Precisa ter colado a config real em `firebase-config.js`.

## Custos
Tudo dentro do plano gratuito: Firebase **Spark** (Hosting + Auth + Firestore),
football-data **free** (10 req/min — usamos 1 por sync), GitHub Actions (grátis em repo público).

## Segurança
- A `firebaseConfig` (apiKey etc.) é **pública** por design — pode versionar.
- O que **nunca** pode vazar: o **token da football-data** e o **JSON da service account**.
  Eles vivem só nos GitHub Secrets (ver `.gitignore`).
- As regras em [`firestore.rules`](firestore.rules) impedem: editar palpite depois do apito,
  palpitar pelos outros, e se auto-promover a admin.

## Estrutura
```
public/            site (Firebase Hosting)
  index.html · css/styles.css · js/*.js
firestore.rules    regras de segurança
firebase.json      config do Hosting/Firestore
sync/sync.js       sincronizador football-data -> Firestore
.github/workflows/sync.yml   agendamento (cron 10 min)
```
