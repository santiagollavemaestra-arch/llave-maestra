import { st, EQUIPO, NOMBRES, COLORES, CHECKS, DIAS, AMENITY_INFO } from './state.js';
import { agRef, push, update, remove } from './firebase.js';
import { geminiCall } from './gemini.js';
import { diasDesde, ultimoCheck, countdownInfo, sigRotacion, _amLabel, _propLabel } from './utils.js';

const cerrarModal = (id) => document.getElementById(id).classList.remove('open');
let _alarmasExpanded = true;

// ============================================================
export function render(){
  renderRotacion(); renderStats(); renderCounts(); renderAlarmas(); renderVisitasHoy();
  if(st.seccion==='consultas') renderLista();
}

export function renderVisitasHoy(){
  const hoy=new Date().toISOString().split('T')[0];
  const visitasHoy=Object.values(st.visitas).filter(v=>v.fecha===hoy);
  const el=document.getElementById('alarmas');
  if(!el||!visitasHoy.length) return;
  const banner='<div style="background:var(--blue-light);border:1.5px solid var(--blue);border-radius:var(--radius-sm);padding:12px;margin-bottom:10px">'+
    '<div style="font-size:12px;font-weight:700;color:var(--blue);margin-bottom:6px">📅 Visitas de hoy ('+visitasHoy.length+')</div>'+
    visitasHoy.map(v=>{
      const prop=v.propiedadId&&st.propiedades[v.propiedadId]?st.propiedades[v.propiedadId]:null;
      const cons=v.consultaId&&st.consultas[v.consultaId]?st.consultas[v.consultaId]:null;
      return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:4px 0;border-top:1px solid rgba(26,74,138,.15)">'+
        '<span><b>'+v.hora+'hs</b> — '+(prop?.titulo||prop?.direccion||v.propiedadTitulo||'Sin propiedad')+'</span>'+
        '<span style="color:var(--blue);font-size:12px">'+(cons?.nombre||v.clienteNombre||'Sin cliente')+'</span>'+
      '</div>';
    }).join('')+
  '</div>';
  el.innerHTML=banner+el.innerHTML;
}

export function renderRotacion(){
  const sig=sigRotacion();
  const cnt={};
  EQUIPO.forEach(m=>cnt[m]=Object.values(st.consultas).filter(c=>c.asignado===m).length);
  document.getElementById('rot-list').innerHTML=EQUIPO.map(m=>`
    <div class="rot-item">
      <div class="rot-av" style="background:${COLORES[m]}">${NOMBRES[m][0]}</div>
      <div class="rot-name">${NOMBRES[m]}</div>
      <div class="rot-cnt" style="color:${COLORES[m]}">${cnt[m]}</div>
      ${m===sig?'<div class="rot-sig">SIGUIENTE</div>':''}
    </div>`).join('');
}

