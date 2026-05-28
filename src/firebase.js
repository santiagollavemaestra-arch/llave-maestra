import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, update, remove, onValue, get } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FB, st } from './state.js';

const app = initializeApp(FB);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'us-central1');
export const agRef = (col, ...parts) => ref(db, 'agencias/' + st.agenciaId + '/' + col + (parts.length ? '/' + parts.join('/') : ''));
export { ref, push, update, remove, onValue, get, httpsCallable, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential };
