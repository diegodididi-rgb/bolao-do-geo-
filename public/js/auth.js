// Login, cadastro e logout (Firebase Authentication, e-mail + senha)
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function initAuthForms() {
  const loginForm  = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const toSignup   = document.getElementById('toSignup');
  const toLogin    = document.getElementById('toLogin');
  const errBox     = document.getElementById('authError');

  toSignup.addEventListener('click', (e) => { e.preventDefault(); show('signup'); });
  toLogin.addEventListener('click',  (e) => { e.preventDefault(); show('login'); });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErr();
    try {
      await signInWithEmailAndPassword(auth, loginForm.email.value.trim(), loginForm.password.value);
    } catch (err) { showErr(traduzErro(err)); }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErr();
    const name = signupForm.displayName.value.trim();
    if (name.length < 2) { showErr('Digite seu nome.'); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, signupForm.email.value.trim(), signupForm.password.value);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, 'users', cred.user.uid), {
        displayName: name,
        email: signupForm.email.value.trim(),
        isAdmin: false,
        createdAt: serverTimestamp()
      });
    } catch (err) { showErr(traduzErro(err)); }
  });

  function show(which) {
    document.getElementById('loginBox').classList.toggle('hidden', which !== 'login');
    document.getElementById('signupBox').classList.toggle('hidden', which !== 'signup');
    clearErr();
  }
  function showErr(m) { errBox.textContent = m; errBox.classList.remove('hidden'); }
  function clearErr() { errBox.textContent = ''; errBox.classList.add('hidden'); }
}

export function logout() { return signOut(auth); }

function traduzErro(err) {
  const c = err.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'E-mail ou senha incorretos.';
  if (c.includes('email-already-in-use')) return 'Esse e-mail já está cadastrado.';
  if (c.includes('invalid-email'))        return 'E-mail inválido.';
  if (c.includes('weak-password'))        return 'A senha precisa ter ao menos 6 caracteres.';
  if (c.includes('network'))              return 'Sem conexão. Tente de novo.';
  return 'Erro: ' + (err.message || c);
}