export function renderStats(){
  const arr=Object.values(st.consultas);
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

export function renderCounts(){
  const arr=Object.values(st.consultas);
  const act=arr.filter(c=>!['Cerrado','Sin interés'].includes(c.estado));
  document.getElementById('cnt-todas').textContent=act.length+' activas';
  EQUIPO.forEach(m=>{
    const n=act.filter(c=>c.asignado===m).length;
    document.getElementById('cnt-'+m).textContent=n+(n===1?' activa':' activas');
  });
}

export function renderAlarmas(){
  const venc=Object.entries(st.consultas).map(([id,c])=>({...c,id}))
    .filter(c=>c.asignado===st.usuarioActivo)
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

export function renderLista(){
  const lista=document.getElementById('lista');
  let arr=Object.entries(st.consultas).map(([id,c])=>({...c,id}));
  if(st.subTab!=='todas') arr=arr.filter(c=>c.asignado===st.subTab);
  if(st.filtroEstado!=='todos') arr=arr.filter(c=>(c.estado||'Activo')===st.filtroEstado);
  const q=(document.getElementById('search-input')?.value||'').toLowerCase();
  if(q) arr=arr.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.propiedad||'').toLowerCase().includes(q)||(c.instagram||'').toLowerCase().includes(q)||(c.tel||'').replace(/\D/g,'').includes(q.replace(/\D/g,'')));
  arr.sort((a,b)=>{
    const ia=countdownInfo(a),ib=countdownInfo(b);
    const ua=ia?.tipo==='vencida'?0:ia?.tipo==='warn'?1:2;
    const ub=ib?.tipo==='vencida'?0:ib?.tipo==='warn'?1:2;
    if(ua!==ub) return ua-ub;
    return (b.fecha||0)-(a.fecha||0);
  });
  if(!arr.length){lista.innerHTML='<div class="empty"><div class="empty-svg"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg></div><div class="empty-title">Sin consultas</div><div class="empty-sub">Las consultas nuevas aparecerán acá</div></div>';return;}
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
        (c.propiedad?c.propiedad:'')+
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
  const c={...st.consultas[id],id};
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
    (st.usuarioRol==='admin'?'<button class="btn-danger" onclick="window._delConsulta(\''+id+'\')">🗑 Eliminar consulta</button>':'<div style="font-size:12px;color:var(--gray-400);text-align:center;margin-top:10px">Solo el administrador puede eliminar</div>')+
    '<div class="btn-row"><button class="btn-primary" onclick="cerrarModal(\'modal-detalle\')">Cerrar</button></div>';

  document.getElementById('modal-detalle').classList.add('open');
};

// ============================================================
// MATCHING IA - solo cuando se pide
// ============================================================
window._matchingConsulta = (id) => {
  const c = st.consultas[id];
  if(!c) return;
  const btn = document.querySelector('[onclick="window._matchingConsulta(\''+id+'\')"]');
  if(btn) { btn.textContent = '⏳ Analizando...'; btn.disabled = true; }
  generarMatchingIA(id, c);
};

