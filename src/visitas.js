import { st, NOMBRES, COLORES } from './state.js';
import { agRef, push, update, remove } from './firebase.js';

const cerrarModal = (id) => document.getElementById(id).classList.remove('open');

// VISITAS
// ============================================================
export function renderVisitas(){
  const lista=document.getElementById('lista');
  const hoy=new Date().toISOString().split('T')[0];
  const arr=Object.entries(st.visitas).map(([id,v])=>({...v,id})).sort((a,b)=>(a.fecha+a.hora)>(b.fecha+b.hora)?1:-1);
  const prox=arr.filter(v=>v.fecha>=hoy);
  const pas=arr.filter(v=>v.fecha<hoy);
  let html='<button class="btn-nueva" onclick="abrirNuevaVisita()">+ Agendar visita</button>';
  if(!arr.length){html+='<div class="empty"><div class="empty-svg"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div class="empty-title">Sin visitas</div><div class="empty-sub">Agendá la primera visita con el botón de arriba</div></div>';lista.innerHTML=html;return;}
  if(prox.length){html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400);margin-bottom:8px">PRÓXIMAS ('+prox.length+')</div>'+prox.map(v=>renderVisitaCard(v,hoy)).join('');}
  if(pas.length){html+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400);margin:16px 0 8px">REALIZADAS</div>'+pas.map(v=>renderVisitaCard(v,hoy,true)).join('');}
  lista.innerHTML=html;
}

function renderVisitaCard(v,hoy,pasada=false){
  const esHoy=v.fecha===hoy;
  const prop=v.propiedadId&&st.propiedades[v.propiedadId]?st.propiedades[v.propiedadId]:null;
  const cons=v.consultaId&&st.consultas[v.consultaId]?st.consultas[v.consultaId]:null;
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
  if(st.usuarioActivo) document.getElementById('v-agente').value=st.usuarioActivo;
  // Propiedades
  const sp=document.getElementById('v-prop');
  if(sp) sp.innerHTML='<option value="">— Seleccioná —</option>'+Object.entries(st.propiedades).filter(([,p])=>p.estado!=='Vendida/Alquilada').map(([id,p])=>'<option value="'+id+'">'+(p.titulo||p.direccion||'')+'</option>').join('');
  // Clientes
  const sc=document.getElementById('v-cliente');
  if(sc) sc.innerHTML='<option value="">— Seleccioná —</option>'+Object.entries(st.consultas).filter(([,c])=>!['Cerrado','Sin interés'].includes(c.estado)).sort((a,b)=>(a[1].nombre||'').localeCompare(b[1].nombre||'')).map(([id,c])=>'<option value="'+id+'">'+(c.nombre||'Sin nombre')+(c.tel?' — '+c.tel:'')+'</option>').join('');
  document.getElementById('modal-visita').classList.add('open');
};

window.guardarVisita = () => {
  const propId=document.getElementById('v-prop').value;
  const consId=document.getElementById('v-cliente').value;
  const fecha=document.getElementById('v-fecha').value;
  const hora=document.getElementById('v-hora').value;
  if(!fecha||!hora){window.toast('Ingresá fecha y hora','err');return;}
  const prop=propId&&st.propiedades[propId]?st.propiedades[propId]:null;
  const cons=consId&&st.consultas[consId]?st.consultas[consId]:null;
  const agente=document.getElementById('v-agente').value;
  const obs=document.getElementById('v-obs').value.trim();
  const fechaD=new Date(fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const editId=document.getElementById('v-edit-id').value;
  const datos={propiedadId:propId||null,propiedadTitulo:prop?.titulo||prop?.direccion||'',consultaId:consId||null,clienteNombre:cons?.nombre||'',fecha,hora,agente,obs};
  if(editId){ update(agRef('visitas',editId),datos); }
  else { push(agRef('visitas'),{...datos,cargadoPor:st.usuarioActivo,timestamp:Date.now()}); }
  if(document.getElementById('v-notif-cliente').checked&&cons?.tel){
    const msg=encodeURIComponent('Hola '+(cons.nombre||'')+'! Te confirmamos la visita para el '+fechaD+' a las '+hora+'hs a la propiedad '+(prop?.titulo||prop?.direccion||'')+'. Cualquier consulta estamos a tu disposición. Llave Maestra.');
    window.open('https://wa.me/549'+cons.tel.replace(/\D/g,'')+'?text='+msg,'_blank');
  }
  if(document.getElementById('v-notif-prop').checked&&prop?.propietarioId){
    const pr=st.propietarios[prop.propietarioId];
    if(pr?.tel){setTimeout(()=>{const msg=encodeURIComponent('Hola '+pr.nombre+'! El '+fechaD+' a las '+hora+'hs se realizará una visita a su propiedad '+(prop.titulo||prop.direccion||'')+'. Agente: '+(NOMBRES[agente]||agente)+'. Llave Maestra.');window.open('https://wa.me/549'+pr.tel.replace(/\D/g,'')+'?text='+msg,'_blank');},1000);}
  }
  cerrarModal('modal-visita');
};
window._delVisita = (id) => {if(!confirm('¿Eliminar?')) return;remove(agRef('visitas',id));};

window._editarVisita = (id) => {
  const v=st.visitas[id];
  if(!v) return;
  document.getElementById('v-edit-id').value=id;
  const t=document.getElementById('v-modal-title');if(t) t.textContent='Editar visita';
  const sp=document.getElementById('v-prop');
  if(sp) sp.innerHTML='<option value="">— Seleccioná —</option>'+Object.entries(st.propiedades).filter(([,p])=>p.estado!=='Vendida/Alquilada').map(([pid,p])=>'<option value="'+pid+'" '+(v.propiedadId===pid?'selected':'')+' >'+(p.titulo||p.direccion||'')+'</option>').join('');
  const sc=document.getElementById('v-cliente');
  if(sc) sc.innerHTML='<option value="">— Seleccioná —</option>'+Object.entries(st.consultas).filter(([,c])=>!['Cerrado','Sin interés'].includes(c.estado)).sort((a,b)=>(a[1].nombre||'').localeCompare(b[1].nombre||'')).map(([cid,c])=>'<option value="'+cid+'" '+(v.consultaId===cid?'selected':'')+' >'+(c.nombre||'Sin nombre')+(c.tel?' — '+c.tel:'')+'</option>').join('');
  document.getElementById('v-fecha').value=v.fecha||'';
  document.getElementById('v-hora').value=v.hora||'';
  document.getElementById('v-agente').value=v.agente||st.usuarioActivo||'';
  document.getElementById('v-obs').value=v.obs||'';
  document.getElementById('v-notif-cliente').checked=false;
  document.getElementById('v-notif-prop').checked=false;
  document.getElementById('modal-visita').classList.add('open');
};

// ============================================================
// ============================================================
