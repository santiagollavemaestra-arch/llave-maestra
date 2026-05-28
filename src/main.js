import './style.css';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, update, remove, onValue } from 'firebase/database';


const FB = {
  apiKey: ["AIzaSyB8C2knBhn","e-RWnPmCD7fxp7U_","qS7If7rY"].join(""),
  authDomain: "llave-maestra.firebaseapp.com",
  databaseURL: "https://llave-maestra-default-rtdb.firebaseio.com",
  projectId: "llave-maestra",
  storageBucket: "llave-maestra.firebasestorage.app",
  messagingSenderId: "519107930560",
  appId: "1:519107930560:web:f332a5d10114f69f34c025"
};

const GEMINI_KEY = ['AIzaSyC6PEMnA-5d','szajmDjKw42AnXNQ','RVwsASY'].join('');
const CLOUD = {name:'dgaixfvxa', preset:'keynet_props'};

async function geminiCall(prompt, opts){
  const cfg=Object.assign({maxOutputTokens:2000,temperature:0.7},opts||{});
  let lastErr;
  for(let i=0;i<3;i++){
    if(i>0){
      const wait=3000*i;
      console.log('Gemini 503, reintentando en '+wait/1000+'s...');
      await new Promise(r=>setTimeout(r,wait));
    }
    const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+GEMINI_KEY,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:cfg})
    });
    const data=await res.json();
    if(!data.error) return data;
    lastErr=new Error('['+data.error.code+'] '+data.error.message);
    if(data.error.code!==503) throw lastErr;
  }
  throw lastErr;
}
const EMAILJS_SVC = 'service_iorm3vh';
const EMAILJS_TPL = 'template_lqgp3ki';
const APP_URL = 'https://santiagollavemaestra-arch.github.io/llave-maestra/';

const app = initializeApp(FB);
const db = getDatabase(app);
const cRef = ref(db,'consultas');
const pRef = ref(db,'propiedades');
const prRef = ref(db,'propietarios');
const vRef = ref(db,'visitas');
const eRef = ref(db,'emails');

const EQUIPO = ['santiago','mariana','milagros','gabriel'];
const NOMBRES = {santiago:'Santiago',mariana:'Mariana',milagros:'Milagros',gabriel:'Gabriel'};
const COLORES = {santiago:'#e74c3c',mariana:'#3498db',milagros:'#9b59b6',gabriel:'#27ae60'};
const CHECKS = [
  {key:'c1',  label:'Contactado', short:'Cont.'},
  {key:'hbl', label:'Hablando',   short:'Hablando'},
  {key:'vis', label:'Visita',     short:'Visita'},
];
const DIAS = 3;

const AMENITY_INFO={'pileta':'🏊 Pileta','gimnasio':'💪 Gimnasio','quincho':'🍖 Quincho','laundry':'👕 Laundry','sum':'🎉 SUM','jardin':'🌿 Jardín','terraza':'🌅 Terraza','balcon':'🏙️ Balcón','seguridad':'🔒 Seguridad 24hs','vista-mar':'🌊 Vista al mar','amoblado':'🛋️ Amoblado','coworking':'💼 Coworking','apto-credito':'💳 Apto crédito','apto-mascotas':'🐾 Apto mascotas','apto-profesional':'👔 Apto profesional','jacuzzi':'🛁 Jacuzzi','baulera':'📦 Baulera','playroom':'🎮 Playroom','parrilla-propia':'🔥 Parrilla propia','jardin-privado':'🌳 Jardín privado'};
function _amLabel(a){return AMENITY_INFO[a]||('✓ '+a);}
let consultas={}, propiedades={}, propietarios={}, visitas={}, emails={};
let seccion='consultas', subTab='todas', filtroEstado='todos';
let usuarioActivo=localStorage.getItem('lm_u')||null, usuarioTemp=null;
let fotosSubidas=[], propDirCompleta='', propCiudad='';
let lbFotos=[], lbIdx=0;
let matchCache={};
let _alarmasExpanded=true;

// ============================================================
// FIREBASE LISTENERS
// ============================================================
onValue(eRef, s => { emails=s.val()||{}; window._emails=emails; });
onValue(prRef, s => { propietarios=s.val()||{}; actualizarSelPropietarios(); if(seccion==='propietarios') renderPropietarios(); });
onValue(pRef, s => { propiedades=s.val()||{}; matchCache={}; actualizarSelPropiedades(); if(seccion==='propiedades') renderPropiedades(); });
onValue(vRef, s => { visitas=s.val()||{}; if(seccion==='visitas') renderVisitas(); });

let primeraVez=true, consAnteriores={};
onValue(cRef, s => {
  const nuevas = s.val()||{};
  if(!primeraVez){
    Object.entries(nuevas).forEach(([id,c])=>{
      if(!consAnteriores[id]){
        enviarMail(c.asignado, c.nombre, c.propiedad);
        enviarNotifPush('📋 Nueva consulta', (c.nombre||'Sin nombre')+' — '+(c.propiedad||''));
      }
    });
  }
  consAnteriores={...nuevas};
  consultas=nuevas;
  primeraVez=false;
  render();
  document.getElementById('loading').classList.add('hidden');
});

// ============================================================
// USUARIO
// ============================================================
function mostrarPerfil(){
  if(!usuarioActivo) return;
  const ph=document.getElementById('perfil-header');
  const pa=document.getElementById('perfil-avatar');
  const pn=document.getElementById('perfil-nombre');
  if(ph) ph.style.display='flex';
  if(pa){pa.style.background=COLORES[usuarioActivo];pa.textContent=NOMBRES[usuarioActivo][0];}
  if(pn) pn.textContent=NOMBRES[usuarioActivo];
}

function entrarComoUsuario(u){
  usuarioActivo=u;
  localStorage.setItem('lm_u',u);
  document.getElementById('user-screen').classList.add('oculto');
  document.getElementById('cambiar-wrap').classList.add('visible');
  mostrarPerfil();
  pedirNotif();
}

window.selUsuarioTemp = (u) => {
  usuarioTemp=u;
  if(emails[u]){entrarComoUsuario(u);return;}
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
  if(emails['santiago']){entrarComoUsuario('santiago');return;}
  document.getElementById('paso-elegir').style.display='none';
  document.getElementById('paso-email').classList.add('visible');
  document.getElementById('email-titulo').textContent='Hola Santiago 👋';
  document.getElementById('email-input').value='';
};

window._cambiarUsuario = () => {
  localStorage.removeItem('lm_u');
  usuarioActivo=null;
  document.getElementById('user-screen').classList.remove('oculto');
  document.getElementById('cambiar-wrap').classList.remove('visible');
  document.getElementById('paso-elegir').style.display='flex';
  document.getElementById('paso-email').classList.remove('visible');
  const ph=document.getElementById('perfil-header');if(ph) ph.style.display='none';
};

window._editarEmail = () => {
  const nuevo=prompt('Nuevo email:',emails[usuarioActivo]||'');
  if(!nuevo||!nuevo.includes('@')){if(nuevo!==null)alert('Email inválido');return;}
  update(ref(db,'emails'),{[usuarioActivo]:nuevo.trim()});
  alert('✅ Email actualizado');
};

if(usuarioActivo){
  document.getElementById('user-screen').classList.add('oculto');
  document.getElementById('cambiar-wrap').classList.add('visible');
  setTimeout(mostrarPerfil,100);
  pedirNotif();
}

function pedirNotif(){
  if('Notification'in window && Notification.permission==='default') Notification.requestPermission();
}
function enviarNotifPush(t,b){
  if(!('Notification'in window)||Notification.permission!=='granted') return;
  new Notification(t,{body:b,icon:'/llave-maestra/icon-192.png',tag:'keynet',renotify:true});
}
function enviarMail(asig,nombre,prop){
  const em=emails[asig];
  if(!em) return;
  const intentar=(n)=>{
    if(n<=0) return;
    const e=window._emails?.[asig];
    if(!e){setTimeout(()=>intentar(n-1),500);return;}
    emailjs.send(EMAILJS_SVC,EMAILJS_TPL,{to_email:e,to_name:NOMBRES[asig]||asig,cliente:nombre||'Sin nombre',propiedad:prop||'Sin especificar',link:APP_URL}).catch(err=>console.log('Mail:',err));
  };
  intentar(10);
}

// ============================================================
// COUNTDOWN
// ============================================================
function diasDesde(ts){return ts?Math.floor((Date.now()-ts)/(864e5)):null;}
function ultimoCheck(c){
  if(!c.checkTs){
    return c.lastReset?Math.max(c.lastReset,c.fecha||0):c.fecha;
  }
  const v=Object.values(c.checkTs).filter(Boolean);
  const maxCheck=v.length?Math.max(...v):c.fecha;
  return c.lastReset?Math.max(maxCheck,c.lastReset):maxCheck;
}
function countdownInfo(c){
  if(['Cerrado','Sin interés','Reserva'].includes(c.estado)||c.checks?.res) return null;
  const d=diasDesde(ultimoCheck(c));
  if(d===null) return null;
  const r=DIAS-d;
  if(r>DIAS) return null;
  if(r>2) return {tipo:'ok',txt:'Seguimiento en '+r+' días'};
  if(r>0) return {tipo:'warn',txt:'⚠️ Contactar en '+r+(r>1?' días':' día')};
  if(r===0) return {tipo:'warn',txt:'⚠️ Contactar hoy'};
  return {tipo:'vencida',txt:'🔴 Vencido hace '+Math.abs(r)+(Math.abs(r)>1?' días':' día')};
}

// ============================================================
// ROTACION
// ============================================================
function sigRotacion(){
  const cnt={};
  EQUIPO.forEach(m=>cnt[m]=0);
  Object.values(consultas).filter(c=>!['Cerrado','Sin interés'].includes(c.estado)).forEach(c=>{if(c.asignado)cnt[c.asignado]++;});
  return EQUIPO.reduce((a,b)=>cnt[a]<=cnt[b]?a:b);
}

// ============================================================
// RENDER
// ============================================================
function render(){
  renderRotacion(); renderStats(); renderCounts(); renderAlarmas(); renderVisitasHoy();
  if(seccion==='consultas') renderLista();
}

function renderVisitasHoy(){
  const hoy=new Date().toISOString().split('T')[0];
  const visitasHoy=Object.values(visitas).filter(v=>v.fecha===hoy);
  const el=document.getElementById('alarmas');
  if(!el||!visitasHoy.length) return;
  const banner='<div style="background:var(--blue-light);border:1.5px solid var(--blue);border-radius:var(--radius-sm);padding:12px;margin-bottom:10px">'+
    '<div style="font-size:12px;font-weight:700;color:var(--blue);margin-bottom:6px">📅 Visitas de hoy ('+visitasHoy.length+')</div>'+
    visitasHoy.map(v=>{
      const prop=v.propiedadId&&propiedades[v.propiedadId]?propiedades[v.propiedadId]:null;
      const cons=v.consultaId&&consultas[v.consultaId]?consultas[v.consultaId]:null;
      return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:4px 0;border-top:1px solid rgba(26,74,138,.15)">'+
        '<span><b>'+v.hora+'hs</b> — '+(prop?.titulo||prop?.direccion||v.propiedadTitulo||'Sin propiedad')+'</span>'+
        '<span style="color:var(--blue);font-size:12px">'+(cons?.nombre||v.clienteNombre||'Sin cliente')+'</span>'+
      '</div>';
    }).join('')+
  '</div>';
  el.innerHTML=banner+el.innerHTML;
}

function renderRotacion(){
  const sig=sigRotacion();
  const cnt={};
  EQUIPO.forEach(m=>cnt[m]=Object.values(consultas).filter(c=>c.asignado===m).length);
  document.getElementById('rot-list').innerHTML=EQUIPO.map(m=>`
    <div class="rot-item">
      <div class="rot-av" style="background:${COLORES[m]}">${NOMBRES[m][0]}</div>
      <div class="rot-name">${NOMBRES[m]}</div>
      <div class="rot-cnt" style="color:${COLORES[m]}">${cnt[m]}</div>
      ${m===sig?'<div class="rot-sig">SIGUIENTE</div>':''}
    </div>`).join('');
}

function renderStats(){
  const arr=Object.values(consultas);
  const act=arr.filter(c=>!['Cerrado','Sin interés'].includes(c.estado));
  const conVisita=arr.filter(c=>c.checks?.vis);
  const venc=arr.filter(c=>{const i=countdownInfo(c);return i&&i.tipo==='vencida';});
  const now=new Date();
  const cerradasMes=arr.filter(c=>{
    if(c.estado!=='Cerrado') return false;
    const f=new Date(c.fecha||0);
    return f.getMonth()===now.getMonth()&&f.getFullYear()===now.getFullYear();
  });
  document.getElementById('stats-bar').innerHTML=
    '<div class="stat-card"><div class="stat-num">'+act.length+'</div><div class="stat-name">Activas</div></div>'+
    '<div class="stat-card"><div class="stat-num" style="color:var(--green)">'+conVisita.length+'</div><div class="stat-name">En visita</div></div>'+
    '<div class="stat-card"><div class="stat-num" style="color:var(--red)">'+venc.length+'</div><div class="stat-name">Vencidas</div></div>'+
    '<div class="stat-card"><div class="stat-num" style="color:var(--gray-400)">'+cerradasMes.length+'</div><div class="stat-name">Cerradas/mes</div></div>';
}

function renderCounts(){
  const arr=Object.values(consultas);
  const act=arr.filter(c=>!['Cerrado','Sin interés'].includes(c.estado));
  document.getElementById('cnt-todas').textContent=act.length+' activas';
  EQUIPO.forEach(m=>{
    const n=act.filter(c=>c.asignado===m).length;
    document.getElementById('cnt-'+m).textContent=n+(n===1?' activa':' activas');
  });
}

function renderAlarmas(){
  const venc=Object.entries(consultas).map(([id,c])=>({...c,id}))
    .filter(c=>c.asignado===usuarioActivo)
    .filter(c=>{const i=countdownInfo(c);return i&&(i.tipo==='vencida'||i.tipo==='warn');})
    .sort((a,b)=>(ultimoCheck(a)||0)-(ultimoCheck(b)||0));
  const el=document.getElementById('alarmas');
  if(!venc.length){el.innerHTML='';return;}
  const n=venc.length;
  const items=venc.map(c=>{
    const i=countdownInfo(c);
    return '<div class="alarma-item" onclick="window._abrirDetalle(\''+c.id+'\')">'+
      '<span>'+c.nombre+(c.propiedad?' — '+c.propiedad:'')+'</span>'+
      '<span class="alarma-pill">'+i.txt+'</span></div>';
  }).join('');
  el.innerHTML='<div class="alarma-banner">'+
    '<div class="alarma-title" onclick="window._toggleAlarmas()" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:0">'+
      '<span>🔔 Tu seguimiento'+(n>1?'s':'')+' pendiente'+(n>1?'s':'')+' ('+n+')</span>'+
      '<span id="alarmas-chev" style="font-size:10px;opacity:.7">'+(_alarmasExpanded?'▲':'▼')+'</span>'+
    '</div>'+
    '<div id="alarmas-list" style="margin-top:'+(_alarmasExpanded?'8':'0')+'px;display:'+(_alarmasExpanded?'block':'none')+'">'+items+'</div>'+
  '</div>';
}
window._toggleAlarmas = () => {
  _alarmasExpanded=!_alarmasExpanded;
  const list=document.getElementById('alarmas-list');
  const chev=document.getElementById('alarmas-chev');
  if(list){list.style.display=_alarmasExpanded?'block':'none';list.style.marginTop=_alarmasExpanded?'8px':'0';}
  if(chev) chev.textContent=_alarmasExpanded?'▲':'▼';
};

