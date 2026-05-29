import { st, CLOUD, NOMBRES, AMENITY_INFO } from './state.js';
import { agRef, push, update, remove } from './firebase.js';
import { geminiCall } from './gemini.js';
import { _amLabel, _propLabel } from './utils.js';

const cerrarModal = (id) => document.getElementById(id).classList.remove('open');

function _collectAmenities(gridId,customId){
  const pre=[...document.querySelectorAll('#'+gridId+' .am-chip.sel')].map(el=>el.dataset.v);
  const cus=[...document.querySelectorAll('#'+customId+' .am-chip-custom')].map(el=>el.dataset.v);
  return [...pre,...cus];
}

function _restoreAmenities(amenities,gridId,customId){
  document.querySelectorAll('#'+gridId+' .am-chip').forEach(el=>el.classList.remove('sel'));
  const customContainer=document.getElementById(customId);
  if(customContainer) customContainer.innerHTML='';
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

let fotosSubidas = [], propDirCompleta = '', propCiudad = '';
let lbFotos = [], lbIdx = 0;
let _editFotos = [];
let autocomplete = null;
let _mejoraContainer = null, _mejoraOrigUrl = '', _mejState = {embellecer:false, despejar:false};

// PROPIEDADES
// ============================================================

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
  status.textContent='Conectando con el portal...';
  resultado.style.display='none';

  try {
    // PASO 1: fetch del HTML via Firebase Function propia (sin CORS, headers reales)
    let html='';
    const timeout=(ms)=>new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms));
    const FETCH_PORTAL_URL='https://us-central1-llave-maestra.cloudfunctions.net/fetchPortal';
    try {
      const r=await Promise.race([
        fetch(FETCH_PORTAL_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})}),
        timeout(20000)
      ]);
      const d=await r.json();
      html=d.html||'';
    } catch(e){ html=''; console.log('fetchPortal falló:',e.message); }
    // Fallback a proxies externos si la función propia falla
    if(html.length<1000){
      const proxies=[
        ()=>fetch('https://corsproxy.io/?'+encodeURIComponent(url)).then(r=>r.text()),
        ()=>fetch('https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(url)).then(r=>r.text()),
      ];
      for(const proxy of proxies){
        try { html=await Promise.race([proxy(),timeout(12000)]); if(html&&html.length>1000) break; html=''; }
        catch(e){ html=''; }
      }
    }
    if(html.length<1000) throw new Error('No se pudo leer la publicación. El portal puede tener protección. Probá con otra URL o copiá la URL directamente del navegador.');

    status.textContent='🔍 Analizando con IA...';

    // PASO 2: limpiar HTML y extraer texto + imágenes
    const parser=new DOMParser();
    const doc=parser.parseFromString(html,'text/html');
    // Extraer JSON-LD ANTES de borrar scripts (ZonaProp/Argenprop guardan datos ahí)
    let jsonLdTexto='';
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(el=>{
      try{ const d=JSON.parse(el.textContent||''); jsonLdTexto+=JSON.stringify(d)+'\n'; }catch(e){}
    });
    // Extraer también cualquier JSON de window.__INITIAL_STATE__ o similar
    let initState='';
    doc.querySelectorAll('script:not([src])').forEach(el=>{
      const t=el.textContent||'';
      if(t.includes('price')||t.includes('precio')||t.includes('ambientes')||t.includes('dormitorio')){
        const m=t.match(/\{[\s\S]{100,}\}/);
        if(m) initState+=(m[0].substring(0,3000)+'\n');
      }
    });
    doc.querySelectorAll('script,style,nav,footer,header,iframe,noscript').forEach(el=>el.remove());
    const textoVisible=(doc.body?.innerText||'').replace(/\n{3,}/g,'\n\n').trim().substring(0,5000);
    const texto=(jsonLdTexto+initState+textoVisible).substring(0,10000);

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
      status.textContent='Importando fotos (0/'+maxFotos+')...';
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
            div.innerHTML='<img src="'+ud.secure_url+'" style="width:68px;height:68px;object-fit:cover;border-radius:6px;display:block">'+
              '<button onclick="window.quitarFoto('+idx+',this.parentElement)" style="position:absolute;top:-4px;right:-4px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer">&#x2715;</button>'+
              '<button onclick="window.abrirMejoraFoto(this.parentElement)" style="position:absolute;bottom:0;left:0;right:0;background:rgba(99,22,163,.82);color:#fff;border:none;border-radius:0 0 6px 6px;font-size:9px;font-weight:700;padding:3px 2px;cursor:pointer;font-family:\'DM Sans\',sans-serif">✨ Editar con IA</button>';
            preview.appendChild(div);
            status.textContent='Importando fotos ('+subidas+'/'+maxFotos+')...';
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
  if(iaBtn){iaBtn.disabled=true;iaBtn.textContent='Generando...';}
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
  for(const file of files){
    const tmpId='tmp-'+Math.random().toString(36).substr(2,6);
    const reader=new FileReader();
    reader.onload=e=>{
      const div=document.createElement('div');
      div.style.cssText='position:relative;display:inline-block';
      div.id=tmpId;
      div.innerHTML='<img src="'+e.target.result+'" style="width:68px;height:68px;object-fit:cover;border-radius:6px;opacity:0.5"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;background:rgba(0,0,0,.4);border-radius:6px">···</div>';
      preview.appendChild(div);
    };
    reader.readAsDataURL(file);
    try {
      const fd=new FormData();
      fd.append('file',file);
      fd.append('upload_preset',CLOUD.preset);
      const r=await fetch('https://api.cloudinary.com/v1_1/'+CLOUD.name+'/image/upload',{method:'POST',body:fd});
      const d=await r.json();
      const url=d.secure_url;
      fotosSubidas.push(url);
      const el=document.getElementById(tmpId);
      if(el){
        const idx=fotosSubidas.length-1;
        el.className='foto-container';
        el.innerHTML='<img src="'+url+'" style="width:68px;height:68px;object-fit:cover;border-radius:6px;display:block">'+
          '<button onclick="window.quitarFoto('+idx+',this.parentElement)" style="position:absolute;top:-4px;right:-4px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'+
          '<button onclick="window.abrirMejoraFoto(this.parentElement)" style="position:absolute;bottom:0;left:0;right:0;background:rgba(99,22,163,.82);color:#fff;border:none;border-radius:0 0 6px 6px;font-size:9px;font-weight:700;padding:3px 2px;cursor:pointer;font-family:\'DM Sans\',sans-serif">✨ Editar con IA</button>';
      }
    } catch(e){console.log('Error foto:',e);}
  }
  input.value='';
};

