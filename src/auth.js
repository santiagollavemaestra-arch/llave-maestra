import { st, NOMBRES, COLORES, EQUIPO, EMAILJS_SVC, EMAILJS_TPL, APP_URL } from './state.js';
import { db, ref, update } from './firebase.js';

let usuarioTemp = null;

export function mostrarPerfil(){
  if(!st.usuarioActivo) return;
  const ph=document.getElementById('perfil-header');
  const pa=document.getElementById('perfil-avatar');
  const pn=document.getElementById('perfil-nombre');
  if(ph) ph.style.display='flex';
  if(pa){pa.style.background=COLORES[st.usuarioActivo];pa.textContent=NOMBRES[st.usuarioActivo][0];}
  if(pn) pn.textContent=NOMBRES[st.usuarioActivo];
}

export function entrarComoUsuario(u){
  st.usuarioActivo=u;
  localStorage.setItem('lm_u',u);
  document.getElementById('user-screen').classList.add('oculto');
  document.getElementById('cambiar-wrap').classList.add('visible');
  mostrarPerfil();
  pedirNotif();
}

window.selUsuarioTemp = (u) => {
  usuarioTemp=u;
  if(st.emails[u]){entrarComoUsuario(u);return;}
  document.getElementById('paso-elegir').style.display='none';
  document.getElementById('paso-email').classList.add('visible');
  document.getElementById('email-titulo').textContent='Hola '+NOMBRES[u]+' 👋';
  document.getElementById('email-input').value='';
};

window.confirmarEmail = () => {
  const em=document.getElementById('email-input').value.trim();
  if(!em||!em.includes('@')){alert('Email inválido');return;}
  update(ref(db,'emails'),{[usuarioTemp]:em});
  entrarComoUsuario(usuarioTemp);
};

window.saltarEmail = () => entrarComoUsuario(usuarioTemp);

window.elegirSantiago = () => {
  const p=prompt('Ingresá tu contraseña:');
  if(!p) return;
  if(p!=='2858'){alert('Contraseña incorrecta.');return;}
  usuarioTemp='santiago';
  if(st.emails['santiago']){entrarComoUsuario('santiago');return;}
  document.getElementById('paso-elegir').style.display='none';
  document.getElementById('paso-email').classList.add('visible');
  document.getElementById('email-titulo').textContent='Hola Santiago 👋';
  document.getElementById('email-input').value='';
};

window._cambiarUsuario = () => {
  localStorage.removeItem('lm_u');
  st.usuarioActivo=null;
  document.getElementById('user-screen').classList.remove('oculto');
  document.getElementById('cambiar-wrap').classList.remove('visible');
  document.getElementById('paso-elegir').style.display='flex';
  document.getElementById('paso-email').classList.remove('visible');
  const ph=document.getElementById('perfil-header');if(ph) ph.style.display='none';
};

window._editarEmail = () => {
  const nuevo=prompt('Nuevo email:',st.emails[st.usuarioActivo]||'');
  if(!nuevo||!nuevo.includes('@')){if(nuevo!==null)alert('Email inválido');return;}
  update(ref(db,'emails'),{[st.usuarioActivo]:nuevo.trim()});
  alert('✅ Email actualizado');
};

if(st.usuarioActivo){
  document.getElementById('user-screen').classList.add('oculto');
  document.getElementById('cambiar-wrap').classList.add('visible');
  setTimeout(mostrarPerfil,100);
  pedirNotif();
}

export function pedirNotif(){
  if('Notification'in window && Notification.permission==='default') Notification.requestPermission();
}
export function enviarNotifPush(t,b){
  if(!('Notification'in window)||Notification.permission!=='granted') return;
  new Notification(t,{body:b,icon:'/llave-maestra/icon-192.png',tag:'keynet',renotify:true});
}
export function enviarMail(asig,nombre,prop){
  const em=st.emails[asig];
  if(!em) return;
  const intentar=(n)=>{
    if(n<=0) return;
    const e=window._emails?.[asig];
    if(!e){setTimeout(()=>intentar(n-1),500);return;}
    emailjs.send(EMAILJS_SVC,EMAILJS_TPL,{to_email:e,to_name:NOMBRES[asig]||asig,cliente:nombre||'Sin nombre',propiedad:prop||'Sin especificar',link:APP_URL}).catch(err=>console.log('Mail:',err));
  };
  intentar(10);
}