function renderLista(){
  const lista=document.getElementById('lista');
  let arr=Object.entries(consultas).map(([id,c])=>({...c,id}));
  if(subTab!=='todas') arr=arr.filter(c=>c.asignado===subTab);
  if(filtroEstado!=='todos') arr=arr.filter(c=>(c.estado||'Activo')===filtroEstado);
  const q=(document.getElementById('search-input')?.value||'').toLowerCase();
  if(q) arr=arr.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.propiedad||'').toLowerCase().includes(q)||(c.instagram||'').toLowerCase().includes(q)||(c.tel||'').replace(/\D/g,'').includes(q.replace(/\D/g,'')));
  arr.sort((a,b)=>{
    const ia=countdownInfo(a),ib=countdownInfo(b);
    const ua=ia?.tipo==='vencida'?0:ia?.tipo==='warn'?1:2;
    const ub=ib?.tipo==='vencida'?0:ib?.tipo==='warn'?1:2;
    if(ua!==ub) return ua-ub;
    return (b.fecha||0)-(a.fecha||0);
  });
  if(!arr.length){lista.innerHTML='<div class="empty"><div class="empty-icon">📋</div><div>No hay consultas</div></div>';return;}
  lista.innerHTML=arr.map(c=>{
    const pills=CHECKS.map(ch=>{
      const v=c.checks?.[ch.key];
      return '<span class="check-pill '+(v?'done':'')+'">'+(v?'✓ ':'')+ch.short+'</span>';
    }).join('');
    const fecha=new Date(c.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'});
    const info=countdownInfo(c);
    const cd=info?'<div class="countdown-pill countdown-'+info.tipo+'">'+info.txt+'</div>':'';
    const lastNota=c.notas?Object.values(c.notas).sort((a,b)=>(b.fecha||0)-(a.fecha||0))[0]:null;
    const waHref=c.tel?'https://wa.me/549'+c.tel.replace(/\D/g,''):null;
    return '<div class="cons-card '+c.asignado+'" onclick="window._abrirDetalle(\''+c.id+'\')">'+
      '<div class="card-top"><div class="card-nombre">'+(c.nombre||'Sin nombre')+'</div>'+
      '<span class="estado-badge estado-'+(c.estado||'Activo')+'">'+(c.estado||'Activo')+'</span>'+
      '</div>'+
      (c.obs?'<div class="card-obs">'+c.obs+'</div>':'')+
      (lastNota?'<div class="card-nota">"'+lastNota.texto+'"</div>':'')+
      ((c.tel||c.instagram)?'<div style="display:flex;align-items:center;gap:6px;margin:5px 0">'+
        (c.tel?'<span style="font-size:12px;color:var(--gray-600)">'+c.tel+'</span>'+
          (waHref?'<a href="'+waHref+'" target="_blank" onclick="event.stopPropagation()" style="background:#25d366;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;text-decoration:none">WA</a>':'')
        :('<span style="font-size:12px;color:var(--gray-600)">'+c.instagram+'</span>'))+
      '</div>':'')+
      ((c.propiedad||c.canal)?'<div style="font-size:11px;color:var(--gray-400);margin-bottom:4px">'+
        (c.propiedad?'🏠 '+c.propiedad:'')+
        (c.propiedad&&c.canal?' · ':'')+
        (c.canal?'Vía '+c.canal:'')+
      '</div>':'')+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">'+
        '<div class="asignado"><div class="avatar" style="background:'+COLORES[c.asignado]+'">'+(NOMBRES[c.asignado]?.[0]||'?')+'</div>'+NOMBRES[c.asignado]+'</div>'+
        '<div style="display:flex;align-items:center;gap:6px"><span class="card-fecha">'+fecha+'</span>'+cd+'</div>'+
      '</div>'+
      '<div class="checklist-row">'+pills+'</div>'+
    '</div>';
  }).join('');
}