async function generarMatchingIA(id,c){
  if(st.matchCache[id]){
    const el=document.getElementById('matching-'+id);
    if(el) el.outerHTML=st.matchCache[id];
    return;
  }
  const disp=Object.entries(st.propiedades).filter(([,p])=>p.estado!=='Vendida/Alquilada')
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
        const p=st.propiedades[m.id];
        if(!p) return '';
        return '<div class="matching-item"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">'+
          '<div><div class="matching-prop-titulo">'+(p.titulo||p.direccion||'')+'</div>'+
          '<div class="matching-prop-precio">'+(p.precio||'')+' — '+(p.operacion||'')+(p.barrio?' · '+p.barrio:'')+'</div></div>'+
          '<span class="matching-score">'+m.score+'% compatible</span></div>'+
          '<div style="font-size:11px;color:var(--purple);font-style:italic">'+m.razon+'</div></div>';
      }).join('')+'</div>';
    st.matchCache[id]=html;
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
  const c=st.consultas[id];
  if(!c) return;
  const box=document.getElementById('resp-box-'+id);
  const txt=document.getElementById('resp-txt-'+id);
  const waBtn=document.getElementById('resp-wa-'+id);
  if(!box||!txt) return;
  box.style.display='block';
  txt.textContent='Generando...';
  const prop=Object.values(st.propiedades).find(p=>c.propiedad&&(p.titulo||p.direccion||'').toLowerCase().includes((c.propiedad||'').toLowerCase().split(',')[0]));
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
  const val=!(st.consultas[id]?.checks?.[key]);
  const up={};
  up['checks/'+key]=val;
  up['checkTs/'+key]=val?Date.now():null;
  update(agRef('consultas',id),up);
  const idx=CHECKS.findIndex(x=>x.key===key);
  el.className='pipeline-step'+(key==='res'&&val?' done-res':val?' done':'');
  const dot=el.querySelector('.pipeline-dot');
  if(dot) dot.textContent=val?'✓':(idx+1);
  const ts=el.querySelector('.pipeline-ts');
  if(ts) ts.textContent=val?'Ahora':'Pendiente';
};
window._updField = (id,campo,val) => update(agRef('consultas',id),{[campo]:val});
window._resetCountdown = (id) => {
  const now=Date.now();
  update(agRef('consultas',id),{lastReset:now});
  if(st.consultas[id]) st.consultas[id].lastReset=now;
  window._abrirDetalle(id);
};
window._editNombre = (id) => {
  const n=prompt('Nombre:',st.consultas[id]?.nombre||'');
  if(!n?.trim()) return;
  update(agRef('consultas',id),{nombre:n.trim()});
  const el=document.getElementById('det-nombre');if(el) el.textContent=n.trim();
};
window._editTel = (id) => {
  const n=prompt('Teléfono:',st.consultas[id]?.tel||'');
  if(n===null) return;
  if(st.consultas[id]) st.consultas[id].tel=n.trim();
  update(agRef('consultas',id),{tel:n.trim()});
  window._abrirDetalle(id);
};
window._editIG = (id) => {
  const n=prompt('Instagram:',st.consultas[id]?.instagram||'');
  if(n===null) return;
  update(agRef('consultas',id),{instagram:n.trim()});
  const el=document.getElementById('det-ig');if(el) el.textContent=n.trim()||'—';
};
window._editObs = (id) => {
  const n=prompt('¿Qué busca?',st.consultas[id]?.obs||'');
  if(n===null) return;
  if(st.consultas[id]) st.consultas[id].obs=n.trim();
  update(agRef('consultas',id),{obs:n.trim()});
  window._abrirDetalle(id);
};
window._editPropiedad = (id) => {
  const n=prompt('Propiedad consultada:',st.consultas[id]?.propiedad||'');
  if(n===null) return;
  if(st.consultas[id]) st.consultas[id].propiedad=n.trim();
  update(agRef('consultas',id),{propiedad:n.trim()});
  window._abrirDetalle(id);
};
window._editCanal = (id) => {
  const n=prompt('Canal:',st.consultas[id]?.canal||'');
  if(n===null) return;
  if(st.consultas[id]) st.consultas[id].canal=n.trim();
  update(agRef('consultas',id),{canal:n.trim()});
  window._abrirDetalle(id);
};
window._addNota = (id) => {
  const inp=document.getElementById('nota-inp-'+id);
  const txt=inp?.value?.trim();
  if(!txt||!st.usuarioActivo) return;
  push(agRef('consultas',id,'notas'),{texto:txt,autor:st.usuarioActivo,fecha:Date.now()});
  if(inp) inp.value='';
};
window._editNota = (cId,nId,btn) => {
  const cur=btn.closest('.nota-item').querySelector('.nota-txt').textContent;
  const n=prompt('Editar nota:',cur);
  if(!n?.trim()) return;
  update(agRef('consultas',cId,'notas',nId),{texto:n.trim()});
  setTimeout(()=>window._abrirDetalle(cId),300);
};
window._delNota = (cId,nId) => {
  if(!confirm('¿Eliminar nota?')) return;
  remove(agRef('consultas',cId,'notas',nId));
  setTimeout(()=>window._abrirDetalle(cId),300);
};
window._delConsulta = (id) => {
  if(st.usuarioRol!=='admin'){window.toast('Solo el administrador puede eliminar.','err');return;}
  if(!confirm('¿Eliminar esta consulta? Esta acción no se puede deshacer.')) return;
  remove(agRef('consultas',id));
  cerrarModal('modal-detalle');
};

// ============================================================
// NUEVA CONSULTA
// ============================================================

