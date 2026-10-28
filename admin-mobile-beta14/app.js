// A.R.D. Catalog Builder Mobile — v1.4.0 TEST SEPARATA, senza scrittura GitHub
// Modalità prova: soltanto lettura GitHub, bozza sul dispositivo e esportazione backup.
// Questa versione NON include chiamate POST/PATCH verso GitHub, né token.
const REPO='alessandro80ard/ard-digital-catalog';
const TEST_MODE=true;
const BRANCH='main';
const API=`https://api.github.com/repos/${REPO}`;
const PUBLIC_BASE='https://promo.autoricambidese.it/';
const FIELDS=['titolo','categoria','marca','codice','applicazione','motore','prezzo','validita','keywords','note'];
const CATEGORIES=['FILTRI','FRENANTE','FRIZIONI','DISTRIBUZIONE','LUBRIFICANTI','PRODOTTI TECNICI','ELETTRICO/ELETTRONICO','ATTREZZATURE','PROMO GENERALI'];
const DRAFT_KEY='ardBuilderMobile.beta14.isolata.draft';
const state={mergePlan:null,mergeChoices:{},tab:'catalogo',promotions:[],baseHead:null,baseTree:null,indexHTML:null,search:'',filter:'TUTTE',showArchived:true,dirty:false,loading:false,busy:false,review:null,publishedSha:null,needsReload:false,diag:[],lastLoadedAt:null,message:'',error:false,staged:new Map(),objectUrls:new Map(),imageChecks:null};
const root=document.getElementById('app');
const dialog=document.getElementById('editDialog');
const toastEl=document.getElementById('toast');
let toastTimeout;
let editingImage=null;

function diag(line){state.diag.unshift({at:new Date().toLocaleTimeString('it-IT'),text:String(line).slice(0,350)});state.diag=state.diag.slice(0,20);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function safePath(path){return typeof path==='string' && /^assets\/(img|thumbs)\/[^/\\]+$/.test(path) && !path.includes('..') && !/[\u0000-\u001f]/.test(path);}
function publicImage(path){return safePath(path)?PUBLIC_BASE+path.split('/').map(encodeURIComponent).join('/')+(state.baseHead?'?rev='+encodeURIComponent(state.baseHead.slice(0,12)):''):'';}
function toast(message){toastEl.textContent=message;toastEl.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toastEl.classList.remove('visible'),4000);}
function dirty(){state.dirty=true;state.review=null;state.mergePlan=null;state.mergeChoices={};state.imageChecks=null;persistDraft();render();}
function persistDraft(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify({promotions:state.promotions,baseHead:state.baseHead,baseTree:state.baseTree,indexHTML:state.indexHTML,updated:Date.now()}));}catch(e){state.error=true;state.message='ATTENZIONE: bozza non salvata stabilmente sul dispositivo ('+String(e?.message||e)+'). Esporta subito una copia JSON senza chiudere la pagina.';diag(state.message);toast('Bozza non salvata: esporta subito il backup.');}}
function clearDraft(){localStorage.removeItem(DRAFT_KEY);}
function draftRestore(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
 if(d&&d.baseHead&&d.baseTree&&typeof d.indexHTML==='string'){
  const list=verifyCatalog(d.promotions);
  verifyCatalog(locateEmbeddedJSON(d.indexHTML).data);
  state.promotions=list;state.baseHead=d.baseHead;state.baseTree=d.baseTree;state.indexHTML=d.indexHTML;
  state.dirty=true;state.mergePlan=null;state.mergeChoices={};state.error=false;state.message='Bozza locale recuperata: '+list.length+' promozioni. Non ricaricare senza esportare.';
  diag('Bozza recuperata da memoria ISOLATA: '+list.length+' promozioni.');return true;
 }
 }catch(e){diag('Bozza non recuperata: '+e.message);state.error=true;state.message='Non riesco a leggere la bozza locale: '+e.message+' Nessun dato è stato cancellato.';}
 return false;}
function verifyCatalog(items){
 if(!Array.isArray(items)||!items.length)throw new Error('Il catalogo GitHub è vuoto o non valido: nessun dato precedente verrà cancellato.');
 const seen=new Set();
 for(const p of items){
  if(!p||!Number.isInteger(p.id)||p.id<1||seen.has(p.id)||typeof p.titolo!=='string'||!p.titolo.trim()||!safePath(p.immagine)||!safePath(p.thumb))
   throw new Error('Promozione non valida o ID duplicato: '+String(p?.id??'?'));
  seen.add(p.id);
 }
 return items;
}