// ============================================================
// DETALLE CONSULTA
// ============================================================
window._abrirDetalle = (id) => {
  const c={...consultas[id],id};
  const fecha=new Date(c.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const waLink=c.tel?'https://wa.me/549'+c.tel.replace(/\D/g,''):null;
  const info=countdownInfo(c);
  const checks=CHECKS.map((ch,idx)=>{
    const v=c.checks?.[ch.key];
    const isRes=ch.key==='res';
    const cls='pipeline-step'+(isRes&&v?' done-res':v?' done':'');
    const ts=c.checkTs?.[ch.key];
    const tsStr=ts?new Date(ts).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Pendiente';
    return '<div class="'+cls+'" onclick="window._toggleCheck(\''+id+'\',\''+ch.key+'\',this)">'+
      '<div class="pipeline-dot">'+(v?'✓':(idx+1))+'</div>'+
      '<div style="flex:1">'+
        '<div class="pipeline-lbl">'+ch.label+'</div>'+
        '<div class="pipeline-ts">'+tsStr+'</div>'+
      '</div>'+
    '</div>';
  }).join('');
  const estados=['Activo','Reserva','Cerrado','Sin interés'].map(e=>'<option '+(c.estado===e?'selected':'')+'>'+e+'</option>').join('');
  const asigs=EQUIPO.map(m=>'<option value="'+m+'" '+(c.asignado===m?'selected':'')+'>'+NOMBRES[m]+'</option>').join('');
  const notas=c.notas?Object.entries(c.notas).sort((a,b)=>a[1].fecha-b[1].fecha).map(([nid,n])=>
    '<div class="nota-item">'+
    '<div class="nota-autor" style="color:'+(COLORES[n.autor]||'#000')+'">'+(NOMBRES[n.autor]||n.autor)+'</div>'+
    '<div class="nota-txt">'+n.texto+'</div>'+
    '<div class="nota-fecha">'+new Date(n.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</div>'+
    '<div class="nota-acciones">'+
    '<button class="nota-btn" onclick="window._editNota(\''+id+'\',\''+nid+'\',this)">✏️</button>'+
    '<button class="nota-btn" onclick="window._delNota(\''+id+'\',\''+nid+'\')">🗑</button>'+
    '</div></div>').join(''):'<div style="font-size:12px;color:var(--gray-400);padding:6px 0">Sin notas.</div>';

  document.getElementById('detalle-content').innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">'+
    '<div style="flex:1;margin-right:12px">'+
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+
    '<div style="font-family:\'DM Serif Display\',serif;font-size:22px" id="det-nombre">'+(c.nombre||'Sin nombre')+'</div>'+
    '<button onclick="window._editNombre(\''+id+'\')" style="background:var(--gray-100);border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;color:var(--gray-600)">✏️</button>'+
    '</div><div style="font-size:12px;color:var(--gray-400);margin-top:2px">'+fecha+'</div></div>'+
    '<div class="avatar" style="width:40px;height:40px;font-size:16px;background:'+COLORES[c.asignado]+'">'+(NOMBRES[c.asignado]?.[0]||'?')+'</div></div>'+
    (info?'<div class="countdown-det '+info.tipo+'" style="justify-content:space-between"><span>⏰ '+info.txt+'</span><button onclick="window._resetCountdown(\''+id+'\')" style="background:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.4);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;color:inherit;white-space:nowrap">↺ Ya hablé</button></div>':'')+
    (waLink?'<a href="'+waLink+'" target="_blank" class="wa-btn">📱 WhatsApp — '+c.tel+'</a>':'')+
    '<div class="detail-section"><div class="detail-section-title">Datos</div>'+
    '<div class="detail-row"><span class="detail-key">Teléfono</span><span class="detail-val" style="display:flex;align-items:center;gap:6px"><span id="det-tel">'+(c.tel||'—')+'</span><button onclick="window._editTel(\''+id+'\')" style="background:var(--gray-100);border:none;border-radius:6px;padding:2px 6px;font-size:10px;cursor:pointer">✏️</button></span></div>'+
    '<div class="detail-row"><span class="detail-key">Instagram</span><span class="detail-val" style="display:flex;align-items:center;gap:6px"><span id="det-ig">'+(c.instagram||'—')+'</span><button onclick="window._editIG(\''+id+'\')" style="background:var(--gray-100);border:none;border-radius:6px;padding:2px 6px;font-size:10px;cursor:pointer">✏️</button></span></div>'+
    '<div class="detail-row"><span class="detail-key">Propiedad</span><span class="detail-val" style="display:flex;align-items:center;gap:6px"><span id="det-prop" style="flex:1">'+(c.propiedad||'—')+'</span><button onclick="window._editPropiedad(\''+id+'\')" style="background:var(--gray-100);border:none;border-radius:6px;padding:2px 6px;font-size:10px;cursor:pointer;flex-shrink:0">✏️</button></span></div>'+
    '<div class="detail-row"><span class="detail-key">Canal</span><span class="detail-val" style="display:flex;align-items:center;gap:6px"><span id="det-canal">'+(c.canal||'—')+'</span><button onclick="window._editCanal(\''+id+'\')" style="background:var(--gray-100);border:none;border-radius:6px;padding:2px 6px;font-size:10px;cursor:pointer">✏️</button></span></div>'+
    '<div class="detail-row"><span class="detail-key">Qué busca</span><span class="detail-val" style="display:flex;align-items:flex-start;gap:6px"><span id="det-obs" style="flex:1;line-height:1.4;color:'+(c.obs?'inherit':'var(--gray-400)')+'">'+(c.obs||'—')+'</span><button onclick="window._editObs(\''+id+'\')" style="background:var(--gray-100);border:none;border-radius:6px;padding:2px 6px;font-size:10px;cursor:pointer;flex-shrink:0">✏️</button></span></div>'+
    (c.cargadoPor?'<div class="detail-row"><span class="detail-key">Cargado por</span><span class="detail-val" style="color:'+COLORES[c.cargadoPor]+'">'+NOMBRES[c.cargadoPor]+'</span></div>':'')+
    '</div>'+
    '<div class="detail-section"><div class="detail-section-title">Seguimiento</div>'+checks+'</div>'+
    '<div class="detail-section"><div class="detail-section-title">Notas</div><div id="notas-lista">'+notas+'</div>'+
    '<div class="nota-input-row"><input class="nota-input" id="nota-inp-'+id+'" placeholder="Escribí una nota..." type="text" onkeypress="if(event.key===\'Enter\')window._addNota(\''+id+'\')"><button class="nota-send" onclick="window._addNota(\''+id+'\')">Enviar</button></div></div>'+
    '<div class="detail-section"><div class="detail-section-title">Estado</div><select class="form-select" onchange="window._updField(\''+id+'\',\'estado\',this.value)">'+estados+'</select></div>'+
    '<div class="detail-section"><div class="detail-section-title">Reasignar</div><select class="form-select" onchange="window._updField(\''+id+'\',\'asignado\',this.value)">'+asigs+'</select></div>'+
    (usuarioActivo==='santiago'?'<button class="btn-danger" onclick="window._delConsulta(\''+id+'\')">🗑 Eliminar consulta</button>':'<div style="font-size:12px;color:var(--gray-400);text-align:center;margin-top:10px">Solo Santiago puede eliminar</div>')+
    '<div class="btn-row"><button class="btn-primary" onclick="cerrarModal(\'modal-detalle\')">Cerrar</button></div>';

  document.getElementById('modal-detalle').classList.add('open');
};

// ============================================================
// MATCHING IA - solo cuando se pide
// ============================================================
window._matchingConsulta = (id) => {
  const c = consultas[id];
  if(!c) return;
  const btn = document.querySelector('[onclick="window._matchingConsulta(\''+id+'\')"]');
  if(btn) { btn.textContent = '⏳ Analizando...'; btn.disabled = true; }
  generarMatchingIA(id, c);
};

async function generarMatchingIA(id,c){
  if(matchCache[id]){
    const el=document.getElementById('matching-'+id);
    if(el) el.outerHTML=matchCache[id];
    return;
  }
  const disp=Object.entries(propiedades).filter(([,p])=>p.estado!=='Vendida/Alquilada')
    .map(([pid,p])=>(pid+': '+[p.tipo,p.operacion,p.barrio,p.ambientes?p.ambientes+' amb':'',p.precio,p.desc?.substring(0,100)].filter(Boolean).join(' | ')));
  if(!disp.length){document.getElementById('matching-'+id).innerHTML='';return;}
  try {
    const data=await geminiCall('Cliente busca: "'+c.obs+'"\n\nPropiedades disponibles:\n'+disp.join('\n')+'\n\nRespondé SOLO JSON válido: {"matches":[{"id":"ID","score":85,"razon":"razón breve"}]} Máx 3, score>40.',{maxOutputTokens:400,temperature:0.3});
    const txt=data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    const m=txt.match(/\{[\s\S]*\}/);
    if(!m) throw new Error('No JSON');
    const result=JSON.parse(m[0]);
    if(!result.matches?.length) throw new Error('No matches');
    const html='<div class="matching-box"><div class="matching-title">✨ Propiedades compatibles según IA</div>'+
      result.matches.map(m=>{
        const p=propiedades[m.id];
        if(!p) return '';
        return '<div class="matching-item"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">'+
          '<div><div class="matching-prop-titulo">'+(p.titulo||p.direccion||'')+'</div>'+
          '<div class="matching-prop-precio">'+(p.precio||'')+' — '+(p.operacion||'')+(p.barrio?' · '+p.barrio:'')+'</div></div>'+
          '<span class="matching-score">'+m.score+'% compatible</span></div>'+
          '<div style="font-size:11px;color:var(--purple);font-style:italic">'+m.razon+'</div></div>';
      }).join('')+'</div>';
    matchCache[id]=html;
    const el=document.getElementById('matching-'+id);
    if(el) el.outerHTML=html;
  } catch(e){
    const el=document.getElementById('matching-'+id);
    if(el) el.innerHTML='';
  }
}

// ============================================================
// RESPUESTA IA
// ============================================================
window._generarRespuesta = async (id) => {
  const c=consultas[id];
  if(!c) return;
  const box=document.getElementById('resp-box-'+id);
  const txt=document.getElementById('resp-txt-'+id);
  const waBtn=document.getElementById('resp-wa-'+id);
  if(!box||!txt) return;
  box.style.display='block';
  txt.textContent='Generando...';
  const prop=Object.values(propiedades).find(p=>c.propiedad&&(p.titulo||p.direccion||'').toLowerCase().includes((c.propiedad||'').toLowerCase().split(',')[0]));
  try {
    const data=await geminiCall('Sos agente inmobiliario en Mar del Plata. Generá un mensaje WhatsApp corto y cálido. Cliente: '+c.nombre+'. Busca: '+c.obs+'. Propiedad: '+(prop?prop.titulo||prop.direccion:'').substring(0,100)+'. Máx 4 líneas, español argentino informal pero profesional. Solo el mensaje, sin explicaciones.',{maxOutputTokens:300,temperature:0.8});
    const respuesta=data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    txt.textContent=respuesta;
    if(waBtn&&c.tel) waBtn.href='https://wa.me/549'+c.tel.replace(/\D/g,'')+'?text='+encodeURIComponent(respuesta);
  } catch(e){
    txt.textContent='Error: '+e.message;
  }
};

// ============================================================
// ACCIONES CONSULTA
// ============================================================
window._toggleCheck = (id,key,el) => {
  const val=!(consultas[id]?.checks?.[key]);
  const up={};
  up['consultas/'+id+'/checks/'+key]=val;
  up['consultas/'+id+'/checkTs/'+key]=val?Date.now():null;
  update(ref(db),up);
  const idx=CHECKS.findIndex(x=>x.key===key);
  el.className='pipeline-step'+(key==='res'&&val?' done-res':val?' done':'');
  const dot=el.querySelector('.pipeline-dot');
  if(dot) dot.textContent=val?'✓':(idx+1);
  const ts=el.querySelector('.pipeline-ts');
  if(ts) ts.textContent=val?'Ahora':'Pendiente';
};
window._updField = (id,campo,val) => update(ref(db,'consultas/'+id),{[campo]:val});
window._resetCountdown = (id) => {
  const now=Date.now();
  update(ref(db,'consultas/'+id),{lastReset:now});
  if(consultas[id]) consultas[id].lastReset=now;
  window._abrirDetalle(id);
};
window._editNombre = (id) => {
  const n=prompt('Nombre:',consultas[id]?.nombre||'');
  if(!n?.trim()) return;
  update(ref(db,'consultas/'+id),{nombre:n.trim()});
  const el=document.getElementById('det-nombre');if(el) el.textContent=n.trim();
};
window._editTel = (id) => {
  const n=prompt('Teléfono:',consultas[id]?.tel||'');
  if(n===null) return;
  if(consultas[id]) consultas[id].tel=n.trim();
  update(ref(db,'consultas/'+id),{tel:n.trim()});
  window._abrirDetalle(id);
};
window._editIG = (id) => {
  const n=prompt('Instagram:',consultas[id]?.instagram||'');
  if(n===null) return;
  update(ref(db,'consultas/'+id),{instagram:n.trim()});
  const el=document.getElementById('det-ig');if(el) el.textContent=n.trim()||'—';
};
window._editObs = (id) => {
  const n=prompt('¿Qué busca?',consultas[id]?.obs||'');
  if(n===null) return;
  if(consultas[id]) consultas[id].obs=n.trim();
  update(ref(db,'consultas/'+id),{obs:n.trim()});
  window._abrirDetalle(id);
};
window._editPropiedad = (id) => {
  const n=prompt('Propiedad consultada:',consultas[id]?.propiedad||'');
  if(n===null) return;
  if(consultas[id]) consultas[id].propiedad=n.trim();
  update(ref(db,'consultas/'+id),{propiedad:n.trim()});
  window._abrirDetalle(id);
};
window._editCanal = (id) => {
  const n=prompt('Canal:',consultas[id]?.canal||'');
  if(n===null) return;
  if(consultas[id]) consultas[id].canal=n.trim();
  update(ref(db,'consultas/'+id),{canal:n.trim()});
  window._abrirDetalle(id);
};
window._addNota = (id) => {
  const inp=document.getElementById('nota-inp-'+id);
  const txt=inp?.value?.trim();
  if(!txt||!usuarioActivo) return;
  push(ref(db,'consultas/'+id+'/notas'),{texto:txt,autor:usuarioActivo,fecha:Date.now()});
  if(inp) inp.value='';
};
window._editNota = (cId,nId,btn) => {
  const cur=btn.closest('.nota-item').querySelector('.nota-txt').textContent;
  const n=prompt('Editar nota:',cur);
  if(!n?.trim()) return;
  update(ref(db,'consultas/'+cId+'/notas/'+nId),{texto:n.trim()});
  setTimeout(()=>window._abrirDetalle(cId),300);
};
window._delNota = (cId,nId) => {
  if(!confirm('¿Eliminar nota?')) return;
  remove(ref(db,'consultas/'+cId+'/notas/'+nId));
  setTimeout(()=>window._abrirDetalle(cId),300);
};
window._delConsulta = (id) => {
  if(usuarioActivo!=='santiago'){alert('Solo Santiago puede eliminar.');return;}
  const p=prompt('Contraseña:');
  if(p!=='2858'){alert('Incorrecta.');return;}
  if(!confirm('¿Eliminar?')) return;
  remove(ref(db,'consultas/'+id));
  cerrarModal('modal-detalle');
};

// ============================================================
// NUEVA CONSULTA
// ============================================================
function _propLabel(p){
  return (p.direccion||p.titulo||'')+(p.barrio?', '+p.barrio:'')+(p.precio?' — '+p.precio:'');
}

function actualizarSelPropiedades(){
  const sel=document.getElementById('c-propiedad-sel');
  if(!sel) return;
  const q=(document.getElementById('c-prop-buscar')?.value||'').toLowerCase().trim();
  const opts=Object.entries(propiedades).filter(([,p])=>p.estado!=='Vendida/Alquilada')
    .filter(([,p])=>!q||(p.direccion||'').toLowerCase().includes(q)||(p.titulo||'').toLowerCase().includes(q)||(p.barrio||'').toLowerCase().includes(q))
    .map(([,p])=>'<option value="'+encodeURIComponent(p.titulo||p.direccion||'')+'">'+_propLabel(p)+'</option>').join('');
  sel.innerHTML='<option value="">— Seleccioná —</option>'+opts+'<option value="__manual__">Escribir manualmente</option>';
}

window._togglePill = (el, isMulti) => {
  if(!isMulti){
    const wasSel = el.classList.contains('sel');
    el.parentElement.querySelectorAll('.obs-pill').forEach(p=>p.classList.remove('sel'));
    if(!wasSel) el.classList.add('sel');
  } else {
    el.classList.toggle('sel');
  }
};

window._filtrarProps = (q) => { actualizarSelPropiedades(); };

window._addExtraTag = () => {
  const inp = document.getElementById('obs-extra-new');
  if(!inp) return;
  const v = inp.value.trim();
  if(!v) return;
  const cont = document.getElementById('obs-extras-custom');
  if(!cont) return;
  const tag = document.createElement('span');
  tag.className = 'am-chip-custom';
  tag.dataset.v = v;
  tag.innerHTML = v + '<button type="button" onclick="window._delExtraTag(this.parentElement)">×</button>';
  cont.appendChild(tag);
  inp.value = '';
};

window._delExtraTag = (el) => { if(el) el.remove(); };

function _buildObs(){
  const parts=[];
  const op=document.querySelector('#obs-op .obs-pill.sel');
  if(op) parts.push(op.dataset.v);
  const tipo=document.querySelector('#obs-tipo .obs-pill.sel');
  if(tipo) parts.push(tipo.dataset.v);
  else { const tipoOtro=(document.getElementById('obs-tipo-otro')?.value||'').trim(); if(tipoOtro) parts.push(tipoOtro); }
  const amb=document.querySelector('#obs-amb .obs-pill.sel');
  if(amb) parts.push(amb.dataset.v+' amb.');
  const zona=(document.getElementById('obs-zona')?.value||'').trim();
  if(zona) parts.push('Zona '+zona);
  const precioRaw=(document.getElementById('obs-precio')?.value||'').replace(/\D/g,'');
  const mon=document.getElementById('obs-moneda')?.value||'USD';
  if(precioRaw) parts.push('Hasta '+mon+' '+parseInt(precioRaw).toLocaleString('es-AR'));
  const extras=[...document.querySelectorAll('#obs-extras .obs-pill.sel')].map(el=>el.dataset.v);
  const extrasCustom=[...document.querySelectorAll('#obs-extras-custom .am-chip-custom')].map(el=>el.dataset.v);
  const todosExtras=[...extras,...extrasCustom];
  if(todosExtras.length) parts.push('Con '+todosExtras.join(', '));
  const nota=(document.getElementById('obs-extra-txt')?.value||'').trim();
  if(nota) parts.push(nota);
  return parts.join(' · ');
}

window.abrirNuevaConsulta = () => {
  ['c-nombre','c-tel','c-instagram'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';});
  document.getElementById('c-canal').value='';
  document.getElementById('c-asignado').value='auto';
  document.getElementById('c-propiedad-sel').value='';
  document.getElementById('c-propiedad-manual-wrap').style.display='none';
  document.querySelectorAll('#obs-op .obs-pill,#obs-tipo .obs-pill,#obs-amb .obs-pill,#obs-extras .obs-pill').forEach(p=>p.classList.remove('sel'));
  ['obs-zona','obs-precio','obs-extra-txt','obs-tipo-otro','obs-extra-new','c-prop-buscar'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';});
  const m=document.getElementById('obs-moneda');if(m)m.value='USD';
  const oc=document.getElementById('obs-extras-custom');if(oc)oc.innerHTML='';
  document.getElementById('modal-consulta').classList.add('open');
};

window.guardarConsulta = () => {
  const nombre=document.getElementById('c-nombre').value.trim();
  if(!nombre){alert('Ingresá el nombre');return;}
  const telInput=document.getElementById('c-tel').value.trim();
  if(telInput){
    const telN=telInput.replace(/\D/g,'');
    const dup=Object.values(consultas).find(c=>(c.tel||'').replace(/\D/g,'')===telN&&telN.length>5);
    if(dup&&!confirm('⚠️ Ya existe una consulta con ese teléfono ('+dup.nombre+'). ¿Guardás igual?')) return;
  }
  const selVal=document.getElementById('c-propiedad-sel').value;
  const propiedad=selVal==='__manual__'?document.getElementById('c-propiedad-manual').value.trim():decodeURIComponent(selVal);
  const asigSel=document.getElementById('c-asignado').value;
  const asignado=asigSel==='auto'?sigRotacion():asigSel;
  push(cRef,{nombre,asignado,propiedad,
    tel:telInput,
    instagram:document.getElementById('c-instagram').value.trim(),
    canal:document.getElementById('c-canal').value,
    obs:_buildObs(),
    fecha:Date.now(),estado:'Activo',checks:{},checkTs:{},cargadoPor:usuarioActivo
  });
  cerrarModal('modal-consulta');
};

// ============================================================
// PROPIEDADES
// ============================================================
let autocomplete=null;

function initAutocomplete(){
  const inp=document.getElementById('p-dir');
  if(!inp||!window.google||autocomplete) return;
  autocomplete=new google.maps.places.Autocomplete(inp,{componentRestrictions:{country:'ar'},fields:['address_components','formatted_address'],language:'es'});
  autocomplete.addListener('place_changed',()=>{
    const place=autocomplete.getPlace();
    propDirCompleta=place.formatted_address||inp.value;
    const ciudad=place.address_components?.find(c=>c.types.includes('locality'));
    propCiudad=ciudad?.long_name||'';
    const badge=document.getElementById('p-ciudad-badge');
    const txt=document.getElementById('p-ciudad-txt');
    if(badge&&propCiudad){badge.style.display='block';if(txt)txt.textContent=propCiudad;}
  });
}

document.getElementById('modal-propiedad').addEventListener('click',()=>{
  if(!autocomplete) setTimeout(initAutocomplete,300);
});

// ============================================================
// IMPORTAR DESDE PORTAL
// ============================================================
window.setModoPropiedad = (modo) => {
  const manual = document.getElementById('modo-manual-section');
  const importar = document.getElementById('modo-importar-section');
  const btnManual = document.getElementById('modo-manual-btn');
  const btnImportar = document.getElementById('modo-importar-btn');
  if(modo === 'manual') {
    manual.style.display = 'block';
    importar.style.display = 'none';
    btnManual.style.background = 'var(--black)'; btnManual.style.color = '#fff';
    btnImportar.style.background = 'transparent'; btnImportar.style.color = 'var(--gray-600)';
  } else {
    manual.style.display = 'none';
    importar.style.display = 'block';
    btnImportar.style.background = 'var(--black)'; btnImportar.style.color = '#fff';
    btnManual.style.background = 'transparent'; btnManual.style.color = 'var(--gray-600)';
  }
};

window.importarDesdePortal = async () => {
  const url = document.getElementById('import-url').value.trim();
  if(!url || !url.startsWith('http')) { alert('Ingresá una URL válida de Zonaprop o Argenprop'); return; }

  const status = document.getElementById('import-status');
  const resultado = document.getElementById('import-resultado');
  const errStyle = 'display:block;background:var(--red-light);border:1.5px solid var(--red);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;font-size:13px;color:var(--red);font-weight:600';
  const okStyle  = 'display:block;background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;font-size:13px;color:var(--green);font-weight:600';
  const showErr  = (msg) => { status.style.display='none'; resultado.style.cssText=errStyle; resultado.textContent=msg; };
  status.style.display='block';
  status.textContent='⏳ Conectando con el portal...';
  resultado.style.display='none';

  try {
    // PASO 1: fetch del HTML via proxies con fallback
    let html='';
    const timeout=(ms)=>new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms));
    const proxies=[
      ()=>fetch('https://api.allorigins.win/get?url='+encodeURIComponent(url)).then(r=>r.json()).then(d=>d.contents||''),
      ()=>fetch('https://corsproxy.io/?'+encodeURIComponent(url)).then(r=>r.text()),
      ()=>fetch('https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(url)).then(r=>r.text()),
      ()=>fetch('https://thingproxy.freeboard.io/fetch/'+url).then(r=>r.text()),
    ];
    for(const proxy of proxies){
      try { html=await Promise.race([proxy(),timeout(12000)]); if(html&&html.length>1000) break; html=''; }
      catch(e){ html=''; console.log('Proxy falló:',e.message); }
    }
    if(html.length<1000) throw new Error('No se pudo leer la publicación. El portal puede tener protección. Probá con otra URL o copiá la URL directamente del navegador.');

    status.textContent='🔍 Analizando con IA...';

    // PASO 2: limpiar HTML y extraer texto + imágenes
    const parser=new DOMParser();
    const doc=parser.parseFromString(html,'text/html');
    doc.querySelectorAll('script,style,nav,footer,header,iframe,noscript').forEach(el=>el.remove());
    const texto=(doc.body?.innerText||'').replace(/\n{3,}/g,'\n\n').trim().substring(0,10000);

    // Deduplicación inteligente: agrupa por stem de URL, prefiere versión "big"
    const imgMap=new Map();
    const skipW=['logo','icon','placeholder','avatar','sprite','banner','map','profile','user','marca','watermark'];
    const imgSc=u=>/big|large|full|orig|original|1280|1024|800/i.test(u)?3:/medium|med|normal|640|480/i.test(u)?2:/small|thumb|mini|tiny|160|240|320/i.test(u)?1:2;
    const imgStem=u=>u.split('/').pop().replace(/\?.*$/,'').replace(/[-_](?:big|large|full|orig|original|medium|med|small|thumb|mini|tiny|\d+x\d+|\d{3,4}(?:px)?)(?=[.-])/gi,'').toLowerCase();
    const addImg=u=>{
      if(!u||!u.startsWith('http')||!u.match(/\.(jpg|jpeg|png|webp)/i)) return;
      if(skipW.some(w=>u.toLowerCase().includes(w))) return;
      const base=u.split('?')[0];
      const stem=imgStem(base);
      if(!imgMap.has(stem)||imgSc(base)>imgSc(imgMap.get(stem))) imgMap.set(stem,base);
    };
    const attrs=['src','data-src','data-lazy-src','data-original','data-url','data-image','data-lazy','data-zoom-image','data-full-url'];
    doc.querySelectorAll('img,[data-src],[data-lazy-src],[data-original],[data-zoom-image]').forEach(el=>{
      for(const a of attrs){ addImg(el.getAttribute(a)||''); }
    });
    // Búsqueda en HTML raw: captura imágenes en JSON-LD, JS vars, etc.
    const rgx=/https?:\/\/[^\s"'<>\\]+\.(?:jpg|jpeg|png|webp)/gi;
    let rm;
    while((rm=rgx.exec(html))!==null){
      addImg(rm[0].replace(/\\u002F/g,'/').replace(/\\/g,''));
    }
    const imgUrls=[...imgMap.values()].slice(0,40);

    // PASO 3: Gemini extrae los datos (con retry si el JSON viene mal)
    const promptBase='Analizá este texto de una publicación inmobiliaria argentina y extraé TODOS los datos. '+
      'Respondé SOLO JSON puro y válido, sin markdown, sin bloques de código, sin texto antes ni después:\n'+
      '{"titulo":"","operacion":"Venta|Alquiler|Alquiler temporal","tipo":"Departamento|Casa|PH|Local comercial|Oficina|Terreno|Otro",'+
      '"precio":"incluir moneda, ej: USD 120000 o $350000","barrio":"","direccion":"calle y numero",'+
      '"ambientes":"solo numero","dormitorios":"solo numero","banos":"solo numero",'+
      '"supTotal":"solo numero sin m2","supCubierta":"solo numero sin m2","piso":"",'+
      '"ascensor":"Si|No","calefaccion":"","orientacion":"","antiguedad":"","cochera":"No|descripcion",'+
      '"toilette":"Si|No","amenities":["array","de","amenities"],"desc":"descripcion completa"}\n\nTexto:\n';

    let prop=null;
    for(let intento=0;intento<3;intento++){
      if(intento>0){
        status.textContent='🔄 Reintentando extracción ('+(intento+1)+'/3)...';
        await new Promise(r=>setTimeout(r,1500));
      }
      try{
        const gd=await geminiCall(promptBase+texto,{maxOutputTokens:2500,temperature:0.1});
        const gtxt=gd.candidates?.[0]?.content?.parts?.[0]?.text||'';
        const stripped=gtxt.replace(/```(?:json)?/gi,'').replace(/```/g,'').trim();
        const jm=stripped.match(/\{[\s\S]*\}/);
        if(!jm) continue;
        prop=JSON.parse(jm[0]);
        if(prop.titulo||prop.direccion||prop.precio) break;
        prop=null;
      } catch(e){ prop=null; }
    }
    if(!prop) throw new Error('Gemini no pudo extraer los datos. El texto del portal puede ser insuficiente. Probá con otra URL o cargá manualmente.');

    // PASO 4: llenar formulario
    setModoPropiedad('manual');
    const setv=(id,v)=>{if(v){const e=document.getElementById(id);if(e)e.value=v;}};
    setv('p-titulo',prop.titulo); setv('p-barrio',prop.barrio); setv('p-dir',prop.direccion);
    setv('p-desc',prop.desc); setv('p-sup-total',prop.supTotal); setv('p-sup-cub',prop.supCubierta);
    setv('p-piso',prop.piso); setv('p-calef',prop.calefaccion); setv('p-orient',prop.orientacion);
    setv('p-toilette',prop.toilette); setv('p-cochera',prop.cochera); setv('p-antig',prop.antiguedad);
    setv('p-asc',prop.ascensor); setv('p-op',prop.operacion);
    // Normalizar tipo
    const tipoMap={'departamento':'Departamento','depto':'Departamento','casa':'Casa','ph':'PH','local':'Local comercial','local comercial':'Local comercial','oficina':'Oficina','terreno':'Terreno'};
    if(prop.tipo){const tn=tipoMap[prop.tipo.toLowerCase()]||prop.tipo;const te=document.getElementById('p-tipo');if(te)te.value=tn;actualizarCamposTipo();}
    // Normalizar cochera
    if(prop.cochera&&prop.cochera!=='No'){
      const cv=prop.cochera.toLowerCase();
      const cocheraVal=cv.includes('2')||cv.includes('dos')?'2 cocheras':cv.includes('desc')||cv.includes('abierta')?'1 descubierta':'1 cubierta';
      const ce=document.getElementById('p-cochera');if(ce)ce.value=cocheraVal;
    }
    // Selects con opciones fijas
    [['p-amb',prop.ambientes],['p-dorm',prop.dormitorios],['p-ban',prop.banos]].forEach(([id,v])=>{
      if(!v) return;
      const el=document.getElementById(id); if(!el) return;
      const opt=[...el.options].find(o=>o.value===String(v)||o.text===String(v));
      if(opt) el.value=opt.value;
    });
    if(prop.precio){
      const pn=prop.precio.replace(/[^\d]/g,'');
      if(pn){ document.getElementById('p-precio').value=parseInt(pn).toLocaleString('es-AR');
        document.getElementById('p-moneda').value=prop.precio.match(/usd|u\$s|dolar|dollar/i)?'USD':'ARS';
        window.formatearPrecio(); }
    }
    if(prop.amenities?.length){
      const mapAm={pileta:'pileta',piscina:'pileta',pool:'pileta',gimnasio:'gimnasio',parrilla:'quincho',quincho:'quincho',laundry:'laundry',sum:'sum',jardin:'jardin','jardín':'jardin',terraza:'terraza',balcon:'balcon','balcón':'balcon',seguridad:'seguridad','vista al mar':'vista-mar',amoblado:'amoblado',coworking:'coworking','apto crédito':'apto-credito','apto credito':'apto-credito','apto mascotas':'apto-mascotas','apto profesional':'apto-profesional',jacuzzi:'jacuzzi',baulera:'baulera',playroom:'playroom','parrilla propia':'parrilla-propia','jardín privado':'jardin-privado','jardin privado':'jardin-privado'};
      prop.amenities.forEach(a=>{
        const k=Object.keys(mapAm).find(key=>a.toLowerCase().includes(key));
        const val=k?mapAm[k]:null;
        if(val){
          const el=document.querySelector('#p-am-grid .am-chip[data-v="'+val+'"]');
          if(el)el.classList.add('sel');
        }
      });
    }
    actualizarCamposTipo(); actualizarMoneda();

    // PASO 5: importar fotos
    const preview=document.getElementById('p-fotos-preview');
    let subidas=0;
    if(imgUrls.length>0){
      const maxFotos=Math.min(imgUrls.length,25);
      status.textContent='📷 Importando fotos (0/'+maxFotos+')...';
      const imgProxies=(u)=>[
        'https://images.weserv.nl/?url='+encodeURIComponent(u)+'&output=jpg&q=95&maxage=1d',
        'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
        'https://corsproxy.io/?'+encodeURIComponent(u),
      ];
      // Intenta construir URL de alta resolución reemplazando dimensiones pequeñas en el path
      const hiResUrl=u=>u.replace(/\/(\d{2,3}x\d{2,3})\//g,(m,d)=>parseInt(d)<800?'/1024x768/':m)
                         .replace(/\/(360|480|240|320|160|150|100|75|50)\//g,'/1024/');
      for(const imgUrl of imgUrls.slice(0,maxFotos)){
        const hi=hiResUrl(imgUrl);
        const tries=hi!==imgUrl?[hi,imgUrl]:[imgUrl];
        let blob=null;
        tryLoop: for(const tu of tries){
          for(const proxyUrl of imgProxies(tu)){
            try{
              const ir=await Promise.race([fetch(proxyUrl),timeout(10000)]);
              if(!ir.ok) continue;
              const b=await ir.blob();
              if(b.size<5000) continue;
              blob=b; break tryLoop;
            } catch(e){ console.log('Proxy img falló:',proxyUrl,e.message); }
          }
        }
        if(!blob) continue;
        try{
          const fd=new FormData();
          fd.append('file',blob,'foto.jpg');
          fd.append('upload_preset',CLOUD.preset);
          const up=await Promise.race([
            fetch('https://api.cloudinary.com/v1_1/'+CLOUD.name+'/image/upload',{method:'POST',body:fd}),
            timeout(15000)
          ]);
          const ud=await up.json();
          if(ud.secure_url){
            fotosSubidas.push(ud.secure_url); subidas++;
            const div=document.createElement('div');
            div.className='foto-container';
            div.style.cssText='position:relative;display:inline-block';
            const idx=fotosSubidas.length-1;
            div.innerHTML='<img src="'+ud.secure_url+'" style="width:68px;height:68px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="window.abrirMejoraFoto(this.parentElement)">'+
              '<button onclick="window.quitarFoto('+idx+',this.parentElement)" style="position:absolute;top:-4px;right:-4px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer">&#x2715;</button>'+
              '<button onclick="window.abrirMejoraFoto(this.parentElement)" style="position:absolute;bottom:-4px;right:-4px;background:var(--purple);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Mejorar con IA">✨</button>';
            preview.appendChild(div);
            status.textContent='📷 Importando fotos ('+subidas+'/'+maxFotos+')...';
          }
        } catch(e){ console.log('Cloudinary error:',imgUrl,e.message); }
      }
    }

    status.style.display='none';
    document.getElementById('import-url').value='';
    resultado.style.cssText=okStyle;
    resultado.textContent='Importado: '+(prop.titulo||prop.direccion||'propiedad')+'. '+(subidas>0?subidas+' foto'+(subidas>1?'s':'')+' importada'+(subidas>1?'s':'')+'.':'Sin fotos encontradas.')+' Revisá los datos y guardá.';

  } catch(e){
    console.error('importarDesdePortal:',e);
    showErr('Error: '+e.message);
  }
};

window.actualizarMoneda = () => {
  const op=document.getElementById('p-op')?.value;
  const mon=document.getElementById('p-moneda');
  const per=document.getElementById('p-periodo');
  if(!mon||!per) return;
  if(op==='Venta'){mon.value='USD';per.textContent='';}
  else if(op==='Alquiler'){mon.value='ARS';per.textContent='/mes';}
  else{mon.value='USD';per.textContent='/noche';}
  formatearPrecio();
};

window.formatearPrecio = () => {
  const inp=document.getElementById('p-precio');
  const mon=document.getElementById('p-moneda')?.value||'USD';
  const per=document.getElementById('p-periodo')?.textContent||'';
  const prev=document.getElementById('p-precio-preview');
  if(!inp) return;
  const raw=inp.value.replace(/\D/g,'');
  const num=parseInt(raw)||0;
  if(raw) inp.value=num.toLocaleString('es-AR');
  if(prev) prev.textContent=num?(mon==='USD'?'USD '+num.toLocaleString('es-AR')+per:'$'+num.toLocaleString('es-AR')+per):'';
};

window.actualizarCamposTipo = () => {
  const tipo=document.getElementById('p-tipo')?.value;
  const res=['Departamento','Casa','PH'];
  const dep=['Departamento','PH'];
  const cr=document.getElementById('campos-res');
  const cd=document.getElementById('campos-depto');
  if(cr) cr.style.display=res.includes(tipo)?'block':'none';
  if(cd) cd.style.display=dep.includes(tipo)?'block':'none';
};

window.generarDescripcionIA = async () => {
  const tipo=document.getElementById('p-tipo')?.value||'';
  const op=document.getElementById('p-op')?.value||'';
  const dir=document.getElementById('p-dir')?.value||'';
  const barrio=document.getElementById('p-barrio')?.value||'';
  const supT=document.getElementById('p-sup-total')?.value||'';
  const supC=document.getElementById('p-sup-cub')?.value||'';
  const amb=document.getElementById('p-amb')?.value||'';
  const dorm=document.getElementById('p-dorm')?.value||'';
  const ban=document.getElementById('p-ban')?.value||'';
  const toilette=document.getElementById('p-toilette')?.value||'';
  const cochera=document.getElementById('p-cochera')?.value||'';
  const piso=document.getElementById('p-piso')?.value||'';
  const asc=document.getElementById('p-asc')?.value||'';
  const calef=document.getElementById('p-calef')?.value||'';
  const orient=document.getElementById('p-orient')?.value||'';
  const antig=document.getElementById('p-antig')?.value||'';
  const ams=['pileta','gimnasio','quincho','laundry','sum','jardin','terraza','balcon','seguridad','vista-mar','amoblado','coworking']
    .filter(a=>document.getElementById('am-'+a)?.checked).join(', ');
  const mon=document.getElementById('p-moneda')?.value||'USD';
  const precioRaw=(document.getElementById('p-precio')?.value||'').replace(/\D/g,'');
  const per=document.getElementById('p-periodo')?.textContent||'';
  const precio=precioRaw?(mon==='USD'?'USD '+parseInt(precioRaw).toLocaleString('es-AR')+per:'$'+parseInt(precioRaw).toLocaleString('es-AR')+per):'';

  const loading=document.getElementById('p-ia-loading');
  const iaBtn=document.getElementById('p-desc-ia-btn');
  if(loading) loading.style.display='block';
  if(iaBtn){iaBtn.disabled=true;iaBtn.textContent='⏳ Generando...';}
  document.getElementById('p-desc').value='';

  let datos='Tipo: '+tipo+'\nOperación: '+op+'\n';
  if(dir) datos+='Dirección: '+dir+(barrio?' — Barrio: '+barrio:'')+'\n';
  else if(barrio) datos+='Barrio: '+barrio+'\n';
  if(supT) datos+='Superficie total: '+supT+' m²\n';
  if(supC) datos+='Superficie cubierta: '+supC+' m²\n';
  if(amb) datos+='Ambientes: '+amb+'\n';
  if(dorm) datos+='Dormitorios: '+dorm+'\n';
  if(ban) datos+='Baños: '+ban+'\n';
  if(toilette==='Sí') datos+='Toilette: Sí\n';
  if(cochera&&cochera!=='No') datos+='Cochera: '+cochera+'\n';
  if(piso) datos+='Piso: '+piso+(asc?' — Ascensor: '+asc:'')+'\n';
  if(calef) datos+='Calefacción: '+calef+'\n';
  if(orient) datos+='Orientación: '+orient+'\n';
  if(antig) datos+='Antigüedad: '+antig+'\n';
  if(ams) datos+='Amenities: '+ams+'\n';

  const prompt='Sos especialista en marketing inmobiliario en Mar del Plata, Argentina. '+
    'Generá una descripción completa y atractiva para publicar en Zonaprop o Argenprop.\n\n'+
    'Características de la propiedad:\n'+datos+'\n'+
    'Instrucciones:\n'+
    '- Español argentino, tono profesional pero cercano\n'+
    '- 3 párrafos: 1ro presenta y destaca los puntos fuertes, 2do describe ambientes y características, 3ro habla de la ubicación y ventajas del barrio\n'+
    '- No incluyas el precio en la descripción\n'+
    '- No inventes datos que no se te dieron\n'+
    '- Devolvé solo el texto, sin títulos ni aclaraciones extra';

  try {
    const data=await geminiCall(prompt,{maxOutputTokens:8192,temperature:0.7});
    const txt=data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    if(!txt) throw new Error('Sin respuesta de la API');
    document.getElementById('p-desc').value=txt;
  } catch(e){
    console.error('generarDescripcionIA:', e);
    document.getElementById('p-desc').value='Error: '+e.message;
  }
  if(loading) loading.style.display='none';
  if(iaBtn){iaBtn.disabled=false;iaBtn.textContent='✨ Generar descripción con IA';}
};

// SUBIDA FOTOS
window.subirFotos = async (input) => {
  const files=Array.from(input.files).slice(0,20);
  const preview=document.getElementById('p-fotos-preview');
  const embellecer=document.getElementById('p-embellecer')?.checked;
  for(const file of files){
    const tmpId='tmp-'+Math.random().toString(36).substr(2,6);
    const reader=new FileReader();
    reader.onload=e=>{
      const div=document.createElement('div');
      div.style.cssText='position:relative;display:inline-block';
      div.id=tmpId;
      div.innerHTML='<img src="'+e.target.result+'" style="width:68px;height:68px;object-fit:cover;border-radius:6px;opacity:0.5"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;background:rgba(0,0,0,.4);border-radius:6px">⏳</div>';
      preview.appendChild(div);
    };
    reader.readAsDataURL(file);
    try {
      const fd=new FormData();
      fd.append('file',file);
      fd.append('upload_preset',CLOUD.preset);
      const r=await fetch('https://api.cloudinary.com/v1_1/'+CLOUD.name+'/image/upload',{method:'POST',body:fd});
      const d=await r.json();
      let url=d.secure_url;
      if(embellecer&&url) url=url.replace('/upload/','/upload/e_improve,e_auto_brightness,e_auto_contrast,e_sharpen:50,q_auto,f_auto/');
      fotosSubidas.push(url);
      const el=document.getElementById(tmpId);
      if(el){
        const idx=fotosSubidas.length-1;
        el.className='foto-container';
        el.innerHTML='<img src="'+url+'" style="width:68px;height:68px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="window.abrirMejoraFoto(this.parentElement)">'+
          '<button onclick="quitarFoto('+idx+',this.parentElement)" style="position:absolute;top:-4px;right:-4px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'+
          '<button onclick="window.abrirMejoraFoto(this.parentElement)" style="position:absolute;bottom:-4px;right:-4px;background:var(--purple);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Mejorar con IA">✨</button>';
      }
    } catch(e){console.log('Error foto:',e);}
  }
  input.value='';
};

window.quitarFoto = (idx,el) => {fotosSubidas.splice(idx,1);el.remove();};

// ========= MEJORA DE FOTOS =========
let _mejoraContainer=null;
let _mejoraOrigUrl='';
let _mejState={embellecer:false,despejar:false};

window.abrirMejoraFoto = (el) => {
  _mejoraContainer=el;
  _mejoraOrigUrl=el.querySelector('img').src;
  _mejState={embellecer:false,despejar:false};
  document.getElementById('mejora-orig-img').src=_mejoraOrigUrl;
  document.getElementById('mejora-prev-img').src=_mejoraOrigUrl;
  document.getElementById('mejora-prev-err').style.display='none';
  document.getElementById('mejora-prev-loader').style.display='none';
  const ap=document.getElementById('mejora-aplicar-btn');
  ap.style.opacity='.4';ap.style.pointerEvents='none';
  _syncMejBtn();
  document.getElementById('modal-mejora-foto').classList.add('open');
};

function _syncMejBtn(){
  const eb=document.getElementById('mejora-btn-emb');
  const db=document.getElementById('mejora-btn-desp');
  eb.style.borderColor=_mejState.embellecer?'var(--purple)':'var(--gray-200)';
  eb.style.background=_mejState.embellecer?'var(--purple-light)':'#fff';
  eb.style.color=_mejState.embellecer?'var(--purple)':'var(--gray-500)';
  db.style.borderColor=_mejState.despejar?'#e67e22':'var(--gray-200)';
  db.style.background=_mejState.despejar?'#fff8f0':'#fff';
  db.style.color=_mejState.despejar?'#e67e22':'var(--gray-500)';
}

function _buildMejUrl(base,emb,desp){
  const parts=base.split('/upload/');
  if(parts.length!==2) return base;
  const t=[];
  if(desp) t.push('e_gen_remove:prompt_furniture_and_all_objects_and_clutter;multiple_true');
  if(emb) t.push('e_improve:100,e_auto_brightness,e_auto_contrast,e_sharpen:80,e_vibrance:30,q_auto:best,f_auto');
  return parts[0]+'/upload/'+t.join('/')+'/'+parts[1];
}

window.toggleMejoraOpc = (tipo) => {
  _mejState[tipo]=!_mejState[tipo];
  _syncMejBtn();
  const loader=document.getElementById('mejora-prev-loader');
  const img=document.getElementById('mejora-prev-img');
  const err=document.getElementById('mejora-prev-err');
  const ap=document.getElementById('mejora-aplicar-btn');
  err.style.display='none';
  if(!_mejState.embellecer&&!_mejState.despejar){
    img.src=_mejoraOrigUrl;
    loader.style.display='none';
    ap.style.opacity='.4';ap.style.pointerEvents='none';
    return;
  }
  loader.style.display='flex';
  img.src='';
  const newUrl=_buildMejUrl(_mejoraOrigUrl,_mejState.embellecer,_mejState.despejar);
  const tmp=new Image();
  tmp.onload=()=>{
    img.src=newUrl;
    loader.style.display='none';
    ap.style.opacity='1';ap.style.pointerEvents='auto';
  };
  tmp.onerror=()=>{
    loader.style.display='none';
    if(tipo==='despejar'){
      err.style.display='flex';
      _mejState.despejar=false;_syncMejBtn();
      if(_mejState.embellecer){
        const fb=_buildMejUrl(_mejoraOrigUrl,true,false);
        img.src=fb;
        ap.style.opacity='1';ap.style.pointerEvents='auto';
      } else {img.src=_mejoraOrigUrl;ap.style.opacity='.4';ap.style.pointerEvents='none';}
    } else {
      err.style.display='flex';
      img.src=_mejoraOrigUrl;
      ap.style.opacity='.4';ap.style.pointerEvents='none';
    }
  };
  tmp.src=newUrl;
};

window.aplicarMejora = () => {
  const newUrl=_buildMejUrl(_mejoraOrigUrl,_mejState.embellecer,_mejState.despejar);
  const idx=fotosSubidas.indexOf(_mejoraOrigUrl);
  if(idx!==-1) fotosSubidas[idx]=newUrl;
  const editIdx=_editFotos.indexOf(_mejoraOrigUrl);
  if(editIdx!==-1) _editFotos[editIdx]=newUrl;
  if(_mejoraContainer){
    const img=_mejoraContainer.querySelector('img');
    if(img) img.src=newUrl;
    _mejoraContainer.querySelectorAll('.ai-badge').forEach(b=>b.remove());
    if(_mejState.embellecer||_mejState.despejar){
      const badge=document.createElement('div');
      badge.className='ai-badge';
      badge.style.cssText='position:absolute;bottom:2px;left:2px;display:flex;gap:2px';
      if(_mejState.embellecer) badge.innerHTML+='<span class="ai-badge-pill" style="background:var(--purple);color:#fff">✨</span>';
      if(_mejState.despejar) badge.innerHTML+='<span class="ai-badge-pill" style="background:#e67e22;color:#fff">🧹</span>';
      _mejoraContainer.appendChild(badge);
    }
  }
  cerrarModal('modal-mejora-foto');
};

function actualizarSelPropietarios(){
  ['p-propietario','v-prop-owner','edit-propietario'].forEach(selId=>{
    const sel=document.getElementById(selId);
    if(!sel) return;
    const opts=Object.entries(propietarios).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre))
      .map(([id,p])=>'<option value="'+id+'">'+p.nombre+(p.tel?' — '+p.tel:'')+'</option>').join('');
    sel.innerHTML='<option value="">— Sin propietario —</option>'+opts;
  });
}

window.guardarPropiedad = () => {
  const dir=document.getElementById('p-dir').value.trim();
  const titulo=document.getElementById('p-titulo').value.trim();
  if(!dir&&!titulo){alert('Ingresá la dirección');return;}
  if(fotosSubidas.length>0){
    document.getElementById('check-derechos-1').checked=false;
    document.getElementById('check-derechos-2').checked=false;
    document.getElementById('modal-derechos').classList.add('open');
    return;
  }
  _doGuardarPropiedad();
};

window.confirmarGuardarPropiedad = () => {
  if(!document.getElementById('check-derechos-1').checked||!document.getElementById('check-derechos-2').checked){
    alert('Debés aceptar ambas declaraciones para continuar.');
    return;
  }
  cerrarModal('modal-derechos');
  _doGuardarPropiedad();
};

function _doGuardarPropiedad(){
  const dir=document.getElementById('p-dir').value.trim();
  const titulo=document.getElementById('p-titulo').value.trim();
  const mon=document.getElementById('p-moneda')?.value||'USD';
  const precioRaw=(document.getElementById('p-precio')?.value||'').replace(/\D/g,'');
  const per=document.getElementById('p-periodo')?.textContent||'';
  const precioFmt=precioRaw?(mon==='USD'?'USD '+parseInt(precioRaw).toLocaleString('es-AR')+per:'$'+parseInt(precioRaw).toLocaleString('es-AR')+per):'';
  const ams=_collectAmenities('p-am-grid','p-am-custom-tags');
  push(pRef,{
    titulo:titulo||propDirCompleta||dir,
    direccion:propDirCompleta||dir,
    barrio:document.getElementById('p-barrio').value.trim(),
    tipo:document.getElementById('p-tipo').value,
    operacion:document.getElementById('p-op').value,
    precio:precioFmt,
    precioNum:parseInt(precioRaw)||0,
    moneda:mon,
    supTotal:document.getElementById('p-sup-total').value||'',
    supCubierta:document.getElementById('p-sup-cub').value||'',
    ambientes:document.getElementById('p-amb').value||'',
    dormitorios:document.getElementById('p-dorm').value||'',
    banos:document.getElementById('p-ban').value||'',
    toilette:document.getElementById('p-toilette').value||'',
    cochera:document.getElementById('p-cochera').value||'',
    antiguedad:document.getElementById('p-antig').value||'',
    piso:document.getElementById('p-piso')?.value||'',
    ascensor:document.getElementById('p-asc')?.value||'',
    calefaccion:document.getElementById('p-calef').value||'',
    orientacion:document.getElementById('p-orient').value||'',
    amenities:ams,
    desc:document.getElementById('p-desc').value.trim(),
    fotos:fotosSubidas.length?[...fotosSubidas]:[],
    foto:fotosSubidas[0]||'',
    propietarioId:document.getElementById('p-propietario').value||null,
    estado:'Disponible',
    fecha:Date.now(),
    cargadoPor:usuarioActivo
  });
  ['p-dir','p-titulo','p-barrio','p-desc','p-sup-total','p-sup-cub','p-piso'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('p-precio').value='';
  document.getElementById('p-precio-preview').textContent='';
  document.getElementById('p-fotos-preview').innerHTML='';
  document.getElementById('p-ciudad-badge').style.display='none';
  document.querySelectorAll('#p-am-grid .am-chip').forEach(el=>el.classList.remove('sel'));
  const pCustomTags=document.getElementById('p-am-custom-tags');if(pCustomTags)pCustomTags.innerHTML='';
  const pCustomInp=document.getElementById('p-am-custom-inp');if(pCustomInp)pCustomInp.value='';
  fotosSubidas=[];propDirCompleta='';propCiudad='';
  autocomplete=null;
  cerrarModal('modal-propiedad');
}

window._cambiarEstadoProp = (id,estado) => update(ref(db,'propiedades/'+id),{estado});
window._delProp = (id) => {if(!confirm('¿Eliminar propiedad?')) return;remove(ref(db,'propiedades/'+id));};

// ============================================================
// RENDER PROPIEDADES
// ============================================================
function renderPropiedades(){
  const lista=document.getElementById('lista');
  const arr=Object.entries(propiedades).map(([id,p])=>({...p,id}));
  let html='<button class="btn-nueva" onclick="document.getElementById(\'modal-propiedad\').classList.add(\'open\')">+ Nueva propiedad</button>';
  html+='<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">';
  html+='<input id="prop-search" class="search-input" placeholder="🔍 Buscar propiedad..." oninput="renderPropiedades()" style="flex:1;min-width:200px">';
  html+='<select id="prop-filter-op" class="form-select" onchange="renderPropiedades()" style="width:130px;flex-shrink:0"><option value="">Operación</option><option>Venta</option><option>Alquiler</option><option>Alquiler temporal</option></select>';
  html+='<select id="prop-filter-estado" class="form-select" onchange="renderPropiedades()" style="width:130px;flex-shrink:0"><option value="">Estado</option><option>Disponible</option><option>Reservada</option><option>Vendida/Alquilada</option></select>';
  html+='</div>';
  const q=(document.getElementById('prop-search')?.value||'').toLowerCase();
  const fOp=document.getElementById('prop-filter-op')?.value||'';
  const fEst=document.getElementById('prop-filter-estado')?.value||'';
  let filtered=arr;
  if(q) filtered=filtered.filter(p=>(p.titulo||'').toLowerCase().includes(q)||(p.direccion||'').toLowerCase().includes(q)||(p.barrio||'').toLowerCase().includes(q)||(p.tipo||'').toLowerCase().includes(q));
  if(fOp) filtered=filtered.filter(p=>p.operacion===fOp);
  if(fEst) filtered=filtered.filter(p=>(p.estado||'Disponible')===fEst);
  if(!arr.length){html+='<div class="empty"><div class="empty-icon">🏠</div><div>No hay propiedades</div></div>';lista.innerHTML=html;return;}
  if(!filtered.length){html+='<div class="empty"><div class="empty-icon">🔍</div><div>Sin resultados</div></div>';lista.innerHTML=html;return;}
  html+='<div class="prop-grid">'+filtered.map(p=>{
    const todasFotos=p.fotos?.length?p.fotos:p.foto?[p.foto]:[];
    const estadoCls=p.estado==='Disponible'?'prop-disponible':p.estado==='Reservada'?'prop-reservada':'prop-vendida';
    const pr=propietarios[p.propietarioId];
    return '<div class="prop-ficha" onclick="window.abrirFichaProp(\''+p.id+'\')">'+
      '<span class="prop-estado-badge '+estadoCls+'">'+(p.estado||'Disponible')+'</span>'+
      (todasFotos.length?
        '<div class="prop-cover"><img src="'+todasFotos[0]+'" loading="lazy"></div>':
        '<div class="prop-foto-placeholder">📷 Sin fotos</div>')+
      '<div class="prop-body">'+
      '<div class="prop-operacion">'+(p.tipo||'')+' · '+(p.operacion||'')+(p.barrio?' · '+p.barrio:'')+'</div>'+
      '<div class="prop-titulo">'+(p.titulo||p.direccion||'')+'</div>'+
      '<div class="prop-precio">'+(p.precio||'')+'</div>'+
      (p.ambientes?'<div class="prop-info">'+(p.ambientes+' amb')+(p.dormitorios?' · '+p.dormitorios+' dorm.':'')+(p.supCubierta?' · '+p.supCubierta+'m²':p.supTotal?' · '+p.supTotal+'m²':'')+'</div>':'')+
      (p.amenities?.length?'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">'+p.amenities.slice(0,4).map(a=>'<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--gray-100);color:var(--gray-600);font-weight:600">'+_amLabel(a)+'</span>').join('')+(p.amenities.length>4?'<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--gray-100);color:var(--gray-400);font-weight:600">+'+( p.amenities.length-4)+' más</span>':'')+'</div>':'')+
      (pr?'<div class="prop-propietario">👤 '+pr.nombre+'</div>':'')+
      '<div style="display:flex;gap:6px;align-items:center;margin-top:6px" onclick="event.stopPropagation()">'+
      '<select onchange="window._cambiarEstadoProp(\''+p.id+'\',this.value)" style="flex:1;padding:5px;border:1.5px solid var(--gray-200);border-radius:6px;font-size:11px;font-family:\'DM Sans\',sans-serif">'+
      '<option '+(p.estado==='Disponible'?'selected':'')+'>Disponible</option>'+
      '<option '+(p.estado==='Reservada'?'selected':'')+'>Reservada</option>'+
      '<option '+(p.estado==='Vendida/Alquilada'?'selected':'')+'>Vendida/Alquilada</option>'+
      '</select>'+
      '<button onclick="window._delProp(\''+p.id+'\')" style="padding:5px 8px;background:var(--red-light);color:var(--red);border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">🗑</button>'+
      '</div></div></div>';
  }).join('')+'</div>';
  lista.innerHTML=html;
}

// ============================================================
// LIGHTBOX
// ============================================================
// ============================================================
// FICHA DE PROPIEDAD
// ============================================================
window.abrirFichaProp = (id) => {
  const p = propiedades[id];
  if(!p) return;
  const todasFotos = p.fotos?.length ? p.fotos : p.foto ? [p.foto] : [];
  const ams = (p.amenities||[]).map(a => '<span class="ficha-amenity">'+_amLabel(a)+'</span>').join('');
  const shareUrl = 'https://santiagollavemaestra-arch.github.io/llave-maestra/?prop='+id;
  
  let galeriaHtml = '';
  if(todasFotos.length) {
    galeriaHtml = '<div class="galeria-prop">'+
      todasFotos.map((f,i) => {
        const emb=f.includes('e_improve')||f.includes('e_auto_brightness');
        const desp=f.includes('e_gen_remove');
        const badge=(emb||desp)?'<div style="position:absolute;top:5px;right:5px;display:flex;gap:2px;z-index:2">'+
          (emb?'<span class="ai-badge-pill" style="background:var(--purple);color:#fff">✨</span>':'')+
          (desp?'<span class="ai-badge-pill" style="background:#e67e22;color:#fff">🧹</span>':'')+
          '</div>':'';
        return '<div>'+badge+'<img src="'+f+'" onclick="window.abrirLightbox(\''+id+'\','+i+')" loading="lazy"></div>';
      }).join('')+
      '</div>';
  }

  document.getElementById('ficha-prop-content').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">'+
    '<div>'+
    '<div style="font-size:11px;color:var(--gray-400);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">'+(p.tipo||'')+' en '+(p.operacion||'')+(p.barrio?' · '+p.barrio:'')+'</div>'+
    '<div style="font-family:\'DM Serif Display\',serif;font-size:22px;line-height:1.2">'+(p.titulo||p.direccion||'')+'</div>'+
    '</div>'+
    '<span class="prop-estado-badge '+(p.estado==='Disponible'?'prop-disponible':p.estado==='Reservada'?'prop-reservada':'prop-vendida')+'">'+(p.estado||'Disponible')+'</span>'+
    '</div>'+
    (p.precio ? '<div style="font-size:24px;font-weight:900;color:var(--green);margin-bottom:16px">'+p.precio+'</div>' : '')+
    galeriaHtml+
    // Barra de stats principales
    (()=>{
      const si=[];
      if(p.ambientes) si.push({v:p.ambientes,l:'Ambientes'});
      if(p.dormitorios) si.push({v:p.dormitorios,l:'Dormitorios'});
      if(p.banos) si.push({v:p.banos,l:'Baños'});
      if(p.supCubierta) si.push({v:p.supCubierta+' m²',l:'Cub.'});
      else if(p.supTotal) si.push({v:p.supTotal+' m²',l:'Total'});
      if(!si.length) return '';
      return '<div class="ficha-specs">'+si.map(s=>'<div class="ficha-spec"><div class="ficha-spec-val">'+s.v+'</div><div class="ficha-spec-lbl">'+s.l+'</div></div>').join('')+'</div>';
    })()+
    // Tabla de detalles secundarios
    (()=>{
      const rows=[];
      if(p.piso) rows.push(['Piso',p.piso+(p.ascensor&&p.ascensor!=='No'?' · Ascensor: '+p.ascensor:'')]);
      if(p.supCubierta&&p.supTotal&&p.supTotal!==p.supCubierta) rows.push(['Sup. total',p.supTotal+' m²']);
      if(p.calefaccion) rows.push(['Calefacción',p.calefaccion]);
      if(p.orientacion) rows.push(['Orientación',p.orientacion]);
      if(p.antiguedad) rows.push(['Antigüedad',p.antiguedad]);
      if(p.toilette==='Sí') rows.push(['Toilette','Sí']);
      if(p.cochera&&p.cochera!=='No') rows.push(['Cochera',p.cochera]);
      if(!rows.length) return '';
      return '<div class="ficha-details">'+rows.map(r=>'<div class="ficha-det"><span class="ficha-det-k">'+r[0]+'</span><span class="ficha-det-v">'+r[1]+'</span></div>').join('')+'</div>';
    })()+
    (ams ? '<div style="margin-bottom:12px">'+ams+'</div>' : '')+
    (p.desc ? '<div style="font-size:14px;color:var(--gray-600);line-height:1.7;margin-bottom:16px;white-space:pre-wrap">'+p.desc+'</div>' : '')+
    '<button id="btn-match-inv-'+id+'" onclick="window.matchingInverso(\''+id+'\')" style="width:100%;margin-bottom:10px;padding:11px;background:var(--purple-light);border:1.5px solid var(--purple);border-radius:var(--radius-sm);font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;color:var(--purple);cursor:pointer">👥 ¿A quién le recomiendo esta propiedad?</button>'+
    '<div id="matching-inv-'+id+'" style="margin-bottom:10px"></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:10px">'+
    '<button onclick="window._abrirEditarProp(\''+id+'\');event.stopPropagation()" style="flex:1;padding:11px;background:var(--gray-100);border:1.5px solid var(--gray-200);border-radius:var(--radius-sm);font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;color:var(--gray-600);cursor:pointer">✏️ Editar</button>'+
    '<button onclick="compartirPropiedad(\''+id+'\');event.stopPropagation()" style="flex:1;padding:11px;background:var(--blue-light);border:1.5px solid var(--blue);border-radius:var(--radius-sm);font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;color:var(--blue);cursor:pointer">🔗 Compartir</button>'+
    '</div>'+
    '<div class="btn-row"><button class="btn-primary" onclick="cerrarModal(\'modal-ficha-prop\')">Cerrar</button></div>';

  document.getElementById('modal-ficha-prop').classList.add('open');
};

// Matching inverso: dada una propiedad, encontrar consultas compatibles
window.matchingInverso = async (propId) => {
  const btn = document.getElementById('btn-match-inv-'+propId);
  const divRes = document.getElementById('matching-inv-'+propId);
  if(btn) { btn.textContent = '⏳ Analizando clientes...'; btn.disabled = true; }
  if(divRes) divRes.innerHTML = '';

  const p = propiedades[propId];
  if(!p) {
    if(btn) { btn.textContent = '👥 ¿A quién le recomiendo esta propiedad?'; btn.disabled = false; }
    return;
  }

  // Incluir clientes activos con obs O con notas
  const consActivas = Object.entries(consultas)
    .filter(([,c]) => !['Cerrado','Sin interés'].includes(c.estado))
    .filter(([,c]) => c.obs || Object.keys(c.notas||{}).length > 0);

  if(!consActivas.length) {
    if(divRes) divRes.innerHTML = '<div style="font-size:13px;color:var(--gray-400);padding:8px 0;text-align:center">No hay clientes activos con información de búsqueda.</div>';
    if(btn) { btn.textContent = '👥 ¿A quién le recomiendo esta propiedad?'; btn.disabled = false; }
    return;
  }

  // Armar texto de clientes incluyendo notas
  const clientesTxt = consActivas.map(([cid,c]) => {
    const notas = Object.values(c.notas||{})
      .sort((a,b) => (a.ts||0)-(b.ts||0))
      .map(n => n.texto).filter(Boolean).join('. ');
    let info = '['+cid+'] '+c.nombre;
    if(c.obs) info += ' — Busca: '+c.obs;
    if(notas) info += ' — Notas del agente: '+notas;
    return info;
  }).join('\n');

  const propTxt = [
    (p.tipo||'')+(p.operacion?' en '+p.operacion:''),
    p.barrio,
    p.ambientes ? p.ambientes+' ambientes' : '',
    p.dormitorios ? p.dormitorios+' dormitorios' : '',
    p.banos ? p.banos+' baños' : '',
    p.supCubierta ? p.supCubierta+'m² cubiertos' : (p.supTotal ? p.supTotal+'m² totales' : ''),
    p.piso ? 'Piso '+p.piso+(p.ascensor&&p.ascensor!=='No'?' con ascensor':'') : '',
    p.precio,
    p.cochera && p.cochera!=='No' ? 'Con cochera' : '',
    p.amenities?.length ? 'Amenities: '+p.amenities.join(', ') : '',
    p.desc ? p.desc.substring(0,250) : ''
  ].filter(Boolean).join('. ');

  const prompt = 'Sos un agente inmobiliario experto en Mar del Plata. Analizá si esta propiedad encaja para alguno de los clientes activos, considerando toda la informacion disponible de cada uno.'+
    '\n\nPROPIEDAD:\n'+propTxt+
    '\n\nCLIENTES ACTIVOS:\n'+clientesTxt+
    '\n\nReglas:'+
    '\n- Analizá búsqueda explícita Y notas del agente para entender las necesidades reales.'+
    '\n- Si la propiedad NO aplica para ningún cliente respondé exactamente: {"matches":[],"mensaje":"Esta propiedad no encaja con las búsquedas activas."}'+
    '\n- Si aplica respondé SOLO JSON válido sin markdown: {"matches":[{"id":"ID","score":80,"razon":"razón concreta y específica"}],"mensaje":""}'+
    '\n- Máximo 5 resultados. Score 0-100. Solo incluir si score >= 40.';

  try {
    const data = await geminiCall(prompt, {maxOutputTokens:700, temperature:0.2});
    const txt = data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    const m = txt.match(/\{[\s\S]*\}/);
    if(!m) throw new Error('Respuesta inválida de la IA');
    const result = JSON.parse(m[0]);

    if(!result.matches?.length) {
      if(divRes) divRes.innerHTML =
        '<div style="background:var(--gray-50);border:1.5px solid var(--gray-200);border-radius:var(--radius-sm);padding:14px;text-align:center">'+
        '<div style="font-size:20px;margin-bottom:6px">😕</div>'+
        '<div style="font-size:13px;color:var(--gray-500);font-weight:600">'+(result.mensaje||'Esta propiedad no encaja con las búsquedas activas.')+'</div>'+
        '</div>';
    } else {
      if(divRes) divRes.innerHTML =
        '<div style="background:var(--purple-light);border:1.5px solid var(--purple);border-radius:var(--radius-sm);padding:12px">'+
        '<div style="font-size:12px;font-weight:700;color:var(--purple);margin-bottom:10px">👥 Clientes que podrían estar interesados:</div>'+
        result.matches.map(match => {
          const c = consultas[match.id];
          if(!c) return '';
          return '<div style="background:#fff;border-radius:8px;padding:10px;margin-bottom:8px">'+
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">'+
            '<span style="font-size:14px;font-weight:700">'+c.nombre+'</span>'+
            '<span style="font-size:11px;background:var(--purple-light);color:var(--purple);padding:3px 8px;border-radius:10px;font-weight:700">'+match.score+'% compatible</span>'+
            '</div>'+
            '<div style="font-size:12px;color:var(--gray-600);margin-bottom:8px;line-height:1.4">'+match.razon+'</div>'+
            (c.tel ? '<a href="https://wa.me/549'+c.tel.replace(/\D/g,'')+'" target="_blank" style="display:block;text-align:center;padding:8px;background:#25D366;color:#fff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📱 Contactar por WhatsApp</a>' : '')+
            '</div>';
        }).join('')+
        '</div>';
    }
  } catch(e) {
    if(divRes) divRes.innerHTML = '<div style="font-size:12px;color:var(--red);padding:6px 0">Error: '+e.message+'</div>';
  }
  if(btn) { btn.textContent = '👥 ¿A quién le recomiendo esta propiedad?'; btn.disabled = false; }
};

window._abrirEditarProp = (id) => {
  const p = propiedades[id];
  if(!p) return;
  document.getElementById('edit-prop-id').value = id;
  document.getElementById('edit-op').value = p.operacion||'Venta';
  document.getElementById('edit-tipo').value = p.tipo||'Departamento';
  document.getElementById('edit-titulo').value = p.titulo||p.direccion||'';
  document.getElementById('edit-dir').value = p.direccion||'';
  document.getElementById('edit-barrio').value = p.barrio||'';
  document.getElementById('edit-moneda').value = p.moneda||'USD';
  document.getElementById('edit-precio').value = p.precioNum?parseInt(p.precioNum).toLocaleString('es-AR'):(p.precio||'').replace(/[^0-9]/g,'')||'';
  document.getElementById('edit-sup-total').value = p.supTotal||'';
  document.getElementById('edit-sup-cub').value = p.supCubierta||'';
  document.getElementById('edit-amb').value = p.ambientes||'';
  document.getElementById('edit-dorm').value = p.dormitorios||'';
  document.getElementById('edit-ban').value = p.banos||'';
  document.getElementById('edit-toilette').value = p.toilette||'No';
  document.getElementById('edit-cochera').value = p.cochera||'No';
  document.getElementById('edit-antig').value = p.antiguedad||'';
  document.getElementById('edit-piso').value = p.piso||'';
  document.getElementById('edit-asc').value = p.ascensor||'Sí';
  document.getElementById('edit-calef').value = p.calefaccion||'';
  document.getElementById('edit-orient').value = p.orientacion||'';
  _restoreAmenities(p.amenities,'eam-grid','eam-custom-tags');
  document.getElementById('edit-desc').value = p.desc||'';
  document.getElementById('edit-estado').value = p.estado||'Disponible';
  document.getElementById('edit-propietario').value = p.propietarioId||'';
  _editFotos = [...(p.fotos?.length?p.fotos:p.foto?[p.foto]:[])];
  _renderEditFotos();
  cerrarModal('modal-ficha-prop');
  document.getElementById('modal-editar-prop').classList.add('open');
};

window._guardarEdicionProp = () => {
  const id = document.getElementById('edit-prop-id').value;
  if(!id) return;
  const eMon=document.getElementById('edit-moneda').value||'USD';
  const ePrecioRaw=(document.getElementById('edit-precio').value||'').replace(/\D/g,'');
  const ePrecioFmt=ePrecioRaw?(eMon==='USD'?'USD '+parseInt(ePrecioRaw).toLocaleString('es-AR'):'$'+parseInt(ePrecioRaw).toLocaleString('es-AR')):'';
  const eAms=_collectAmenities('eam-grid','eam-custom-tags');
  update(ref(db,'propiedades/'+id), {
    operacion: document.getElementById('edit-op').value,
    tipo: document.getElementById('edit-tipo').value,
    titulo: document.getElementById('edit-titulo').value.trim(),
    direccion: document.getElementById('edit-dir').value.trim(),
    barrio: document.getElementById('edit-barrio').value.trim(),
    precio: ePrecioFmt,
    precioNum: parseInt(ePrecioRaw)||0,
    moneda: eMon,
    supTotal: document.getElementById('edit-sup-total').value||'',
    supCubierta: document.getElementById('edit-sup-cub').value||'',
    ambientes: document.getElementById('edit-amb').value||'',
    dormitorios: document.getElementById('edit-dorm').value||'',
    banos: document.getElementById('edit-ban').value||'',
    toilette: document.getElementById('edit-toilette').value||'',
    cochera: document.getElementById('edit-cochera').value||'',
    antiguedad: document.getElementById('edit-antig').value||'',
    piso: document.getElementById('edit-piso').value||'',
    ascensor: document.getElementById('edit-asc').value||'',
    calefaccion: document.getElementById('edit-calef').value||'',
    orientacion: document.getElementById('edit-orient').value||'',
    amenities: eAms,
    desc: document.getElementById('edit-desc').value.trim(),
    estado: document.getElementById('edit-estado').value,
    propietarioId: document.getElementById('edit-propietario').value||null,
    fotos: _editFotos,
    foto: _editFotos[0]||'',
  });
  cerrarModal('modal-editar-prop');
  setTimeout(() => renderPropiedades(), 500);
};

// ========= EDICIÓN DE FOTOS =========
let _editFotos = [];

function _renderEditFotos(){
  const grid=document.getElementById('edit-fotos-grid');
  if(!grid) return;
  if(!_editFotos.length){grid.innerHTML='<div style="font-size:12px;color:var(--gray-400)">Sin fotos</div>';return;}
  grid.innerHTML=_editFotos.map((f,i)=>{
    const emb=f.includes('e_improve')||f.includes('e_auto_brightness');
    const desp=f.includes('e_gen_remove');
    const isFirst=i===0;
    return '<div style="position:relative;display:inline-block">'+
      '<img src="'+f+'" onclick="window.abrirLightbox(\'__edit\','+i+')" style="width:68px;height:68px;object-fit:cover;border-radius:6px;display:block;cursor:pointer'+(isFirst?';box-shadow:0 0 0 2.5px var(--purple)':'')+'">'+
      (isFirst?'<span style="position:absolute;top:-4px;left:-4px;background:var(--purple);color:#fff;border-radius:4px;padding:1px 4px;font-size:9px;font-weight:700">⭐</span>':'')+
      (emb||desp?'<div style="position:absolute;bottom:2px;left:2px;display:flex;gap:2px">'+
        (emb?'<span class="ai-badge-pill" style="background:var(--purple);color:#fff">✨</span>':'')+
        (desp?'<span class="ai-badge-pill" style="background:#e67e22;color:#fff">🧹</span>':'')+
        '</div>':'')+
      '<button onclick="window._editEliminarFoto('+i+')" style="position:absolute;top:-5px;right:-5px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'+
      '<button onclick="window.abrirMejoraFoto(this.parentElement)" style="position:absolute;top:-5px;left:-5px;background:var(--purple);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Mejorar con IA">✨</button>'+
      (i>0?'<button onclick="window._editMoverFoto('+i+',-1)" style="position:absolute;bottom:-6px;left:-6px;background:var(--gray-600);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center">◀</button>':'')+
      (i<_editFotos.length-1?'<button onclick="window._editMoverFoto('+i+',1)" style="position:absolute;bottom:-6px;right:-6px;background:var(--gray-600);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center">▶</button>':'')+
      '</div>';
  }).join('');
}

window._editEliminarFoto = (idx) => {
  _editFotos.splice(idx,1);
  _renderEditFotos();
};

window._editMoverFoto = (idx,dir) => {
  const ni=idx+dir;
  if(ni<0||ni>=_editFotos.length) return;
  const tmp=_editFotos[idx];_editFotos[idx]=_editFotos[ni];_editFotos[ni]=tmp;
  _renderEditFotos();
};

window._editSubirFotos = async (input) => {
  const files=Array.from(input.files).slice(0,10);
  const status=document.getElementById('edit-fotos-status');
  if(status) status.style.display='block';
  for(const file of files){
    try{
      const fd=new FormData();
      fd.append('file',file);
      fd.append('upload_preset',CLOUD.preset);
      const r=await fetch('https://api.cloudinary.com/v1_1/'+CLOUD.name+'/image/upload',{method:'POST',body:fd});
      const d=await r.json();
      if(d.secure_url){_editFotos.push(d.secure_url);_renderEditFotos();}
    } catch(e){ console.log('Error subiendo foto edit:',e); }
  }
  if(status) status.style.display='none';
  input.value='';
};

window.generarDescripcionEditIA = async () => {
  const id=document.getElementById('edit-prop-id').value;
  const p=propiedades[id];
  if(!p) return;
  const loading=document.getElementById('edit-ia-loading');
  const btn=document.getElementById('edit-desc-ia-btn');
  if(loading) loading.style.display='block';
  if(btn){btn.disabled=true;btn.textContent='⏳ Generando...';}
  document.getElementById('edit-desc').value='';

  let datos='Tipo: '+(p.tipo||'')+'\nOperación: '+(p.operacion||'')+'\n';
  if(p.direccion) datos+='Dirección: '+p.direccion+(p.barrio?' — Barrio: '+p.barrio:'')+'\n';
  else if(p.barrio) datos+='Barrio: '+p.barrio+'\n';
  if(p.supTotal) datos+='Superficie total: '+p.supTotal+' m²\n';
  if(p.supCubierta) datos+='Superficie cubierta: '+p.supCubierta+' m²\n';
  if(p.ambientes) datos+='Ambientes: '+p.ambientes+'\n';
  if(p.dormitorios) datos+='Dormitorios: '+p.dormitorios+'\n';
  if(p.banos) datos+='Baños: '+p.banos+'\n';
  if(p.toilette==='Sí') datos+='Toilette: Sí\n';
  if(p.cochera&&p.cochera!=='No') datos+='Cochera: '+p.cochera+'\n';
  if(p.piso) datos+='Piso: '+p.piso+(p.ascensor?' — Ascensor: '+p.ascensor:'')+'\n';
  if(p.calefaccion) datos+='Calefacción: '+p.calefaccion+'\n';
  if(p.orientacion) datos+='Orientación: '+p.orientacion+'\n';
  if(p.antiguedad) datos+='Antigüedad: '+p.antiguedad+'\n';
  if(p.amenities?.length) datos+='Amenities: '+p.amenities.join(', ')+'\n';

  const prompt='Sos especialista en marketing inmobiliario en Mar del Plata, Argentina. '+
    'Generá una descripción completa y atractiva para publicar en Zonaprop o Argenprop.\n\n'+
    'Características de la propiedad:\n'+datos+'\n'+
    'Instrucciones:\n'+
    '- Español argentino, tono profesional pero cercano\n'+
    '- 3 párrafos: 1ro presenta y destaca los puntos fuertes, 2do describe ambientes y características, 3ro habla de la ubicación y ventajas del barrio\n'+
    '- No incluyas el precio en la descripción\n'+
    '- No inventes datos que no se te dieron\n'+
    '- Devolvé solo el texto, sin títulos ni aclaraciones extra';

  try {
    const data=await geminiCall(prompt,{maxOutputTokens:8192,temperature:0.7});
    const txt=data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    if(!txt) throw new Error('Sin respuesta de la API');
    document.getElementById('edit-desc').value=txt;
  } catch(e){
    console.error('generarDescripcionEditIA:', e);
    document.getElementById('edit-desc').value='Error: '+e.message;
  }
  if(loading) loading.style.display='none';
  if(btn){btn.disabled=false;btn.textContent='✨ Generar descripción con IA';}
};

window.compartirPropiedad = (id) => {
  const url = 'https://santiagollavemaestra-arch.github.io/llave-maestra/?prop='+id;
  if(navigator.clipboard) {
    navigator.clipboard.writeText(url).then(()=>alert('✅ Link copiado: '+url));
  } else {
    prompt('Copiá este link:', url);
  }
};

// Verificar si hay una propiedad en la URL — modo público
const urlParams = new URLSearchParams(window.location.search);
const propParam = urlParams.get('prop');
if(propParam) {
  // Ocultar TODO el CRM y mostrar solo la propiedad
  document.getElementById('loading').style.display = 'none';
  document.getElementById('user-screen').classList.add('oculto');
  document.querySelector('.tabs-main').style.display = 'none';
  document.querySelector('.subtabs').style.display = 'none';
  document.querySelector('.content').style.display = 'none';
  document.querySelector('.header').style.display = 'none';
  document.getElementById('cambiar-wrap').style.display = 'none';
  
  // Crear contenedor público
  const pub = document.createElement('div');
  pub.id = 'vista-publica';
  pub.style.cssText = 'max-width:680px;margin:0 auto;padding:16px;padding-bottom:40px';
  const pubHeader = document.createElement('div');
  pubHeader.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #000';
  pubHeader.innerHTML = '<img src="/llave-maestra/icon-192.png" style="height:40px;width:40px;border-radius:8px"><div><div style="font-size:18px;font-weight:700">Llave Maestra</div><div style="font-size:11px;color:#999;letter-spacing:2px">DESARROLLOS INMOBILIARIOS</div></div>';
  const pubContent = document.createElement('div');
  pubContent.id = 'pub-content';
  pubContent.innerHTML = '<div style="text-align:center;padding:40px;color:#999">Cargando propiedad...</div>';
  pub.appendChild(pubHeader);
  pub.appendChild(pubContent);
  document.body.appendChild(pub);

    const checkProp = setInterval(() => {
    if(Object.keys(propiedades).length > 0) {
      clearInterval(checkProp);
      const p = propiedades[propParam];
      if(!p) { document.getElementById('pub-content').innerHTML='<div style="text-align:center;padding:40px;color:#999">Propiedad no encontrada.</div>'; return; }
      const todasFotos = p.fotos?.length ? p.fotos : p.foto ? [p.foto] : [];
      const ams = (p.amenities||[]).map(a=>'<span class="ficha-amenity">'+_amLabel(a)+'</span>').join('');
      const pc = document.getElementById('pub-content');
      const op = (p.tipo||'')+' en '+(p.operacion||'')+(p.barrio?' · '+p.barrio:'');
      let html2 = '';
      html2 += '<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">'+op+'</div>';
      html2 += '<div style="font-size:24px;font-weight:900;margin-bottom:8px;line-height:1.2">'+(p.titulo||p.direccion||'')+'</div>';
      if(p.precio) html2 += '<div style="font-size:28px;font-weight:900;color:#2d6a4f;margin-bottom:20px">'+p.precio+'</div>';
      if(todasFotos.length) {
        html2 += '<div class="galeria-prop" style="margin-bottom:20px">';
        todasFotos.forEach((f,i) => { html2 += '<div><img src="'+f+'" onclick="window.abrirLightbox(\''+propParam+'\','+i+')" loading="lazy"></div>'; });
        html2 += '</div>';
      }
      html2 += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px">';
      if(p.ambientes) html2 += '<div style="background:#f8f8f8;border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:900">'+p.ambientes+'</div><div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">Ambientes</div></div>';
      if(p.dormitorios) html2 += '<div style="background:#f8f8f8;border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:900">'+p.dormitorios+'</div><div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">Dormitorios</div></div>';
      if(p.banos) html2 += '<div style="background:#f8f8f8;border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:900">'+p.banos+'</div><div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">Baños</div></div>';
      const sup2 = p.supCubierta||p.supTotal;
      if(sup2) html2 += '<div style="background:#f8f8f8;border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:900">'+sup2+'</div><div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">m² cubiertos</div></div>';
      html2 += '</div>';
      if(ams) html2 += '<div style="margin-bottom:16px">'+ams+'</div>';
      if(p.desc) html2 += '<div style="font-size:15px;color:#555;line-height:1.7;margin-bottom:24px;white-space:pre-wrap">'+p.desc+'</div>';
      html2 += '<a href="https://wa.me/5492235249121" target="_blank" style="display:block;text-align:center;padding:14px;background:#25D366;color:#fff;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:16px">📱 Consultar por WhatsApp</a>';
      html2 += '<div style="text-align:center;font-size:12px;color:#999">Llave Maestra Desarrollos Inmobiliarios · Mar del Plata</div>';
      pc.innerHTML = html2;
        }
  }, 200);
  setTimeout(()=>clearInterval(checkProp), 8000);
}

window.abrirLightbox = (fotosOrId,idx) => {
  if(typeof fotosOrId==='string'){
    lbFotos=fotosOrId==='__edit'?_editFotos:
      (propiedades[fotosOrId]?.fotos?.length?propiedades[fotosOrId].fotos:
       propiedades[fotosOrId]?.foto?[propiedades[fotosOrId].foto]:[]);
  } else { lbFotos=fotosOrId; }
  lbIdx=idx||0;
  if(!lbFotos.length) return;
  document.getElementById('lb-img').src=lbFotos[lbIdx];
  document.getElementById('lb-counter').textContent=(lbIdx+1)+' / '+lbFotos.length;
  document.getElementById('lightbox').classList.add('open');
};
window.cerrarLightbox = () => document.getElementById('lightbox').classList.remove('open');
window.navLightbox = (d) => {
  lbIdx=(lbIdx+d+lbFotos.length)%lbFotos.length;
  document.getElementById('lb-img').src=lbFotos[lbIdx];
  document.getElementById('lb-counter').textContent=(lbIdx+1)+' / '+lbFotos.length;
};

// ============================================================
// PROPIETARIOS
// ============================================================
function renderPropietarios(){
  const lista=document.getElementById('lista');
  const arr=Object.entries(propietarios).map(([id,p])=>({...p,id})).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  let html='<button class="btn-nueva" onclick="document.getElementById(\'modal-propietario\').classList.add(\'open\')">+ Nuevo propietario</button>';
  if(!arr.length){html+='<div class="empty"><div class="empty-icon">👤</div><div>No hay propietarios</div></div>';lista.innerHTML=html;return;}
  html+=arr.map(p=>{
    const susProp=Object.values(propiedades).filter(pr=>pr.propietarioId===p.id);
    return '<div class="prop-card">'+
      '<div class="prop-card-nombre">'+p.nombre+'</div>'+
      (p.tel?'<div class="prop-card-tel">📱 '+p.tel+'</div>':'')+
      (p.email?'<div class="prop-card-tel">✉️ '+p.email+'</div>':'')+
      '<div class="prop-card-props">🏠 '+(susProp.length?susProp.length+' propiedad'+(susProp.length>1?'es':'')+': '+susProp.map(pr=>pr.titulo||pr.direccion||'').join(', '):'Sin propiedades')+'</div>'+
      (p.obs?'<div style="font-size:12px;color:var(--gray-600);margin-top:6px">'+p.obs+'</div>':'')+
      '<div style="display:flex;gap:8px;margin-top:10px">'+
      (p.tel?'<a href="https://wa.me/549'+p.tel.replace(/\D/g,'')+'" target="_blank" class="wa-btn" style="margin:0;padding:8px 14px;font-size:12px;flex:1">📱 WhatsApp</a>':'')+
      '<button onclick="window._editPropietario(\''+p.id+'\')" style="padding:8px 12px;background:var(--gray-100);color:var(--gray-600);border:none;border-radius:var(--radius-sm);font-size:12px;font-weight:700;cursor:pointer">✏️</button>'+
      '<button onclick="window._delPropietario(\''+p.id+'\')" style="padding:8px 12px;background:var(--red-light);color:var(--red);border:none;border-radius:var(--radius-sm);font-size:12px;font-weight:700;cursor:pointer">🗑</button>'+
      '</div></div>';
  }).join('');
  lista.innerHTML=html;
}

window.guardarPropietario = () => {
  const nombre=document.getElementById('pr-nombre').value.trim();
  if(!nombre){alert('Ingresá el nombre');return;}
  const editId=document.getElementById('pr-edit-id').value;
  const datos={nombre,tel:document.getElementById('pr-tel').value.trim(),email:document.getElementById('pr-email').value.trim(),obs:document.getElementById('pr-obs').value.trim()};
  if(editId){ update(ref(db,'propietarios/'+editId),datos); }
  else { push(prRef,{...datos,fecha:Date.now()}); }
  ['pr-nombre','pr-tel','pr-email','pr-obs'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('pr-edit-id').value='';
  const t=document.getElementById('pr-modal-title');if(t) t.textContent='Nuevo propietario';
  cerrarModal('modal-propietario');
};

window._editPropietario = (id) => {
  const p=propietarios[id];
  if(!p) return;
  document.getElementById('pr-edit-id').value=id;
  document.getElementById('pr-nombre').value=p.nombre||'';
  document.getElementById('pr-tel').value=p.tel||'';
  document.getElementById('pr-email').value=p.email||'';
  document.getElementById('pr-obs').value=p.obs||'';
  const t=document.getElementById('pr-modal-title');if(t) t.textContent='Editar propietario';
  document.getElementById('modal-propietario').classList.add('open');
};
window._delPropietario = (id) => {
  const susProp=Object.values(propiedades).filter(p=>p.propietarioId===id);
  const msg=susProp.length
    ? '⚠️ Este propietario tiene '+susProp.length+' propiedad'+(susProp.length>1?'es':'')+' asociada'+(susProp.length>1?'s':'')+': '+susProp.map(p=>p.titulo||p.direccion||'').join(', ')+'\n\n¿Eliminar de todas formas?'
    : '¿Eliminar propietario?';
  if(!confirm(msg)) return;
  remove(ref(db,'propietarios/'+id));
};

// ============================================================
// VISITAS
// ============================================================
function renderVisitas(){
  const lista=document.getElementById('lista');
  const hoy=new Date().toISOString().split('T')[0];
  const arr=Object.entries(visitas).map(([id,v])=>({...v,id})).sort((a,b)=>(a.fecha+a.hora)>(b.fecha+b.hora)?1:-1);
  const prox=arr.filter(v=>v.fecha>=hoy);
  const pas=arr.filter(v=>v.fecha<hoy);
  let html='<button class="btn-nueva" onclick="abrirNuevaVisita()">+ Agendar visita</button>';
  if(!arr.length){html+='<div class="empty"><div class="empty-icon">📅</div><div>No hay visitas</div></div>';lista.innerHTML=html;return;}
  if(prox.length){html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400);margin-bottom:8px">PRÓXIMAS ('+prox.length+')</div>'+prox.map(v=>renderVisitaCard(v,hoy)).join('');}
  if(pas.length){html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400);margin:16px 0 8px">REALIZADAS</div>'+pas.map(v=>renderVisitaCard(v,hoy,true)).join('');}
  lista.innerHTML=html;
}

function renderVisitaCard(v,hoy,pasada=false){
  const esHoy=v.fecha===hoy;
  const prop=v.propiedadId&&propiedades[v.propiedadId]?propiedades[v.propiedadId]:null;
  const cons=v.consultaId&&consultas[v.consultaId]?consultas[v.consultaId]:null;
  const fechaD=new Date(v.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long'});
  return '<div class="visita-card '+(esHoy?'visita-hoy':'')+(pasada?' visita-pasada':'')+'">'+
    '<div class="visita-fecha">📅 '+fechaD+' a las '+v.hora+'hs</div>'+
    '<div style="font-size:15px;font-weight:700;margin-bottom:4px">🏠 '+(prop?.titulo||prop?.direccion||v.propiedadTitulo||'Sin propiedad')+'</div>'+
    '<div style="font-size:13px;color:var(--gray-600);margin-bottom:4px">👤 '+(cons?.nombre||v.clienteNombre||'Sin cliente')+(cons?.tel?' — 📱 '+cons.tel:'')+'</div>'+
    '<div style="font-size:12px;color:var(--gray-400)">Agente: '+(NOMBRES[v.agente]||v.agente)+(v.obs?' · '+v.obs:'')+'</div>'+
    '<div style="display:flex;gap:6px;margin-top:8px">'+
    (cons?.tel?'<a href="https://wa.me/549'+cons.tel.replace(/\D/g,'')+'" target="_blank" style="flex:1;text-align:center;padding:7px;background:#25D366;color:#fff;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none">📱 Cliente</a>':'')+
    (!pasada?'<button onclick="window._editarVisita(\''+v.id+'\')" style="padding:7px 12px;background:var(--gray-100);color:var(--gray-600);border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">✏️</button>':'')+
    (!pasada?'<button onclick="window._delVisita(\''+v.id+'\')" style="padding:7px 12px;background:var(--red-light);color:var(--red);border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">🗑</button>':'')+
    '</div></div>';
}

window.abrirNuevaVisita = () => {
  const hoy=new Date().toISOString().split('T')[0];
  document.getElementById('v-edit-id').value='';
  const t=document.getElementById('v-modal-title');if(t) t.textContent='Agendar visita';
  document.getElementById('v-fecha').value=hoy;
  document.getElementById('v-hora').value='10:00';
  document.getElementById('v-obs').value='';
  document.getElementById('v-notif-cliente').checked=true;
  document.getElementById('v-notif-prop').checked=false;
  if(usuarioActivo) document.getElementById('v-agente').value=usuarioActivo;
  // Propiedades
  const sp=document.getElementById('v-prop');
  if(sp) sp.innerHTML='<option value="">— Seleccioná —</option>'+Object.entries(propiedades).filter(([,p])=>p.estado!=='Vendida/Alquilada').map(([id,p])=>'<option value="'+id+'">'+(p.titulo||p.direccion||'')+'</option>').join('');
  // Clientes
  const sc=document.getElementById('v-cliente');
  if(sc) sc.innerHTML='<option value="">— Seleccioná —</option>'+Object.entries(consultas).filter(([,c])=>!['Cerrado','Sin interés'].includes(c.estado)).sort((a,b)=>(a[1].nombre||'').localeCompare(b[1].nombre||'')).map(([id,c])=>'<option value="'+id+'">'+(c.nombre||'Sin nombre')+(c.tel?' — '+c.tel:'')+'</option>').join('');
  document.getElementById('modal-visita').classList.add('open');
};

window.guardarVisita = () => {
  const propId=document.getElementById('v-prop').value;
  const consId=document.getElementById('v-cliente').value;
  const fecha=document.getElementById('v-fecha').value;
  const hora=document.getElementById('v-hora').value;
  if(!fecha||!hora){alert('Ingresá fecha y hora');return;}
  const prop=propId&&propiedades[propId]?propiedades[propId]:null;
  const cons=consId&&consultas[consId]?consultas[consId]:null;
  const agente=document.getElementById('v-agente').value;
  const obs=document.getElementById('v-obs').value.trim();
  const fechaD=new Date(fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const editId=document.getElementById('v-edit-id').value;
  const datos={propiedadId:propId||null,propiedadTitulo:prop?.titulo||prop?.direccion||'',consultaId:consId||null,clienteNombre:cons?.nombre||'',fecha,hora,agente,obs};
  if(editId){ update(ref(db,'visitas/'+editId),datos); }
  else { push(vRef,{...datos,cargadoPor:usuarioActivo,timestamp:Date.now()}); }
  if(document.getElementById('v-notif-cliente').checked&&cons?.tel){
    const msg=encodeURIComponent('Hola '+(cons.nombre||'')+'! Te confirmamos la visita para el '+fechaD+' a las '+hora+'hs a la propiedad '+(prop?.titulo||prop?.direccion||'')+'. Cualquier consulta estamos a tu disposición. Llave Maestra.');
    window.open('https://wa.me/549'+cons.tel.replace(/\D/g,'')+'?text='+msg,'_blank');
  }
  if(document.getElementById('v-notif-prop').checked&&prop?.propietarioId){
    const pr=propietarios[prop.propietarioId];
    if(pr?.tel){setTimeout(()=>{const msg=encodeURIComponent('Hola '+pr.nombre+'! El '+fechaD+' a las '+hora+'hs se realizará una visita a su propiedad '+(prop.titulo||prop.direccion||'')+'. Agente: '+(NOMBRES[agente]||agente)+'. Llave Maestra.');window.open('https://wa.me/549'+pr.tel.replace(/\D/g,'')+'?text='+msg,'_blank');},1000);}
  }
  cerrarModal('modal-visita');
};
window._delVisita = (id) => {if(!confirm('¿Eliminar?')) return;remove(ref(db,'visitas/'+id));};

window._editarVisita = (id) => {
  const v=visitas[id];
  if(!v) return;
  document.getElementById('v-edit-id').value=id;
  const t=document.getElementById('v-modal-title');if(t) t.textContent='Editar visita';
  const sp=document.getElementById('v-prop');
  if(sp) sp.innerHTML='<option value="">— Seleccioná —</option>'+Object.entries(propiedades).filter(([,p])=>p.estado!=='Vendida/Alquilada').map(([pid,p])=>'<option value="'+pid+'" '+(v.propiedadId===pid?'selected':'')+' >'+(p.titulo||p.direccion||'')+'</option>').join('');
  const sc=document.getElementById('v-cliente');
  if(sc) sc.innerHTML='<option value="">— Seleccioná —</option>'+Object.entries(consultas).filter(([,c])=>!['Cerrado','Sin interés'].includes(c.estado)).sort((a,b)=>(a[1].nombre||'').localeCompare(b[1].nombre||'')).map(([cid,c])=>'<option value="'+cid+'" '+(v.consultaId===cid?'selected':'')+' >'+(c.nombre||'Sin nombre')+(c.tel?' — '+c.tel:'')+'</option>').join('');
  document.getElementById('v-fecha').value=v.fecha||'';
  document.getElementById('v-hora').value=v.hora||'';
  document.getElementById('v-agente').value=v.agente||usuarioActivo||'';
  document.getElementById('v-obs').value=v.obs||'';
  document.getElementById('v-notif-cliente').checked=false;
  document.getElementById('v-notif-prop').checked=false;
  document.getElementById('modal-visita').classList.add('open');
};

// ============================================================
// ESTADÍSTICAS
// ============================================================
window._abrirStats = () => {
  const hoy=new Date();
  const mes=hoy.getMonth(),anio=hoy.getFullYear();
  const nomMes=hoy.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  const arr=Object.values(consultas);
  const delMes=arr.filter(c=>{const d=new Date(c.fecha);return d.getMonth()===mes&&d.getFullYear()===anio;});
  let html='<div style="font-size:12px;color:var(--gray-400);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">'+nomMes+'</div>';
  EQUIPO.forEach(m=>{
    const carg=delMes.filter(c=>c.cargadoPor===m).length;
    const asig=delMes.filter(c=>c.asignado===m).length;
    const cerr=arr.filter(c=>c.asignado===m&&['Cerrado','Reserva'].includes(c.estado)).length;
    html+='<div class="stats-row"><div style="font-size:14px;font-weight:600;color:'+COLORES[m]+'">'+NOMBRES[m]+'</div><div style="font-size:12px;color:var(--gray-600);text-align:right">Cargó: <b>'+carg+'</b> · Asignadas: <b>'+asig+'</b> · Cerradas: <b>'+cerr+'</b></div></div>';
  });
  const canales={};
  arr.forEach(c=>{if(c.canal)canales[c.canal]=(canales[c.canal]||0)+1;});
  const canArr=Object.entries(canales).sort((a,b)=>b[1]-a[1]);
  html+='<div style="margin-top:16px;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm)">'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">'+
    '<div style="text-align:center"><div class="stats-num">'+delMes.length+'</div><div style="font-size:11px;color:var(--gray-400)">Este mes</div></div>'+
    '<div style="text-align:center"><div class="stats-num">'+arr.filter(c=>!['Cerrado','Sin interés'].includes(c.estado)).length+'</div><div style="font-size:11px;color:var(--gray-400)">Activas</div></div>'+
    '<div style="text-align:center"><div class="stats-num" style="color:var(--green)">'+arr.filter(c=>c.estado==='Cerrado').length+'</div><div style="font-size:11px;color:var(--gray-400)">Cerradas</div></div>'+
    '<div style="text-align:center"><div class="stats-num">'+arr.filter(c=>c.estado==='Reserva').length+'</div><div style="font-size:11px;color:var(--gray-400)">Reservas</div></div>'+
    '</div>'+
    (canArr.length?'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400);margin-bottom:6px">Canal más efectivo</div>'+canArr.map(([c,n])=>'<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px"><span>'+c+'</span><b>'+n+'</b></div>').join(''):'')+'</div>';
  document.getElementById('stats-detalle').innerHTML=html;
  document.getElementById('stats-modal').classList.add('open');
};

// ============================================================
// NAVEGACIÓN
// ============================================================
window.switchSeccion = (s) => {
  seccion=s;
  document.querySelectorAll('.tab-main').forEach(t=>t.classList.remove('active'));
  const nav=document.getElementById('nav-'+s);if(nav) nav.classList.add('active');
  const sub=document.getElementById('subtabs');
  if(sub) sub.style.display=s==='consultas'?'flex':'none';
  document.getElementById('area-consultas').style.display=s==='consultas'?'block':'none';
  if(s==='consultas') renderLista();
  else if(s==='propiedades') renderPropiedades();
  else if(s==='propietarios') renderPropietarios();
  else if(s==='visitas') renderVisitas();
};

window.switchSubTab = (t) => {
  subTab=t;
  document.querySelectorAll('.subtab').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById('tab-'+t);if(el) el.classList.add('active');
  renderLista();
};

window.setFiltro = (estado,btn) => {
  filtroEstado=estado;
  document.querySelectorAll('.filter-pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  renderLista();
};

window.cerrarModal = (id) => document.getElementById(id).classList.remove('open');

window._addAmTag = (prefix) => {
  const inp=document.getElementById(prefix+'-am-custom-inp');
  const v=(inp?.value||'').trim();
  if(!v) return;
  const container=document.getElementById(prefix+'-am-custom-tags');
  if(!container) return;
  if([...container.children].some(el=>el.dataset.v===v)) return;
  const chip=document.createElement('div');
  chip.className='am-chip-custom';
  chip.dataset.v=v;
  chip.innerHTML=v+'<button onclick="this.parentElement.remove()" title="Quitar">✕</button>';
  container.appendChild(chip);
  if(inp) inp.value='';
};

function _collectAmenities(gridId,customId){
  const pre=[...document.querySelectorAll('#'+gridId+' .am-chip.sel')].map(el=>el.dataset.v);
  const cus=[...document.querySelectorAll('#'+customId+' .am-chip-custom')].map(el=>el.dataset.v);
  return [...pre,...cus];
}

function _restoreAmenities(amenities,gridId,customId){
  document.querySelectorAll('#'+gridId+' .am-chip').forEach(el=>el.classList.remove('sel'));
  const customContainer=document.getElementById(customId);
  if(customContainer) customContainer.innerHTML='';
  const known=new Set(Object.keys(AMENITY_INFO));
  (amenities||[]).forEach(a=>{
    const el=document.querySelector('#'+gridId+' .am-chip[data-v="'+a+'"]');
    if(el){el.classList.add('sel');}
    else if(a){
      const chip=document.createElement('div');
      chip.className='am-chip-custom';
      chip.dataset.v=a;
      chip.innerHTML=a+'<button onclick="this.parentElement.remove()" title="Quitar">✕</button>';
      if(customContainer) customContainer.appendChild(chip);
    }
  });
}

document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o) o.classList.remove('open');});
  o.addEventListener('touchmove',e=>e.stopPropagation(),{passive:true});
});

// Sticky tops dinámicos
function _updateStickyTops(){
  const hh=document.querySelector('.header')?.offsetHeight||65;
  const th=document.querySelector('.tabs-main')?.offsetHeight||48;
  document.documentElement.style.setProperty('--header-h',hh+'px');
  document.documentElement.style.setProperty('--subtabs-top',(hh+th)+'px');
}
_updateStickyTops();
if(typeof ResizeObserver!=='undefined'){
  new ResizeObserver(_updateStickyTops).observe(document.querySelector('.header'));
}

// SW
if('serviceWorker'in navigator) navigator.serviceWorker.register('/llave-maestra/sw.js').catch(()=>{});

// Google Maps
const _gmk=['AIzaSyCJA9M','qz_27Z4pRWiX','yuV9K1tgJsb27YKA'].join('');
const _gms=document.createElement('script');
_gms.src='https://maps.googleapis.com/maps/api/js?key='+_gmk+'&libraries=places&language=es&region=AR&loading=async';
document.head.appendChild(_gms);