export function actualizarSelPropiedades(){
  const sel=document.getElementById('c-propiedad-sel');
  if(!sel) return;
  const q=(document.getElementById('c-prop-buscar')?.value||'').toLowerCase().trim();
  const opts=Object.entries(st.propiedades).filter(([,p])=>p.estado!=='Vendida/Alquilada')
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

window._addExtraTag = (prefix) => {
  prefix=prefix||'obs';
  const inp = document.getElementById(prefix+'-extra-new');
  if(!inp) return;
  const v = inp.value.trim();
  if(!v) return;
  const cont = document.getElementById(prefix+'-extras-custom');
  if(!cont) return;
  const tag = document.createElement('span');
  tag.className = 'am-chip-custom';
  tag.dataset.v = v;
  tag.innerHTML = v + '<button type="button" onclick="window._delExtraTag(this.parentElement)">×</button>';
  cont.appendChild(tag);
  inp.value = '';
};

window._delExtraTag = (el) => { if(el) el.remove(); };

function _buildObs(prefix){
  prefix=prefix||'obs';
  const $=id=>document.getElementById(prefix+'-'+id);
  const selPill=cid=>document.querySelector('#'+prefix+'-'+cid+' .obs-pill.sel');
  const busca={op:'',tipo:'',tipoOtro:'',amb:'',zona:'',precio:'',moneda:'USD',extras:[],extrasCustom:[],nota:''};
  const parts=[];
  const opEl=selPill('op'); if(opEl){busca.op=opEl.dataset.v;parts.push(busca.op);}
  const tipoEl=selPill('tipo');
  if(tipoEl){busca.tipo=tipoEl.dataset.v;parts.push(busca.tipo);}
  else{const to=($('tipo-otro')?.value||'').trim();if(to){busca.tipoOtro=to;parts.push(to);}}
  const ambEl=selPill('amb'); if(ambEl){busca.amb=ambEl.dataset.v;parts.push(busca.amb+' amb.');}
  const zona=($('zona')?.value||'').trim(); if(zona){busca.zona=zona;parts.push('Zona '+zona);}
  const precioRaw=($('precio')?.value||'').replace(/\D/g,'');
  const mon=$('moneda')?.value||'USD'; busca.moneda=mon;
  if(precioRaw){busca.precio=precioRaw;parts.push('Hasta '+mon+' '+parseInt(precioRaw).toLocaleString('es-AR'));}
  const extras=[...document.querySelectorAll('#'+prefix+'-extras .obs-pill.sel')].map(el=>el.dataset.v);
  const extrasCustom=[...document.querySelectorAll('#'+prefix+'-extras-custom .am-chip-custom')].map(el=>el.dataset.v);
  busca.extras=extras; busca.extrasCustom=extrasCustom;
  const todosExtras=[...extras,...extrasCustom];
  if(todosExtras.length) parts.push('Con '+todosExtras.join(', '));
  const nota=($('extra-txt')?.value||'').trim(); if(nota){busca.nota=nota;parts.push(nota);}
  return {obs:parts.join(' · '), busca};
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
  if(!nombre){window.toast('Ingresá el nombre','err');return;}
  const telInput=document.getElementById('c-tel').value.trim();
  if(telInput){
    const telN=telInput.replace(/\D/g,'');
    const dup=Object.values(st.consultas).find(c=>(c.tel||'').replace(/\D/g,'')===telN&&telN.length>5);
    if(dup&&!confirm('⚠️ Ya existe una consulta con ese teléfono ('+dup.nombre+'). ¿Guardás igual?')) return;
  }
  const selVal=document.getElementById('c-propiedad-sel').value;
  const propiedad=selVal==='__manual__'?document.getElementById('c-propiedad-manual').value.trim():decodeURIComponent(selVal);
  const asigSel=document.getElementById('c-asignado').value;
  const asignado=asigSel==='auto'?sigRotacion():asigSel;
  const {obs,busca}=_buildObs('obs');
  push(agRef('consultas'),{nombre,asignado,propiedad,
    tel:telInput,
    instagram:document.getElementById('c-instagram').value.trim(),
    canal:document.getElementById('c-canal').value,
    obs, busca,
    fecha:Date.now(),estado:'Activo',checks:{},checkTs:{},cargadoPor:st.usuarioActivo
  });
  cerrarModal('modal-consulta');
};

