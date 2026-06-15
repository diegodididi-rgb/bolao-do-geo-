// Controlador principal: sessão, navegação por abas e carregamento das telas
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initAuthForms, logout } from './auth.js';
import { renderMatches } from './matches.js';
import { renderReal } from './real.js';
import { renderRanking } from './ranking.js';
import { renderAdmin } from './admin.js';

let currentUser = null;
let isAdmin = false;

initAuthForms();

const authView    = document.getElementById('authView');
const nav         = document.getElementById('mainNav');
const userBox     = document.getElementById('userBox');
const userName    = document.getElementById('userName');
const adminTabBtn = document.getElementById('adminTabBtn');

const VIEWS = ['palpitesView', 'realView', 'rankingView', 'adminView'];

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
  setTab('palpites');
});

function setTab(tab) {
  if (tab === 'admin' && !isAdmin) tab = 'palpites';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  hideAllViews();
  if (tab === 'palpites') { const v = show('palpitesView'); renderMatches(v, currentUser); }
  if (tab === 'real')     { const v = show('realView');     renderReal(v); }
  if (tab === 'ranking')  { const v = show('rankingView');  renderRanking(v, currentUser.uid); }
  if (tab === 'admin')    { const v = show('adminView');    renderAdmin(v); }
}

function show(id) { const v = document.getElementById(id); v.classList.remove('hidden'); return v; }
function hideAllViews() { VIEWS.forEach(id => document.getElementById(id).classList.add('hidden')); }
