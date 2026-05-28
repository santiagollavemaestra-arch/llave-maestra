import './style.css';
import { st } from './state.js';
import { agRef, onValue } from './firebase.js';
import { initAuth, mostrarPerfil, enviarMail, enviarNotifPush, pedirNotif } from './auth.js';
import { render, renderLista, actualizarSelPropiedades } from './consultas.js';
import { renderPropiedades, actualizarSelPropietarios } from './propiedades.js';
import { renderPropietarios } from './propietarios.js';
import { renderVisitas } from './visitas.js';

// ── Firebase listeners (arrancan solo después del login) ──
let listenersStarted = false;
let primeraVez = true, consAnteriores = {};

function startListeners() {
  if(listenersStarted) return;
  listenersStarted = true;
  onValue(agRef('emails'), s => { st.emails=s.val()||{}; window._emails=st.emails; });
  onValue(agRef('propietarios'), s => { st.propietarios=s.val()||{}; actualizarSelPropietarios(); if(st.seccion==='propietarios') renderPropietarios(); });
  onValue(agRef('propiedades'), s => { st.propiedades=s.val()||{}; st.matchCache={}; actualizarSelPropiedades(); if(st.seccion==='propiedades') renderPropiedades(); });
  onValue(agRef('visitas'), s => { st.visitas=s.val()||{}; if(st.seccion==='visitas') renderVisitas(); });
  onValue(agRef('consultas'), s => {
    const nuevas = s.val()||{};
    if(!primeraVez){
      Object.entries(nuevas).forEach(([id,c])=>{
        if(!consAnteriores[id]){
          enviarMail(c.asignado, c.nombre, c.propiedad);
          enviarNotifPush('\uD83D\uDCCB Nueva consulta', (c.nombre||'Sin nombre')+' \u2014 '+(c.propiedad||''));
        }
      });
    }
    consAnteriores={...nuevas};
    st.consultas=nuevas;
    primeraVez=false;
    render();
    document.getElementById('loading').classList.add('hidden');
  });
}

// ── Auth ──
initAuth(
  () => {
    document.getElementById('user-screen').classList.add('oculto');
    document.getElementById('cambiar-wrap').classList.add('visible');
    mostrarPerfil();
    pedirNotif();
    startListeners();
  },
  () => {
    listenersStarted = false;
    primeraVez = true;
    consAnteriores = {};
    document.getElementById('user-screen').classList.remove('oculto');
    document.getElementById('cambiar-wrap').classList.remove('visible');
    document.getElementById('loading').classList.add('hidden');
    const ph = document.getElementById('perfil-header');
    if(ph) ph.style.display = 'none';
  }
);

// ── Stats ──
// ESTADÍSTICAS
// ============================================================
window._abrirStats = () => {
  const hoy=new Date();
  const mes=hoy.getMonth(),anio=hoy.getFullYear();
  const nomMes=hoy.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  const arr=Object.values(st.consultas);
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

// ── Navegación ──
// NAVEGACIÓN
// ============================================================
window.switchSeccion = (s) => {
  st.seccion=s;
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
  st.subTab=t;
  document.querySelectorAll('.subtab').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById('tab-'+t);if(el) el.classList.add('active');
  renderLista();
};

window.setFiltro = (estado,btn) => {
  st.filtroEstado=estado;
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

