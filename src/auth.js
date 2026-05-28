import { st, NOMBRES, COLORES, EMAILJS_SVC, EMAILJS_TPL, APP_URL } from './state.js';
import { db, auth, ref, get, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase.js';

export function initAuth(onLogin, onLogout) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const snap = await get(ref(db, 'usuarios/' + user.uid));
        const data = snap.val() || {};
        st.usuarioActivo = data.username || null;
        st.usuarioRol = data.rol || 'agente';
      } catch(e) {
        console.error('Error leyendo perfil:', e.message);
        st.usuarioActivo = null;
        st.usuarioRol = 'agente';
      }
      onLogin();
    } else {
      st.usuarioActivo = null;
      st.usuarioRol = null;
      onLogout();
    }
  });
}

window.loginSubmit = async () => {
  const email = (document.getElementById('login-email')?.value || '').trim();
  const pass = document.getElementById('login-pass')?.value || '';
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  if (!email || !pass) { if(err) err.textContent = 'Completá email y contraseña'; return; }
  if(btn) { btn.disabled = true; btn.textContent = 'Ingresando...'; }
  if(err) err.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e) {
    const msg = (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found')
      ? 'Email o contraseña incorrectos'
      : 'Error al ingresar. Intentá de nuevo.';
    if(err) err.textContent = msg;
    if(btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
};

window._cerrarSesion = async () => {
  if(!confirm('¿Cerrar sesión?')) return;
  await signOut(auth);
};

export function mostrarPerfil() {
  if(!st.usuarioActivo) return;
  const ph = document.getElementById('perfil-header');
  const pa = document.getElementById('perfil-avatar');
  const pn = document.getElementById('perfil-nombre');
  if(ph) ph.style.display = 'flex';
  if(pa) { pa.style.background = COLORES[st.usuarioActivo]; pa.textContent = NOMBRES[st.usuarioActivo]?.[0] || '?'; }
  if(pn) pn.textContent = NOMBRES[st.usuarioActivo] || st.usuarioActivo;
}

export function pedirNotif() {
  if('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

export function enviarNotifPush(t, b) {
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(t, { body: b, icon: '/llave-maestra/icon-192.png', tag: 'keynet', renotify: true });
}

export function enviarMail(asig, nombre, prop) {
  const em = st.emails[asig];
  if(!em) return;
  const intentar = (n) => {
    if(n <= 0) return;
    const e = window._emails?.[asig];
    if(!e) { setTimeout(() => intentar(n - 1), 500); return; }
    emailjs.send(EMAILJS_SVC, EMAILJS_TPL, {
      to_email: e, to_name: NOMBRES[asig] || asig,
      cliente: nombre || 'Sin nombre', propiedad: prop || 'Sin especificar', link: APP_URL
    }).catch(err => console.log('Mail:', err));
  };
  intentar(10);
}
