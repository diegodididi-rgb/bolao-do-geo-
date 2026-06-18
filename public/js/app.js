// Controlador principal: sessão, navegação por abas e carregamento das telas
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initAuthForms, logout } from './auth.js';
import { renderGroups, renderKnockout } from './matches.js';
import { renderReal } from './real.js';
import { renderRanking } from './ranking.js';
import { renderAdmin } from './admin.js';

// Interruptor da aba Ranking. Coloque false para escondê-la temporariamente
// (ex.: enquanto o ranking ainda não foi recalculado). Volte para true + deploy
// para reativar.
const RANKING_ENABLED = false;

let currentUser = null;
let isAdmin = false;

initAuthForms();

const authView    = document.getElementById('authView');
const nav         = document.getElementById('mainNav');
const userBox     = document.getElementById('userBox');
const userName    = document.getElementById('userName');
const adminTabBtn   = document.getElementById('adminTabBtn');
const rankingTabBtn = document.getElementById('rankingTabBtn');

const VIEWS = ['gruposView', 'mataView', 'realView', 'rankingView', 'adminView'];

document.getElementById('logoutBtn').addEventListener('click', () => logout());
document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => setTab(btn.dataset.tab))
);

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    isAdmin = false;
    authView.classList.remove('hidden');
    nav.classList.add('hidden');
    userBox.classList.add('hidden');
    hideAllViews();
    return;
  }

  let prof = null;
  try {
    const s = await getDoc(doc(db, 'users', user.uid));
    prof = s.exists() ? s.data() : null;
  } catch (e) { /* segue com perfil nulo */ }

  isAdmin = !!(prof && prof.isAdmin);
  userName.textContent = (prof && prof.displayName) || user.email;
  authView.classList.add('hidden');
  nav.classList.remove('hidden');
  userBox.classList.remove('hidden');
  adminTabBtn.classList.toggle('hidden', !isAdmin);
  rankingTabBtn.classList.toggle('hidden', !RANKING_ENABLED);
  setTab('grupos');
});

function setTab(tab) {
  if (tab === 'admin' && !isAdmin) tab = 'grupos';
  if (tab === 'ranking' && !RANKING_ENABLED) tab = 'grupos';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  hideAllViews();
  if (tab === 'grupos')  { const v = show('gruposView');  renderGroups(v, currentUser); }
  if (tab === 'mata')    { const v = show('mataView');    renderKnockout(v, currentUser); }
  if (tab === 'real')    { const v = show('realView');    renderReal(v); }
  if (tab === 'ranking') { const v = show('rankingView'); renderRanking(v, currentUser.uid); }
  if (tab === 'admin')   { const v = show('adminView');   renderAdmin(v); }
}

function show(id) { const v = document.getElementById(id); v.classList.remove('hidden'); return v; }
function hideAllViews() { VIEWS.forEach(id => document.getElementById(id).classList.add('hidden')); }