function resetImageURLs(){for(const u of state.objectUrls.values())URL.revokeObjectURL(u);state.objectUrls.clear();}
async function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open('ard-builder-staged-beta14',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'path'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function idbUse(mode,action){const db=await dbOpen();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',mode);const store=tx.objectStore('files');const req=action(store);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function stageSave(path,data){await idbUse('readwrite',s=>s.put({path,...data}));state.staged.set(path,data);}
async function stageLoad(){try{const items=await idbUse('readonly',s=>s.getAll());for(const it of items)state.staged.set(it.path,{base64:it.base64,mime:it.mime});}catch{state.message='Non riesco a leggere eventuali immagini locali della bozza. Esporta una copia e non cancellarla.';}}
async function stageClear(){try{await idbUse('readwrite',s=>s.clear());state.staged.clear();resetImageURLs();}catch(e){diag('Impossibile azzerare immagini in memoria locale: '+String(e?.message||e));}}
function imageURL(path){if(!safePath(path))return './icons/icon-192.png';const obj=state.staged.get(path);if(!obj)return publicImage(path);if(state.objectUrls.has(path))return state.objectUrls.get(path);try{const bin=atob(obj.base64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);const url=URL.createObjectURL(new Blob([arr],{type:obj.mime}));state.objectUrls.set(path,url);return url;}catch{return publicImage(path);}}
function stagedStillUsed(){const wanted=new Set(state.promotions.flatMap(p=>[p.immagine,p.thumb]));return [...state.staged.keys()].every(p=>wanted.has(p));}
function statusHtml(){let result='<div class="notice"><strong>VERSIONE DI COLLAUDO.</strong> Modifiche e bozze rimangono in questo ambiente isolato. Pubblicazione GitHub DISATTIVATA.</div>';
 if(state.dirty)result+='<div class="notice success"><strong>Bozza locale salvata.</strong> Prima di ricaricare puoi esportarla in un file.</div>';
 if(state.message)result+=`<div class="notice ${state.error?'error':'success'}">${esc(state.message)}</div>`;
 return result;}
function statHtml(){return `<div class="stats"><div class="stat"><strong>${state.promotions.length}</strong><small>Promozioni</small></div><div class="stat"><strong>${state.promotions.filter(p=>p.attiva).length}</strong><small>Attive</small></div><div class="stat"><strong>${state.promotions.filter(p=>!p.attiva).length}</strong><small>Archiviate</small></div></div>`;}
function render(){for(const b of document.querySelectorAll('.tab'))b.classList.toggle('active',b.dataset.tab===state.tab);
if(state.loading&&!state.promotions.length){root.innerHTML='<div class="section"><h2>Collegamento al catalogo A.R.D.…</h2><p class="muted">Lettura dei dati dal repository GitHub. In caso di errore, comparirà una spiegazione.</p></div>';return;}
if(state.tab==='catalogo')renderCatalog();else if(state.tab==='controllo')renderValidation();else if(state.tab==='pubblica')renderPublish();else if(state.tab==='diagnostica')renderDiagnostics();else renderSettings();}
function renderCatalog(){let records=state.promotions.filter(p=>(state.filter==='TUTTE'||p.categoria===state.filter)&&(state.showArchived||p.attiva));const q=state.search.trim().toLowerCase();if(q)records=records.filter(p=>[p.titolo,p.marca,p.codice,p.applicazione,p.motore,p.keywords].join(' ').toLowerCase().includes(q));const reordering= !q && state.filter==='TUTTE' && state.showArchived;
root.innerHTML=`<section class="hero"><div><h2>Catalog Builder su iPad e iPhone</h2><p>Versione 1.4.0 TEST · Nessuna scrittura su GitHub</p></div><span class="pill">${state.dirty?'Bozza locale':'Aggiornato'}</span></section>${statHtml()}${statusHtml()}
<div class="toolbar"><input id="searchPromo" type="search" placeholder="Cerca marca, codice, veicolo…" aria-label="Cerca promozioni" value="${esc(state.search)}"><button class="btn btn-red" data-action="new">+ Nuova promo</button></div>
<div class="filters"><button class="filter ${state.filter==='TUTTE'?'selected':''}" data-filter="TUTTE">Tutte</button>${CATEGORIES.map(c=>`<button class="filter ${c===state.filter?'selected':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}<button class="filter ${state.showArchived?'selected':''}" data-action="archived">${state.showArchived?'✓ Anche archiviate':'Solo attive'}</button></div>
<div class="cards">${records.length?records.map(p=>promoHtml(p,reordering)).join(''):'<div class="empty">Nessuna promozione trovata.</div>'}</div><p class="footer-help"><strong>BOZZE:</strong> salvate solo su questo dispositivo; pubblicazione disattivata. L’ordine si modifica con ↑ e ↓ quando visualizzi tutte le promozioni senza filtri. Le immagini vengono caricate da GitHub e possono richiedere connessione Internet.</p>`;
}
function promoHtml(p,canReorder){const pos=state.promotions.findIndex(x=>x.id===p.id);return `<article class="promo"><img loading="lazy" src="${esc(imageURL(p.thumb||p.immagine))}" alt="Immagine ${esc(p.titolo)}"><div class="promo-body"><div class="promo-top"><span class="pill ${p.attiva?'active':'inactive'}">${p.attiva?'ATTIVA':'ARCHIVIATA'}</span><small class="muted">#${esc(p.id)}</small></div><h3>${esc(p.titolo)}</h3><p><strong>${esc(p.marca)}</strong> · ${esc(p.codice)}</p><p>${esc(p.categoria)}</p>${p.prezzo?`<p class="price">${esc(p.prezzo)}</p>`:''}<div class="actions"><button class="btn btn-dark btn-sm" data-action="edit" data-id="${p.id}">Modifica</button><button class="btn btn-light btn-sm" data-action="toggle" data-id="${p.id}">${p.attiva?'Archivia':'Riattiva'}</button>${canReorder?`<button class="order-btn" data-action="up" data-id="${p.id}" aria-label="Sposta in alto" ${pos===0?'disabled':''}>↑</button><button class="order-btn" data-action="down" data-id="${p.id}" aria-label="Sposta in basso" ${pos===state.promotions.length-1?'disabled':''}>↓</button>`:''}</div></div></article>`;}
function validate(){const issues=[];const ids=new Set();for(const p of state.promotions){if(ids.has(p.id))issues.push({ok:false,text:`ID duplicato: ${p.id}`});ids.add(p.id);if(!p.titolo?.trim()||!p.marca?.trim()||!p.codice?.trim())issues.push({ok:false,text:`Promo #${p.id}: titolo, marca o codice mancante`});if(!safePath(p.immagine)||!safePath(p.thumb))issues.push({ok:false,text:`Promo #${p.id}: percorso immagine o miniatura non valido`});if(!CATEGORIES.includes(p.categoria))issues.push({ok:true,text:`Promo #${p.id}: categoria fuori elenco (${p.categoria})`});}if(!stagedStillUsed())issues.push({ok:true,text:'Sono presenti immagini preparate ma non più usate dalle promozioni (non verranno pubblicate).'});return issues;}
function renderValidation(){const issues=validate();root.innerHTML=`<section class="hero"><div><h2>Controllo catalogo</h2><p>Verifica la bozza prima del collaudo</p></div></section>${statusHtml()}<section class="section"><h2>${issues.some(i=>!i.ok)?'Ci sono errori da correggere':issues.length?'Verifica completata con avvisi':'Tutto in ordine'}</h2><div class="checks">${issues.length?issues.map(i=>`<div class="check"><span class="${i.ok?'ok':'bad'}">${i.ok?'!':'✕'}</span><span>${esc(i.text)}</span></div>`).join(''):'<div class="check"><span class="ok">✓</span><span>Nessun ID duplicato e tutti i campi essenziali sono compilati.</span></div>'}</div><p class="footer-help">La verifica dei dati non garantisce che ogni immagine sia raggiungibile online.</p><button class="btn btn-dark" data-action="check-images" ${state.busy?'disabled':''}>Verifica immagini di 4 promozioni</button>${imageCheckHtml()}</section>`;}
function imageCheckHtml(){
 if(!state.imageChecks)return '<p class="footer-help">Puoi controllare su richiesta le immagini e le miniature di quattro promozioni (massimo 8 richieste HEAD). Non viene modificato alcun file.</p>';
 return '<div class="checks">'+state.imageChecks.map(v=>`<div class="check"><span class="${v.ok?'ok':'bad'}">${v.ok?'✓':'!'}</span><span>${esc(v.label)} · ${esc(v.message)}</span></div>`).join('')+'</div>';
}
async function checkImages(){
 if(state.busy||!state.promotions.length)return;
 state.busy=true;state.imageChecks=null;render();
 try{
  const list=state.promotions;
  const chosen=[list.find(p=>p.id===32),list[0],list.at(-1),list.find(p=>p.attiva===false),list.find(p=>p.attiva===true)].filter(Boolean);
  const unique=[...new Map(chosen.map(p=>[p.id,p])).values()].slice(0,4);
  const checks=[];
  for(const promo of unique){
   for(const [field,label] of [['immagine','Immagine'],['thumb','Miniatura']]){
    const path=promo[field];
    if(!safePath(path)){checks.push({ok:false,label:`#${promo.id} · ${label}`,message:'Percorso non valido'});continue;}
    if(state.staged.has(path)){checks.push({ok:true,label:`#${promo.id} · ${label}`,message:'Presente nella bozza locale'});continue;}
    try{
     const response=await fetch(publicImage(path),{method:'HEAD',cache:'no-store',credentials:'omit'});
     checks.push({ok:response.ok,label:`#${promo.id} · ${label}`,message:response.ok?'Raggiungibile online':'HTTP '+response.status});
    }catch(e){checks.push({ok:false,label:`#${promo.id} · ${label}`,message:'Verifica non riuscita: '+String(e?.message||e)});}
   }
  }
  state.imageChecks=checks;diag('Immagini verificate: '+checks.filter(x=>x.ok).length+'/'+checks.length);
 }finally{state.busy=false;render();}
}
function renderPublish(){
 const errors=validate().filter(i=>!i.ok),r=state.review;
 root.innerHTML=`<section class="hero"><div><h2>Anteprima della bozza</h2><p>Versione 1.4.0 TEST · nessuna pubblicazione GitHub possibile</p></div><span class="pill">COLLAUDO</span></section>${statusHtml()}
 <section class="section"><h2>La tua bozza</h2><p><strong>${state.promotions.length} promozioni</strong> · ${state.staged.size} immagini locali in preparazione</p>
 <p>${state.dirty?'Modifiche presenti solo in questa app di prova.':'Nessuna modifica locale da esportare.'}</p>
 ${errors.length?`<div class="notice error">${errors.length} errori: controlla i dati nella scheda Controllo.</div>`:''}
 <div class="flexgap"><button class="btn btn-dark" data-action="preflight" ${!state.dirty||errors.length||state.busy?'disabled':''}>Anteprima modifiche locali</button><button class="btn btn-light" data-action="export" ${!state.dirty?'disabled':''}>Esporta copia della bozza</button></div></section>
 ${r?`<section class="section"><h2>Anteprima (non pubblicabile)</h2><p><strong>${r.changed.length}</strong> modificate · <strong>${r.added.length}</strong> aggiunte · <strong>${r.deleted.length}</strong> eliminate · <strong>${r.assets.length}</strong> file immagine locali · <strong>${r.orderChanged?'Sì':'No'}</strong> riordino</p><div class="checks">${[...r.changed.map(x=>'#'+x.id+' · '+x.titolo+' ('+x.fields.join(', ')+')'),...r.added.map(x=>'Nuova #'+x.id+' · '+x.titolo),...r.deleted.map(x=>'Eliminata #'+x.id+' · '+x.titolo)].map(x=>'<div class="check"><span class="ok">•</span><span>'+esc(x)+'</span></div>').join('')}</div></section>`:''}
 <section class="section"><h2>Sincronizzazione Mac–iPad · controllo dati reali</h2>
 <p>Confronta il catalogo di partenza, la bozza sul dispositivo e il catalogo GitHub di oggi. Le modifiche incompatibili richiedono una scelta esplicita.</p>
 <div class="flexgap"><button class="btn btn-dark" data-action="merge-check" ${!state.dirty||state.busy?'disabled':''}>Confronta con GitHub</button></div>
 <p class="footer-help">Solo GET su GitHub: nessun token e nessuna pubblicazione. Prima della fusione esporta il backup. Le immagini staged rimangono locali: verifica sempre le anteprime e i percorsi dopo l'integrazione.</p>
 ${mergeResultHtml()}</section>
 <section class="section"><h2>Recupera una bozza precedente</h2>
 <p>Puoi importare un backup JSON delle BETA 1.3.2, 1.3.3 o 1.4.0. L'app verifica il commit d'origine e non tocca le bozze delle altre versioni.</p>
 <label class="btn btn-light import-label" for="importBackup">Seleziona backup JSON…</label>
 <input type="file" id="importBackup" accept=".json,application/json" style="position:absolute;width:1px;height:1px;opacity:0" ${state.dirty?'disabled':''}>
 <p class="footer-help">Per sicurezza l’importazione è consentita solo senza una bozza locale aperta. Non cancella i file di altri ambienti.</p></section>
 <section class="section"><h2>Pubblicazione bloccata in questa versione</h2><p>Non vengono richiesti token GitHub e non sono presenti comandi di scrittura. La BETA 1.2 resta la versione mobile operativa. L'app Mac nativa non è stata modificata.</p><button class="btn btn-red" disabled>Pubblicazione non disponibile</button></section>
 <section class="section"><h2>Gestione bozza</h2><div class="flexgap"><button class="btn btn-light" data-action="reload" ${state.dirty?'disabled':''}>Ricarica da GitHub</button>${state.dirty?'<button class="btn btn-danger" data-action="discard">Elimina bozza DOPO backup</button>':''}</div><p class="footer-help">Elimina bozza richiede conferma e ricarica i dati GitHub solo dopo lettura riuscita.</p></section>`;
}
function renderSettings(){root.innerHTML=`<section class="hero"><div><h2>Impostazioni</h2><p>Catalog Builder Mobile · v1.4.0 TEST</p></div></section><section class="section"><h2>Catalogo collegato</h2><p><strong>${esc(REPO)}</strong><br><span class="muted small">Branch: ${BRANCH} · GitHub Pages</span></p><p><a href="${PUBLIC_BASE}" target="_blank" rel="noopener noreferrer">Apri il catalogo online ↗</a></p></section><section class="section"><h2>Sicurezza</h2><p>Questa versione TEST non chiede token GitHub e non può pubblicare. Mantieni la BETA 1.2 per l’uso operativo.</p><p class="small muted">La pagina resta visibile pubblicamente: non scrivere password o informazioni riservate nelle promozioni.</p></section><section class="section"><h2>Ricarica</h2><p>Ricaricare dal repository elimina la bozza locale: usa questa funzione soltanto se non ti serve più.</p><button class="btn btn-light" data-action="reload">Ricarica catalogo online</button></section>`;}
function editDialog(p=null){editingImage=null;const fresh=!p;const promo=p||{id:Math.max(0,...state.promotions.map(x=>x.id))+1,titolo:'',categoria:'PROMO GENERALI',marca:'',codice:'',applicazione:'',motore:'',prezzo:'',validita:'Ad Esaurimento',keywords:'',note:'',attiva:true,immagine:'',thumb:'',dataAggiornamento:today()};
 dialog.innerHTML=`<div class="edit-head"><h2>${fresh?'Nuova promozione':'Modifica promozione #'+esc(promo.id)}</h2><button type="button" data-action="close-dialog" aria-label="Chiudi">×</button></div><form id="promoForm"><div class="edit-content"><label class="small" for="promoImage">Immagine promozione</label>${!fresh?`<img id="promoPreview" class="preview-image" src="${esc(imageURL(promo.immagine))}" alt="Anteprima promozione">`:'<img id="promoPreview" class="preview-image" src="./icons/icon-192.png" alt="Anteprima immagine">'}<input id="promoImage" type="file" accept="image/*"><p class="footer-help">Da Foto o File • elaborazione sul dispositivo • immagine max 1800 px, miniatura max 520 px</p><div class="form-grid">${FIELDS.map(field=>{
  const val=promo[field]??'';const title=({titolo:'Titolo',categoria:'Categoria',marca:'Marca',codice:'Codice articolo',applicazione:'Applicazione / veicolo',motore:'Motore',prezzo:'Prezzo / promozione',validita:'Validità',keywords:'Parole chiave',note:'Note'})[field];return `<label class="${['titolo','applicazione','keywords','note'].includes(field)?'full':''}">${title}${field==='categoria'?`<select name="${field}">${CATEGORIES.map(c=>`<option value="${esc(c)}" ${val===c?'selected':''}>${esc(c)}</option>`).join('')}</select>`:field==='note'?`<textarea name="note">${esc(val)}</textarea>`:`<input name="${field}" value="${esc(val)}" ${['titolo','marca','codice'].includes(field)?'required':''}>`}</label>`;}).join('')}<label class="full" style="flex-direction:row;align-items:center"><input type="checkbox" name="attiva" style="width:auto" ${promo.attiva?'checked':''}> Promozione attiva</label></div></div><div class="edit-bottom"><button type="button" class="btn btn-light" data-action="close-dialog">Annulla</button><button type="submit" class="btn btn-red" id="savePromoBtn">Salva bozza</button></div></form>`;
 dialog.dataset.id=String(promo.id);dialog.dataset.fresh=String(fresh);dialog.showModal();
 dialog.querySelector('#promoImage').addEventListener('change',event=>{const f=event.target.files?.[0];if(!f)return;editingImage=f;const previous=dialog.querySelector('#promoPreview');if(previous?.dataset.tempURL)URL.revokeObjectURL(previous.dataset.tempURL);const u=URL.createObjectURL(f);previous.src=u;previous.dataset.tempURL=u;});
}
function closeDialog(){const el=dialog.querySelector('#promoPreview');if(el?.dataset.tempURL)URL.revokeObjectURL(el.dataset.tempURL);dialog.close();dialog.innerHTML='';editingImage=null;}
function fileReadBase64(blob){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result.split(',')[1]);fr.onerror=()=>reject(fr.error);fr.readAsDataURL(blob);});}
async function canvasExport(image,max){const ratio=Math.min(1,max/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Impossibile esportare immagine')),'image/webp',.84));return blob;}
async function processImage(file,p){if(!file.type.startsWith('image/'))throw new Error('Seleziona un’immagine valida.');const u=URL.createObjectURL(file);try{const img=new Image();img.src=u;await img.decode();if(img.width*img.height>45000000)throw new Error('Immagine troppo grande: riduci prima la risoluzione.');const main=await canvasExport(img,1800);const thumb=await canvasExport(img,520);const slug=(p.marca+'_'+p.codice).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]/g,'_').replace(/_+/g,'_').slice(0,46)||'promo';const unique=Date.now()+'_'+Math.random().toString(36).slice(2,8);const ext=b=>b.type==='image/webp'?'webp':'png';const fullPath=`assets/img/${slug}_${unique}.${ext(main)}`;const thumbPath=`assets/thumbs/${slug}_${unique}.${ext(thumb)}`;await stageSave(fullPath,{mime:main.type,base64:await fileReadBase64(main)});await stageSave(thumbPath,{mime:thumb.type,base64:await fileReadBase64(thumb)});p.immagine=fullPath;p.thumb=thumbPath;}finally{URL.revokeObjectURL(u);}}
async function savePromo(event){event.preventDefault();const btn=dialog.querySelector('#savePromoBtn');btn.disabled=true;btn.textContent='Salvataggio…';try{const form=new FormData(event.target);const p={id:Number(dialog.dataset.id),immagine:'',thumb:'',dataAggiornamento:today(),attiva:form.has('attiva')};for(const f of FIELDS)p[f]=String(form.get(f)||'').trim();p.marca=p.marca.toUpperCase();if(!p.titolo||!p.marca||!p.codice)throw new Error('Titolo, marca e codice sono obbligatori.');if(dialog.dataset.fresh==='false'){const old=state.promotions.find(x=>x.id===p.id);if(!old)throw new Error('Promozione originale non trovata.');p.immagine=old.immagine;p.thumb=old.thumb;}if(editingImage)await processImage(editingImage,p);if(!safePath(p.immagine)||!safePath(p.thumb))throw new Error('Seleziona un’immagine prima di salvare.');const idx=state.promotions.findIndex(x=>x.id===p.id);if(idx>=0)state.promotions[idx]=p;else state.promotions.unshift(p);closeDialog();dirty();toast('Promozione salvata in bozza.');}catch(err){toast(err.message);btn.disabled=false;btn.textContent='Salva bozza';}}
async function api(path){
 const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 let response;
 try{response=await fetch(API+path,{method:'GET',headers,cache:'no-store',credentials:'omit',redirect:'error'});}
 catch{throw new Error('Connessione a GitHub non disponibile. Controlla la rete.');}
 if(!response.ok)throw new Error('GitHub HTTP '+response.status+' per '+path+(response.status===403?' (possibile limite delle richieste pubbliche)':''));
 return response.json();
}
function decodeGitHubBase64(value){const raw=atob(String(value||'').replace(/\s/g,''));const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
async function currentRef(){return (await api(`/git/ref/heads/${BRANCH}`)).object.sha;}
async function loadRemote(force=false){
 if(state.busy)return;
 if(state.dirty&&!force){state.error=true;state.message='Hai una bozza da conservare. Esporta la bozza prima di ricaricare; usa Elimina bozza solo dopo averla salvata.';render();return;}
 state.loading=true;diag('Inizio lettura GitHub (sola lettura).');render();
 try{
  const head=await currentRef();if(!/^[a-f0-9]{40}$/i.test(head))throw new Error('Commit GitHub non valido.');
  const [commit,json,index]=await Promise.all([api(`/git/commits/${head}`),api(`/contents/data/catalogo.json?ref=${head}`),api(`/contents/index.html?ref=${head}`)]);
  const list=verifyCatalog(JSON.parse(decodeGitHubBase64(json.content)));
  const html=decodeGitHubBase64(index.content);
  const embedded=verifyCatalog(locateEmbeddedJSON(html).data);
  if(canonical(list)!==canonical(embedded))throw new Error('catalogo.json e index.html non sono coerenti. La lista già caricata non viene sostituita.');
  if((await currentRef())!==head)throw new Error('Nuovo commit durante la verifica: riprova senza perdere i dati caricati.');
  // Solo dopo TUTTI i controlli, aggiorna la lista.
  state.promotions=list;state.baseHead=head;state.baseTree=commit.tree.sha;state.indexHTML=html;
  state.dirty=false;state.review=null;state.mergePlan=null;state.mergeChoices={};state.needsReload=false;state.search='';state.filter='TUTTE';state.showArchived=true;
  state.error=false;state.lastLoadedAt=new Date().toISOString();state.message=`Caricate ${list.length} promozioni. JSON/HTML coerenti. Commit ${head.slice(0,12)}.`;
  diag('OK: '+list.length+' promozioni, ID univoci, JSON/HTML coerenti; commit '+head.slice(0,12));
  await stageClear();clearDraft();
 }catch(e){state.error=true;state.message='ERRORE CARICAMENTO: '+e.message+(state.promotions.length?' Mantengo '+state.promotions.length+' promozioni già presenti.':' Nessun dato online è stato modificato.');diag(state.message);}
 finally{state.loading=false;render();}
}
// Locate the actual embedded JSON array (do not modify any surrounding page code).
function locateEmbeddedJSON(html){
 const match=/\blet\s+CATALOGO\s*=\s*/g.exec(html);
 if(!match)throw new Error('Il file index.html non contiene il catalogo incorporato atteso.');
 const start=html.indexOf('[',match.index+match[0].length);
 if(start<0||html.slice(match.index+match[0].length,start).trim())throw new Error('Formato catalogo HTML non riconosciuto.');
 let quote=false,escaped=false,depth=0;
 for(let i=start;i<html.length;i++){
  const c=html[i];
  if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='"')quote=false;continue;}
  if(c==='"'){quote=true;continue;}
  if(c==='[')depth++;
  if(c===']' && --depth===0){const segment=html.slice(start,i+1);let data;
   try{data=JSON.parse(segment);}catch{throw new Error('Catalogo incorporato non è JSON valido.');}
   if(!Array.isArray(data))throw new Error('Catalogo HTML non valido.');
   return {start,end:i+1,data};
  }
 }
 throw new Error('Catalogo incorporato in HTML incompleto.');
}
function canonical(v){return JSON.stringify(v);}
function embeddedHTML(promotions){
 const found=locateEmbeddedJSON(state.indexHTML);
 // The original HTML must match the original GitHub data, not a hand-edited variant.
 if(found.data.length!==state.originalLength)throw new Error('Numero promozioni HTML incoerente con la versione di partenza.');
 const json=JSON.stringify(promotions).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return state.indexHTML.slice(0,found.start)+json+state.indexHTML.slice(found.end);
}
function diffPromos(oldList,newList){
 const oldMap=new Map(oldList.map(p=>[p.id,p])),newMap=new Map(newList.map(p=>[p.id,p]));
 const added=[],changed=[],deleted=[];
 for(const p of newList){const before=oldMap.get(p.id);if(!before)added.push(p);
  else if(canonical(before)!==canonical(p)){
   const keys=new Set([...Object.keys(before),...Object.keys(p)]);
   changed.push({id:p.id,titolo:p.titolo,fields:[...keys].filter(k=>canonical(before[k])!==canonical(p[k]))});
  }
 }
 for(const p of oldList)if(!newMap.has(p.id))deleted.push(p);
 return {changed,added,deleted};
}
function usedStaged(){const used=new Set(state.promotions.flatMap(p=>[p.immagine,p.thumb]));
 return [...state.staged.entries()].filter(([path])=>used.has(path));}
