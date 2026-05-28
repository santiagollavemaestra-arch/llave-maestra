import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, update, remove, onValue, get } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { FB } from './state.js';

const app = initializeApp(FB);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const cRef = ref(db,'consultas');
export const pRef = ref(db,'propiedades');
export const prRef = ref(db,'propietarios');
export const vRef = ref(db,'visitas');
export const eRef = ref(db,'emails');
export { ref, push, update, remove, onValue, get, signInWithEmailAndPassword, signOut, onAuthStateChanged };