window.quitarFoto = (idx,el) => {fotosSubidas.splice(idx,1);el.remove();};

// ========= MEJORA DE FOTOS =========

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

export function actualizarSelPropietarios(){
  ['p-propietario','v-prop-owner','edit-propietario'].forEach(selId=>{
    const sel=document.getElementById(selId);
    if(!sel) return;
    const opts=Object.entries(st.propietarios).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre))
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
  push(agRef('propiedades'),{
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
    cargadoPor:st.usuarioActivo
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

window._cambiarEstadoProp = (id,estado) => update(agRef('propiedades',id),{estado});
window._delProp = (id) => {if(!confirm('¿Eliminar propiedad?')) return;remove(agRef('propiedades',id));};

// ============================================================
// RENDER PROPIEDADES
// ============================================================
export function renderPropiedades(){
  const lista=document.getElementById('lista');
  const arr=Object.entries(st.propiedades).map(([id,p])=>({...p,id}));
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
  if(!arr.length){html+='<div class="empty"><div class="empty-svg"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div><div class="empty-title">Sin propiedades</div><div class="empty-sub">Cargá la primera propiedad con el botón de arriba</div></div>';lista.innerHTML=html;return;}
  if(!filtered.length){html+='<div class="empty"><div class="empty-svg"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div><div class="empty-title">Sin resultados</div><div class="empty-sub">Probá con otros filtros o términos de búsqueda</div></div>';lista.innerHTML=html;return;}
  html+='<div class="prop-grid">'+filtered.map(p=>{
    const todasFotos=p.fotos?.length?p.fotos:p.foto?[p.foto]:[];
    const estadoCls=p.estado==='Disponible'?'prop-disponible':p.estado==='Reservada'?'prop-reservada':'prop-vendida';
    const pr=st.propietarios[p.propietarioId];
    return '<div class="prop-ficha" onclick="window.abrirFichaProp(\''+p.id+'\')">'+
      '<span class="prop-estado-badge '+estadoCls+'">'+(p.estado||'Disponible')+'</span>'+
      (todasFotos.length?
        '<div class="prop-cover"><img src="'+todasFotos[0]+'" loading="lazy"></div>':
        '<div class="prop-foto-placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>Sin fotos</div>')+
      '<div class="prop-body">'+
      '<div class="prop-operacion">'+(p.tipo||'')+' · '+(p.operacion||'')+(p.barrio?' · '+p.barrio:'')+'</div>'+
      '<div class="prop-titulo">'+(p.titulo||p.direccion||'')+'</div>'+
      '<div class="prop-precio">'+(p.precio||'')+'</div>'+
      (p.ambientes?'<div class="prop-info">'+(p.ambientes+' amb')+(p.dormitorios?' · '+p.dormitorios+' dorm.':'')+(p.supCubierta?' · '+p.supCubierta+'m²':p.supTotal?' · '+p.supTotal+'m²':'')+'</div>':'')+
      (p.amenities?.length?'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">'+p.amenities.slice(0,3).map(a=>'<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--gray-100);color:#475569;font-weight:600">'+_amLabel(a)+'</span>').join('')+(p.amenities.length>3?'<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--gray-100);color:var(--gray-400);font-weight:600">+'+( p.amenities.length-3)+'</span>':'')+'</div>':'')+
      (pr?'<div class="prop-propietario">'+pr.nombre+'</div>':'')+
      '<div class="prop-action-row" onclick="event.stopPropagation()">'+
      '<select onchange="window._cambiarEstadoProp(\''+p.id+'\',this.value)" style="flex:1;padding:6px 8px;border:1.5px solid var(--gray-200);border-radius:6px;font-size:12px;font-family:\'DM Sans\',sans-serif;color:var(--black);background:#fff">'+
      '<option '+(p.estado==='Disponible'?'selected':'')+'>Disponible</option>'+
      '<option '+(p.estado==='Reservada'?'selected':'')+'>Reservada</option>'+
      '<option '+(p.estado==='Vendida/Alquilada'?'selected':'')+'>Vendida/Alquilada</option>'+
      '</select>'+
      '<button onclick="window._delProp(\''+p.id+'\')" style="padding:6px 10px;background:var(--red-light);color:var(--red);border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center"><svg xmlns=\'http://www.w3.org/2000/svg\' width=\'13\' height=\'13\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M3 6h18\'/><path d=\'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\'/><path d=\'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\'/></svg></button>'+
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
  const p = st.propiedades[id];
  if(!p) return;
  const todasFotos = p.fotos?.length ? p.fotos : p.foto ? [p.foto] : [];
  const ams = (p.amenities||[]).map(a => '<span class="ficha-amenity">'+_amLabel(a)+'</span>').join('');
  const shareUrl = window.location.origin + '/?prop='+id;
  
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
    '<button id="btn-match-inv-'+id+'" onclick="window.matchingInverso(\''+id+'\')" style="width:100%;margin-bottom:10px;padding:11px;background:var(--purple-light);border:1.5px solid var(--purple);border-radius:var(--radius-sm);font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;color:var(--purple);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px"><svg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\'/><circle cx=\'9\' cy=\'7\' r=\'4\'/><path d=\'M23 21v-2a4 4 0 0 0-3-3.87\'/><path d=\'M16 3.13a4 4 0 0 1 0 7.75\'/></svg>¿A quién le recomiendo esta propiedad?</button>'+
    '<div id="matching-inv-'+id+'" style="margin-bottom:10px"></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:10px">'+
    '<button onclick="window._abrirEditarProp(\''+id+'\');event.stopPropagation()" style="flex:1;padding:11px;background:var(--gray-100);border:1.5px solid var(--gray-200);border-radius:var(--radius-sm);font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;color:var(--gray-600);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px"><svg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\'/><path d=\'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z\'/></svg>Editar</button>'+
    '<button onclick="compartirPropiedad(\''+id+'\');event.stopPropagation()" style="flex:1;padding:11px;background:var(--blue-light);border:1.5px solid var(--blue);border-radius:var(--radius-sm);font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;color:var(--blue);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px"><svg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8\'/><polyline points=\'16 6 12 2 8 6\'/><line x1=\'12\' y1=\'2\' x2=\'12\' y2=\'15\'/></svg>Compartir</button>'+
    '</div>'+
    '<div class="btn-row"><button class="btn-primary" onclick="cerrarModal(\'modal-ficha-prop\')">Cerrar</button></div>';

  document.getElementById('modal-ficha-prop').classList.add('open');
};

// Matching inverso: dada una propiedad, encontrar st.consultas compatibles
window.matchingInverso = async (propId) => {
  const btn = document.getElementById('btn-match-inv-'+propId);
  const divRes = document.getElementById('matching-inv-'+propId);
  if(btn) { btn.textContent = 'Analizando clientes...'; btn.disabled = true; }
  if(divRes) divRes.innerHTML = '';

  const p = st.propiedades[propId];
  if(!p) {
    if(btn) { btn.innerHTML = '<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\'/><circle cx=\'9\' cy=\'7\' r=\'4\'/><path d=\'M23 21v-2a4 4 0 0 0-3-3.87\'/><path d=\'M16 3.13a4 4 0 0 1 0 7.75\'/></svg> ¿A quién le recomiendo esta propiedad?'; btn.disabled = false; }
    return;
  }

  // Incluir clientes activos con obs O con notas
  const consActivas = Object.entries(st.consultas)
    .filter(([,c]) => !['Cerrado','Sin interés'].includes(c.estado))
    .filter(([,c]) => c.obs || Object.keys(c.notas||{}).length > 0);

  if(!consActivas.length) {
    if(divRes) divRes.innerHTML = '<div style="font-size:13px;color:var(--gray-400);padding:8px 0;text-align:center">No hay clientes activos con información de búsqueda.</div>';
    if(btn) { btn.innerHTML = '<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\'/><circle cx=\'9\' cy=\'7\' r=\'4\'/><path d=\'M23 21v-2a4 4 0 0 0-3-3.87\'/><path d=\'M16 3.13a4 4 0 0 1 0 7.75\'/></svg> ¿A quién le recomiendo esta propiedad?'; btn.disabled = false; }
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
        '<div style="font-size:12px;font-weight:700;color:var(--purple);margin-bottom:10px">Clientes que podrían estar interesados:</div>'+
        result.matches.map(match => {
          const c = st.consultas[match.id];
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
  const p = st.propiedades[id];
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
  update(agRef('propiedades',id), {
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
      '<button onclick="window.abrirMejoraFoto(this.parentElement)" style="position:absolute;bottom:0;left:0;right:0;background:rgba(99,22,163,.82);color:#fff;border:none;border-radius:0 0 6px 6px;font-size:9px;font-weight:700;padding:3px 2px;cursor:pointer;font-family:\'DM Sans\',sans-serif">✨ Editar con IA</button>'+
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
  const p=st.propiedades[id];
  if(!p) return;
  const loading=document.getElementById('edit-ia-loading');
  const btn=document.getElementById('edit-desc-ia-btn');
  if(loading) loading.style.display='block';
  if(btn){btn.disabled=true;btn.textContent='Generando...';}
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
  const url = window.location.origin + '/propiedad/' + st.agenciaId + '/' + id;
  if(navigator.share) {
    const p = st.propiedades[id];
    navigator.share({ title: p?.titulo || p?.direccion || 'Propiedad', url });
  } else if(navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      const t = document.createElement('div');
      t.textContent = '¡Link copiado!';
      t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1c1917;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;font-family:\'DM Sans\',sans-serif';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2000);
    });
  } else {
    prompt('Copiá este link:', url);
  }
};

// Legacy: links viejos con ?prop= redirigen al nuevo formato
const urlParams = new URLSearchParams(window.location.search);
const propParam = urlParams.get('prop');
if (propParam && st.agenciaId) {
  window.location.replace(window.location.origin + '/propiedad/' + st.agenciaId + '/' + propParam);
}

window.abrirLightbox = (fotosOrId,idx) => {
  if(typeof fotosOrId==='string'){
    lbFotos=fotosOrId==='__edit'?_editFotos:
      (st.propiedades[fotosOrId]?.fotos?.length?st.propiedades[fotosOrId].fotos:
       st.propiedades[fotosOrId]?.foto?[st.propiedades[fotosOrId].foto]:[]);
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