async function preflight(){
 if(state.busy||!state.dirty)return;
 if(state.needsReload){toast('Prima ricarica il catalogo da GitHub.');return;}
 const problems=validate().filter(x=>!x.ok);
 if(problems.length){toast('Prima correggi gli errori nella scheda Controllo.');return;}
 state.busy=true;state.review=null;render();
 try{
  const now=await currentRef();
  if(now!==state.baseHead)throw new Error('CONFLITTO: il catalogo GitHub è cambiato dopo la creazione della bozza. Le tue modifiche sono ancora sul dispositivo. Usa Confronta con GitHub nella scheda Bozza. NON ricaricare.');
  const original=await api(`/contents/data/catalogo.json?ref=${encodeURIComponent(state.baseHead)}`);
  const oldList=JSON.parse(decodeGitHubBase64(original.content));
  const embedded=locateEmbeddedJSON(state.indexHTML).data;
  if(canonical(embedded)!==canonical(oldList))throw new Error('index.html e catalogo.json non sono coerenti: interrompo la pubblicazione.');
  state.originalLength=oldList.length;
  const diff=diffPromos(oldList,state.promotions),assets=usedStaged().map(x=>x[0]);
  const orderChanged=oldList.map(p=>p.id).join(',')!==state.promotions.map(p=>p.id).join(',');
  if(!diff.changed.length&&!diff.added.length&&!diff.deleted.length&&!assets.length&&!orderChanged)throw new Error('La bozza non contiene modifiche effettive rispetto al catalogo online.');
  const html=embeddedHTML(state.promotions);locateEmbeddedJSON(html);
  state.review={...diff,assets,head:now,orderChanged};
  state.error=false;state.message='Anteprima locale verificata. In questa versione la pubblicazione è bloccata.';
 }catch(e){state.error=true;state.message=e.message;toast(e.message);}
 finally{state.busy=false;render();}
}
// Legge uno snapshot GitHub coerente usando lo stesso commit per JSON, HTML e tree.
async function readSnapshot(head){
 if(!/^[a-f0-9]{40}$/i.test(head))throw new Error('Commit sorgente non valido.');
 const [j,h,c]=await Promise.all([api(`/contents/data/catalogo.json?ref=${head}`),api(`/contents/index.html?ref=${head}`),api(`/git/commits/${head}`)]);
 const items=verifyCatalog(JSON.parse(decodeGitHubBase64(j.content)));const html=decodeGitHubBase64(h.content);
 if(canonical(items)!==canonical(verifyCatalog(locateEmbeddedJSON(html).data)))throw new Error('Il catalogo JSON non coincide con quello incorporato in HTML.');
 if(!/^[a-f0-9]{40}$/i.test(c.tree?.sha||''))throw new Error('Tree GitHub mancante o non valido.');
 return {head,items,html,tree:c.tree.sha};
}
function mergeResultHtml(){
 const p=state.mergePlan;if(!p)return '<p class="muted">Nessun confronto ancora eseguito.</p>';
 const conflicts=p.plan.conflicts;
 const fields=conflicts.map(c=>`<div class="merge-conflict"><strong>${esc(c.label)}</strong><div class="merge-values"><div><span>Bozza iPad</span><pre>${esc(JSON.stringify(c.localValue??null,null,2)?.slice(0,800)||'null')}</pre></div><div><span>GitHub</span><pre>${esc(JSON.stringify(c.remoteValue??null,null,2)?.slice(0,800)||'null')}</pre></div></div><label class="small">Quale versione tenere?
 <select class="merge-select" data-conflict="${esc(c.key)}"><option value="">— Scegli prima di continuare —</option><option value="local" ${state.mergeChoices[c.key]==='local'?'selected':''}>Mantieni bozza iPad</option><option value="remote" ${state.mergeChoices[c.key]==='remote'?'selected':''}>Mantieni GitHub</option></select></label></div>`).join('');
 const count=conflicts.filter(c=>['local','remote'].includes(state.mergeChoices[c.key])).length;
 return `<div class="merge-status"><strong>Commit remoto:</strong> ${esc(p.remote.head.slice(0,12))} · <strong>Commit originale:</strong> ${esc(state.baseHead.slice(0,12))}<p>Bozza locale: ${p.localDiff.changed.length} modificate, ${p.localDiff.added.length} aggiunte, ${p.localDiff.deleted.length} eliminate. GitHub dal commit originale: ${p.remoteDiff.changed.length} modificate, ${p.remoteDiff.added.length} aggiunte, ${p.remoteDiff.deleted.length} eliminate.</p><p>Bozza: ${p.localDiff.changed.filter(x=>x.fields.includes('attiva')).length} archiviazioni/riattivazioni, ${p.localDiff.changed.filter(x=>x.fields.includes('immagine')||x.fields.includes('thumb')).length} cambi immagine. Remoto: ${p.remoteDiff.changed.filter(x=>x.fields.includes('attiva')).length} cambi di stato, ${p.remoteDiff.changed.filter(x=>x.fields.includes('immagine')||x.fields.includes('thumb')).length} cambi immagine.</p></div>
 ${conflicts.length?`<div class="notice error"><strong>${conflicts.length} conflitto/i da risolvere.</strong> Scelte effettuate: ${count}/${conflicts.length}. Nessuna modifica sarà applicata finché non avrai scelto per tutti.</div>${fields}`:'<div class="notice success"><strong>Nessun conflitto.</strong> Le modifiche differenti possono essere integrate nella bozza locale.</div>'}
 <div class="merge-status"><strong>Controlli aggiuntivi 1.4</strong><p>Immagini e miniature: una sola scelta per coppia · Archiviazioni: campo attiva · Ordine delle promozioni: conflitto esplicito se modificato in modo incompatibile · Data aggiornamento: allineata automaticamente alla più recente.</p><p>${p.plan.localMoved||p.plan.remoteMoved?'ATTENZIONE: ordine delle promozioni modificato. Verifica l’ordine dopo la fusione.':'Ordine invariato per gli ID già presenti in entrambe le versioni.'} I nuovi articoli potrebbero essere accodati.</p></div><button class="btn btn-red" data-action="merge-apply" ${count!==conflicts.length||state.busy?'disabled':''}>Integra in questa bozza (solo locale)</button>
 <p class="footer-help">Le scelte riguardano solo la bozza. Se GitHub cambia durante il controllo, la fusione viene bloccata e occorre ripetere il confronto.</p>`;
}
async function compareWithGitHub(){
 if(state.busy||!state.dirty)return;
 state.busy=true;state.mergePlan=null;state.mergeChoices={};render();
 try{
  const baseline=verifyCatalog(locateEmbeddedJSON(state.indexHTML).data);
  const head=await currentRef();const snap=await readSnapshot(head);
  if((await currentRef())!==head)throw new Error('GitHub è cambiato durante il confronto: riprova.');
  const plan=ARDMerge.plan(baseline,state.promotions,snap.items);
  const stagedUsed=usedStaged().map(([path])=>path);
  const localNewImagePaths=new Set(state.promotions.flatMap(x=>[x.immagine,x.thumb]).filter(x=>!baseline.some(p=>p.immagine===x||p.thumb===x)));
  const unknownImages=[...localNewImagePaths].filter(path=>!state.staged.has(path)&&!snap.items.some(p=>p.immagine===path||p.thumb===path));
  if(unknownImages.length)throw new Error('Immagini aggiunte alla bozza ma assenti dall’archivio locale: '+unknownImages.slice(0,3).join(', ')+'. Verifica il backup.');
  const baseImgs=new Set(baseline.flatMap(x=>[x.immagine,x.thumb]));
  const remoteImgs=new Set(snap.items.flatMap(x=>[x.immagine,x.thumb]));
  const collisions=stagedUsed.filter(path=>remoteImgs.has(path)&&!baseImgs.has(path));
  if(collisions.length)throw new Error('Possibile collisione tra immagini locali e GitHub: '+collisions.join(', ')+'. Non integro automaticamente.');
  state.mergePlan={plan,remote:snap,localDiff:diffPromos(baseline,state.promotions),remoteDiff:diffPromos(baseline,snap.items)};
  state.error=false;state.message=plan.conflicts.length?`Confronto terminato: ${plan.conflicts.length} conflitti. Scegli per ogni campo.`:'Confronto terminato: nessun conflitto. Controlla e integra la bozza locale.';
  diag(`Merge preview: base ${baseline.length}, local ${state.promotions.length}, GitHub ${snap.items.length}, conflitti ${plan.conflicts.length}.`);
 }catch(e){state.error=true;state.message='Confronto NON applicato: '+e.message;diag(state.message);}
 finally{state.busy=false;render();}
}
async function applyMerge(){
 const p=state.mergePlan;if(!p||state.busy)return;
 const result=ARDMerge.resolve(p.plan,state.mergeChoices);
 if(!result.ok){toast('Devi scegliere come risolvere tutti i conflitti.');return;}
 try{verifyCatalog(result.items);}catch(e){toast('Fusione non valida: '+e.message);return;}
 if(!confirm('Hai esportato il backup JSON? La fusione aggiornerà SOLO la bozza della BETA 1.4. GitHub resterà invariato. Procedere?'))return;
 state.busy=true;render();
 try{
  if((await currentRef())!==p.remote.head)throw new Error('GitHub è cambiato dopo il confronto. Ripeti il confronto, senza perdere la bozza.');
  // Verifica che i dati usati per la fusione non siano cambiati nel frattempo.
  if(!canonical(result.items)||!p.remote.html)throw new Error('Dati merge non validi.');
  state.promotions=result.items;state.baseHead=p.remote.head;state.baseTree=p.remote.tree;state.indexHTML=p.remote.html;
  state.originalLength=p.remote.items.length;
  state.mergePlan=null;state.mergeChoices={};state.review=null;
  state.dirty=!equalForMerge(result.items,p.remote.items)||usedStaged().length>0;
  if(state.dirty)persistDraft();else clearDraft();
  state.error=false;state.message=`Integrazione locale completata: ${result.items.length} promozioni. Nessuna scrittura GitHub. ${state.dirty?'Bozza salvata.':'La bozza ora coincide con GitHub.'}`;
  diag(state.message);
 }catch(e){state.error=true;state.message='Nessuna integrazione applicata: '+e.message;diag(state.message);}
 finally{state.busy=false;render();}
}
function equalForMerge(a,b){return JSON.stringify(a)===JSON.stringify(b);}
async function importBackup(file){
 if(!file||state.busy)return;
 if(state.dirty){toast('Hai già una bozza in questa versione: prima esportala e gestiscila.');return;}
 if(file.size>45_000_000){toast('Backup oltre 45 MB: dimensione eccessiva.');return;}
 state.busy=true;render();
 try{
  const raw=JSON.parse(await file.text());
  if(!['ard-mobile-beta132-backup','ard-mobile-beta133-backup','ard-mobile-beta14-backup'].includes(raw?.format))throw new Error('Formato backup non riconosciuto.');
  if(!/^[a-f0-9]{40}$/i.test(raw.sourceCommit||''))throw new Error('Commit originale del backup assente/non valido.');
  const local=verifyCatalog(raw.promotions);
  if(!Array.isArray(raw.images)||raw.images.length>250)throw new Error('Elenco immagini di backup non valido.');
  const wanted=new Set(local.flatMap(x=>[x.immagine,x.thumb])),imagePaths=new Set();
  for(const im of raw.images){
   if(!im||!safePath(im.path)||!wanted.has(im.path)||!/^image\/(png|jpeg|webp)$/.test(im.mime||'')||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(im.base64||'')||im.base64.length>11_000_000||imagePaths.has(im.path))throw new Error('Immagine nel backup non valida o duplicata.');
   imagePaths.add(im.path);
  }
  const snap=await readSnapshot(raw.sourceCommit);
  if(!confirm(`Importare ${local.length} promozioni dalla bozza ${raw.format}? Verrà caricata SOLO nella BETA 1.4, senza pubblicare.`))return;
  for(const im of raw.images)await stageSave(im.path,{base64:im.base64,mime:im.mime});
  state.promotions=local;state.baseHead=snap.head;state.baseTree=snap.tree;state.indexHTML=snap.html;
  state.dirty=true;state.review=null;state.mergePlan=null;state.mergeChoices={};state.error=false;
  state.message='Backup importato: '+local.length+' promozioni, '+raw.images.length+' immagini. Ora puoi usare Confronta con GitHub.';
  persistDraft();diag(state.message);
 }catch(e){state.error=true;state.message='Importazione NON completata: '+e.message;diag(state.message);}
 finally{state.busy=false;render();}
}
async function exportDraft(){
 if(!state.dirty){toast('Non ci sono modifiche da esportare.');return;}
 try{
  const staged=usedStaged().map(([path,data])=>({path,mime:data.mime,base64:data.base64}));
  const backup={format:'ard-mobile-beta14-backup',exportedAt:new Date().toISOString(),sourceCommit:state.baseHead,promotions:state.promotions,images:staged};
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='ARD-bozza-beta14-'+today()+'.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  diag('Backup locale esportato: '+state.promotions.length+' promozioni, '+staged.length+' immagini.');toast('Backup della bozza preparato. Verifica in Download/File.');
 }catch(e){state.error=true;state.message='Impossibile esportare la bozza: '+e.message;diag(state.message);render();}
}
function renderDiagnostics(){
 const t=state.diag.map(x=>`<div class="check"><span>•</span><span>${esc(x.at+' · '+x.text)}</span></div>`).join('');
 root.innerHTML=`<section class="hero"><div><h2>Diagnostica · BETA 1.4.0</h2><p>Solo lettura GitHub. Registro degli ultimi controlli (senza password né token).</p></div><span class="pill">TEST</span></section>
 <section class="section"><h2>Stato del catalogo</h2><p><strong>${state.promotions.length}</strong> promozioni in memoria · ${state.error?'Ultimo controllo: errore':'Ultimo controllo: OK o in attesa'}</p><p class="small muted">Ultimo caricamento: ${esc(state.lastLoadedAt?new Date(state.lastLoadedAt).toLocaleString('it-IT'):'non ancora completato')} · commit ${esc(state.baseHead?.slice(0,12)||'—')}</p>
 ${statusHtml()}<button class="btn btn-dark" data-action="reload" ${state.dirty||state.loading?'disabled':''}>Verifica di nuovo da GitHub</button></section>
 <section class="section"><h2>Registro diagnostico</h2><div class="checks">${t||'<p class="muted">Nessun evento registrato.</p>'}</div><p class="footer-help">La BETA 1.2 non viene letta o modificata. Nessun service worker nuovo viene installato.</p></section>`;
}
async function discard(){if(!state.dirty)return;
 if(!confirm('Hai esportato una copia della bozza? Questa operazione elimina le modifiche SOLO della versione 1.4.0. Procedere?'))return;
 // Prima verifichiamo il catalogo remoto, senza mai cancellare i dati già salvati se GitHub non risponde.
 const previous={promotions:state.promotions,head:state.baseHead};
 state.loading=true;render();
 try{
  const head=await currentRef();const [j,h,c]=await Promise.all([api(`/contents/data/catalogo.json?ref=${head}`),api(`/contents/index.html?ref=${head}`),api(`/git/commits/${head}`)]);
  const list=verifyCatalog(JSON.parse(decodeGitHubBase64(j.content))),html=decodeGitHubBase64(h.content);
  if(canonical(list)!==canonical(verifyCatalog(locateEmbeddedJSON(html).data)))throw new Error('HTML e JSON discordanti');
  if((await currentRef())!==head)throw new Error('Repository cambiato durante il controllo');
  state.promotions=list;state.baseHead=head;state.baseTree=c.tree.sha;state.indexHTML=html;state.dirty=false;state.review=null;state.mergePlan=null;state.mergeChoices={};state.error=false;state.message='Bozza eliminata dopo ricarica riuscita di '+list.length+' promozioni.';
  clearDraft();await stageClear();diag('Bozza eliminata dopo verifica GitHub.');
 }catch(e){state.promotions=previous.promotions;state.baseHead=previous.head;state.error=true;state.message='Non ho eliminato la bozza: '+e.message;diag(state.message);}
 finally{state.loading=false;render();}
}
root.addEventListener('click',async event=>{const b=event.target.closest('[data-action],[data-filter]');if(!b||state.busy)return;if(b.dataset.filter){state.filter=b.dataset.filter;render();return;}const action=b.dataset.action;if(state.needsReload&&['edit','new','toggle','up','down'].includes(action)){toast('Ricarica prima da GitHub per modificare nuovamente.');return;}const id=Number(b.dataset.id);const p=state.promotions.find(x=>x.id===id);switch(action){case'new':editDialog();break;case'edit':if(p)editDialog(p);break;case'toggle':if(p){p.attiva=!p.attiva;p.dataAggiornamento=today();dirty();}break;case'up':case'down':{let i=state.promotions.findIndex(x=>x.id===id);let j=i+(action==='up'?-1:1);if(i<0||j<0||j>=state.promotions.length)return;[state.promotions[i],state.promotions[j]]=[state.promotions[j],state.promotions[i]];dirty();break;}case'archived':state.showArchived=!state.showArchived;render();break;case'discard':await discard();break;case'reload':await loadRemote();break;case'preflight':await preflight();break;case'check-images':await checkImages();break;case'export':await exportDraft();break;case'merge-check':await compareWithGitHub();break;case'merge-apply':await applyMerge();break;}});
root.addEventListener('change',async event=>{
 if(event.target.matches('.merge-select')){state.mergeChoices[event.target.dataset.conflict]=event.target.value;render();return;}
 if(event.target.id==='importBackup'&&event.target.files?.[0])await importBackup(event.target.files[0]);
});
root.addEventListener('input',event=>{if(event.target.id==='searchPromo'){const input=event.target;const i=input.selectionStart;state.search=input.value;render();const next=document.getElementById('searchPromo');next?.focus();next?.setSelectionRange(i,i);}});

dialog.addEventListener('click',event=>{if(event.target.closest('[data-action="close-dialog"]'))closeDialog();});
dialog.addEventListener('close',()=>{editingImage=null;});
dialog.addEventListener('submit',event=>{if(event.target.id==='promoForm')savePromo(event);});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;render();window.scrollTo({top:0,behavior:'smooth'});}));
document.getElementById('refreshBtn').addEventListener('click',()=>loadRemote());
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();}});
(async()=>{window.__ARD_BETA14_STARTED=true;document.getElementById('bootStatus')?.setAttribute('hidden','');diag('Versione 1.4.0 avviata senza service worker.');if(draftRestore()){await stageLoad();render();}else await loadRemote(true);})();
