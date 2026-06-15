// ===================================================================
//  CONFIG DO FIREBASE
//  ⚠️ COLE AQUI a config do SEU projeto:
//  Console do Firebase → Configurações do projeto (engrenagem) →
//  seção "Seus apps" → app Web → "Configuração do SDK" → copie o objeto.
//  Estes valores são PÚBLICOS por design (ficam no navegador) — tudo
//  bem expô-los. O que NÃO pode vazar é a chave de service account
//  (essa fica só no sincronizador / GitHub Secrets).
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCFm6RDTMQbsHdbhbccaw7H2R6HKnRDeas",
  authDomain: "bolaodogeo.firebaseapp.com",
  projectId: "bolaodogeo",
  storageBucket: "bolaodogeo.firebasestorage.app",
  messagingSenderId: "650651283267",
  appId: "1:650651283267:web:324dce1340d2d52d3089f6",
  measurementId: "G-YEY9779VK9"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
