import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, update, remove, onValue } from 'firebase/database';
import { FB } from './state.js';

const app = initializeApp(FB);
export const db = getDatabase(app);
export const cRef = ref(db,'consultas');
export const pRef = ref(db,'propiedades');
export const prRef = ref(db,'propietarios');
export const vRef = ref(db,'visitas');
export const eRef = ref(db,'emails');
export { ref, push, update, remove, onValue };
