// A.R.D. Catalog Builder Mobile — v1.3 BETA: backup bozze + riconciliazione sicura
// Credenziali GitHub: richiesta solo al momento della pubblicazione, usata in memoria,
// mai memorizzata in localStorage, IndexedDB, service worker o file del progetto.
// Il push richiede controllo di fast-forward su main (force:false).
const REPO='alessandro80ard/ard-digital-catalog';
const TEST_MODE=false;
const BRANCH='main';
const API=`https://api.github.com/repos/${REPO}`;
const PUBLIC_BASE='https://promo.autoricambidese.it/';
const FIELDS=['titolo','categoria','marca','codice','applicazione','motore','prezzo','validita','keywords','note'];
const CATEGORIES=['FILTRI','FRENANTE','FRIZIONI','DISTRIBUZIONE','LUBRIFICANTI','PRODOTTI TECNICI','ELETTRICO/ELETTRONICO','ATTREZZATURE','PROMO GENERALI'];
const DRAFT_KEY='ardBuilderMobile.test.v1_1.draft';
const state={tab:'catalogo',promotions:[],baseHead:null,baseTree:null,indexHTML:null,search:'',filter:'TUTTE',showArchived:true,dirty:false,loading:false,busy:false,review:null,publishedSha:null,needsReload:false,message:'',error:false,staged:new Map(),objectUrls:new Map()};
const root=document.getElementById('app');
const dialog=document.getElementById('editDialog');
const toastEl=document.getElementById('toast');
let toastTimeout;
let editingImage=null;

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function safePath(path){return typeof path==='string' && /^assets\/(img|thumbs)\/[^/\\]+$/.test(path) && !path.includes('..') && !/[\u0000-\u001f]/.test(path);}
function publicImage(path){return safePath(path)?PUBLIC_BASE+path.split('/').map(encodeURIComponent).join('/')+(state.baseHead?'?rev='+encodeURIComponent(state.baseHead.slice(0,12)):''):'';}
function toast(message){toastEl.textContent=message;toastEl.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toastEl.classList.remove('visible'),4000);}
function dirty(){state.dirty=true;state.review=null;persistDraft();render();}
function persistDraft(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify({promotions:state.promotions,baseHead:state.baseHead,baseTree:state.baseTree,indexHTML:state.indexHTML,updated:Date.now()}));}catch{toast('Spazio insufficiente per salvare la bozza locale.');}}
function clearDraft(){localStorage.removeItem(DRAFT_KEY);}
function draftRestore(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(d&&Array.isArray(d.promotions)&&d.baseHead&&d.baseTree&&typeof d.indexHTML==='string'){state.promotions=d.promotions;state.baseHead=d.baseHead;state.baseTree=d.baseTree;state.indexHTML=d.indexHTML;state.dirty=true;state.error=false;state.message='Bozza locale recuperata. Controlla le modifiche prima di pubblicare.';return true;}}catch{}return false;}
function resetImageURLs(){for(const u of state.objectUrls.values())URL.revokeObjectURL(u);state.objectUrls.clear();}
async function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open('ard-builder-staged-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'path'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function idbUse(mode,action){const db=await dbOpen();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',mode);const store=tx.objectStore('files');const req=action(store);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function stageSave(path,data){await idbUse('readwrite',s=>s.put({path,...data}));state.staged.set(path,data);}
async function stageLoad(){try{const items=await idbUse('readonly',s=>s.getAll());for(const it of items)state.staged.set(it.path,{base64:it.base64,mime:it.mime});}catch{state.message='Non riesco a recuperare le immagini della bozza; ricaricale prima di pubblicare.';}}
async function stageClear(){state.staged.clear();resetImageURLs();try{await idbUse('readwrite',s=>s.clear());}catch{}}
function imageURL(path){if(!safePath(path))return './icons/icon-192.png';const obj=state.staged.get(path);if(!obj)return publicImage(path);if(state.objectUrls.has(path))return state.objectUrls.get(path);try{const bin=atob(obj.base64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);const url=URL.createObjectURL(new Blob([arr],{type:obj.mime}));state.objectUrls.set(path,url);return url;}catch{return publicImage(path);}}
function stagedStillUsed(){const wanted=new Set(state.promotions.flatMap(p=>[p.immagine,p.thumb]));return [...state.staged.keys()].every(p=>wanted.has(p));}
function statusHtml(){const summary=state.dirty?'<div class="notice"><strong>Bozza locale.</strong> Le modifiche restano su questo dispositivo finché non confermi la pubblicazione GitHub. Prima di ricaricare il catalogo, esporta una copia di sicurezza.</div>':'';const msg=state.message?`<div class="notice ${state.error?'error':'success'}">${esc(state.message)}</div>`:'';return summary+msg;}
function statHtml(){return `<div class="stats"><div class="stat"><strong>${state.promotions.length}</strong><small>Promozioni</small></div><div class="stat"><strong>${state.promotions.filter(p=>p.attiva).length}</strong><small>Attive</small></div><div class="stat"><strong>${state.promotions.filter(p=>!p.attiva).length}</strong><small>Archiviate</small></div></div>`;}
function render(){for(const b of document.querySelectorAll('.tab'))b.classList.toggle('active',b.dataset.tab===state.tab);
if(state.loading){root.innerHTML='<div class="section"><h2>Collegamento al catalogo A.R.D.…</h2><p class="muted">Lettura dei dati dal repository GitHub.</p></div>';return;}
if(state.tab==='catalogo')renderCatalog();else if(state.tab==='controllo')renderValidation();else if(state.tab==='pubblica')renderPublish();else renderSettings();}
function renderCatalog(){let records=state.promotions.filter(p=>(state.filter==='TUTTE'||p.categoria===state.filter)&&(state.showArchived||p.attiva));const q=state.search.trim().toLowerCase();if(q)records=records.filter(p=>[p.titolo,p.marca,p.codice,p.applicazione,p.motore,p.keywords].join(' ').toLowerCase().includes(q));const reordering= !q && state.filter==='TUTTE' && state.showArchived;
root.innerHTML=`<section class="hero"><div><h2>Catalog Builder su iPad e iPhone</h2><p>Versione 1.3 BETA · Sincronizzazione controllata</p></div><span class="pill">${state.dirty?'Bozza locale':'Aggiornato'}</span></section>${statHtml()}${statusHtml()}
<div class="toolbar"><input id="searchPromo" type="search" placeholder="Cerca marca, codice, veicolo…" aria-label="Cerca promozioni" value="${esc(state.search)}"><button class="btn btn-red" data-action="new">+ Nuova promo</button></div>
<div class="filters"><button class="filter ${state.filter==='TUTTE'?'selected':''}" data-filter="TUTTE">Tutte</button>${CATEGORIES.map(c=>`<button class="filter ${c===state.filter?'selected':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}<button class="filter ${state.showArchived?'selected':''}" data-action="archived">${state.showArchived?'✓ Anche archiviate':'Solo attive'}</button></div>
<div class="cards">${records.length?records.map(p=>promoHtml(p,reordering)).join(''):'<div class="empty">Nessuna promozione trovata.</div>'}</div><p class="footer-help"><strong>BOZZE:</strong> salvate solo sul dispositivo fino alla pubblicazione confermata. L’ordine si modifica con ↑ e ↓ quando visualizzi tutte le promozioni senza filtri. Le immagini vengono caricate da GitHub e possono richiedere connessione Internet.</p>`;
}
function promoHtml(p,canReorder){const pos=state.promotions.findIndex(x=>x.id===p.id);return `<article class="promo"><img loading="lazy" src="${esc(imageURL(p.thumb||p.immagine))}" alt="Immagine ${esc(p.titolo)}"><div class="promo-body"><div class="promo-top"><span class="pill ${p.attiva?'active':'inactive'}">${p.attiva?'ATTIVA':'ARCHIVIATA'}</span><small class="muted">#${esc(p.id)}</small></div><h3>${esc(p.titolo)}</h3><p><strong>${esc(p.marca)}</strong> · ${esc(p.codice)}</p><p>${esc(p.categoria)}</p>${p.prezzo?`<p class="price">${esc(p.prezzo)}</p>`:''}<div class="actions"><button class="btn btn-dark btn-sm" data-action="edit" data-id="${p.id}">Modifica</button><button class="btn btn-light btn-sm" data-action="toggle" data-id="${p.id}">${p.attiva?'Archivia':'Riattiva'}</button>${canReorder?`<button class="order-btn" data-action="up" data-id="${p.id}" aria-label="Sposta in alto" ${pos===0?'disabled':''}>↑</button><button class="order-btn" data-action="down" data-id="${p.id}" aria-label="Sposta in basso" ${pos===state.promotions.length-1?'disabled':''}>↓</button>`:''}</div></div></article>`;}
function validate(){const issues=[];const ids=new Set();for(const p of state.promotions){if(ids.has(p.id))issues.push({ok:false,text:`ID duplicato: ${p.id}`});ids.add(p.id);if(!p.titolo?.trim()||!p.marca?.trim()||!p.codice?.trim())issues.push({ok:false,text:`Promo #${p.id}: titolo, marca o codice mancante`});if(!safePath(p.immagine)||!safePath(p.thumb))issues.push({ok:false,text:`Promo #${p.id}: percorso immagine o miniatura non valido`});if(!CATEGORIES.includes(p.categoria))issues.push({ok:true,text:`Promo #${p.id}: categoria fuori elenco (${p.categoria})`});}if(!stagedStillUsed())issues.push({ok:true,text:'Sono presenti immagini preparate ma non più usate dalle promozioni (non verranno pubblicate).'});return issues;}
function renderValidation(){const issues=validate();root.innerHTML=`<section class="hero"><div><h2>Controllo catalogo</h2><p>Verifica dati prima della pubblicazione</p></div></section>${statusHtml()}<section class="section"><h2>${issues.some(i=>!i.ok)?'Ci sono errori da correggere':issues.length?'Verifica completata con avvisi':'Tutto in ordine'}</h2><div class="checks">${issues.length?issues.map(i=>`<div class="check"><span class="${i.ok?'ok':'bad'}">${i.ok?'!':'✕'}</span><span>${esc(i.text)}</span></div>`).join(''):'<div class="check"><span class="ok">✓</span><span>Nessun ID duplicato e tutti i campi essenziali sono compilati.</span></div>'}</div><p class="footer-help">Questo controllo non può verificare l'esistenza di ogni immagine remota senza scaricare l'intero repository.</p></section>`;}
function renderPublish(){
 const issues=validate(),errors=issues.filter(i=>!i.ok),r=state.review;
 root.innerHTML=`<section class="hero"><div><h2>Pubblica su GitHub</h2><p>Catalogo A.R.D. · Anteprima obbligatoria e controllo conflitti</p></div><span class="pill">BETA 1.3</span></section>${statusHtml()}
 <section class="section"><h2>La tua bozza</h2><p><strong>${state.promotions.length} promozioni</strong> · ${state.staged.size} immagini locali in preparazione</p>
 <p>${state.dirty?'Modifiche presenti solo su questo dispositivo.':'Non ci sono modifiche da pubblicare.'}</p>
 ${errors.length?`<div class="notice error">${errors.length} errori: vai nella scheda Controllo.</div>`:''}
 <button class="btn btn-dark" data-action="preflight" ${!state.dirty||errors.length||state.busy?'disabled':''}>1. Verifica modifiche e conflitti</button>
 ${state.busy?'<p class="notice">Operazione in corso. Non chiudere questa finestra.</p>':''}
 </section>
 ${r?`<section class="section"><h2>Anteprima della pubblicazione</h2>
 <p><strong>${r.changed.length}</strong> promozioni modificate · <strong>${r.added.length}</strong> aggiunte · <strong>${r.deleted.length}</strong> eliminate · <strong>${r.assets.length}</strong> nuovi file immagine</p>
 <div class="checks">${[...r.changed.map(x=>`#${x.id} · ${x.titolo} (${x.fields.join(', ')})`),...r.added.map(x=>`Nuova: #${x.id} · ${x.titolo}`),...r.deleted.map(x=>`Eliminata: #${x.id} · ${x.titolo}`)].map(s=>`<div class="check"><span class="ok">•</span><span>${esc(s)}</span></div>`).join('')}</div>
 <p class="small muted">Verranno aggiornati insieme <code>data/catalogo.json</code> e <code>index.html</code>, oltre alle immagini nuove. Non verranno cancellate quelle precedenti.</p></section>
 <section class="section"><h2>Autorizza la pubblicazione</h2>
 <div class="notice">Il sito GitHub Pages è pubblico. Inserisci un <strong>fine-grained personal access token</strong> limitato a questo repository e con permesso <strong>Contents: Read and write</strong>, con scadenza breve. Il token non viene salvato né ricordato dall’app.</div>
 <label for="githubToken" class="small"><strong>Token GitHub temporaneo</strong></label>
 <input id="githubToken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…" aria-label="Token GitHub">
 <label class="small consent"><input id="confirmedPublish" type="checkbox"> Confermo di voler pubblicare le modifiche nel catalogo online dei clienti.</label>
 <button class="btn btn-red" data-action="publish" ${state.busy?'disabled':''}>2. Pubblica modifiche su GitHub</button>
 <p class="footer-help">Se il catalogo è stato modificato dal Mac dopo il salvataggio della bozza, usa «Riconcilia con GitHub» prima di pubblicare. Nessuna sincronizzazione automatica o sovrascrittura forzata.</p>
 </section>`:''}
 <section class="section"><h2>Gestione bozza</h2><p>Le bozze sono separate dal catalogo dei clienti.</p>
 <div class="flexgap"><button class="btn btn-light" data-action="export-backup" ${state.busy?'disabled':''}>↓ Esporta copia di sicurezza</button>
 <button class="btn btn-dark" data-action="reconcile" ${!state.dirty||state.busy?'disabled':''}>↻ Riconcilia con GitHub</button>
 <label class="btn btn-light" style="cursor:pointer">↑ Importa backup bozza<input id="importBackup" type="file" accept=".json,application/json" style="display:none"></label>
 <button class="btn btn-light" data-action="reload" ${state.busy?'disabled':''}>Ricarica catalogo da GitHub</button>
 ${state.dirty?'<button class="btn btn-danger" data-action="discard">Elimina bozza</button>':''}</div>
 <p class="footer-help">Riconcilia conserva la bozza e importa gli aggiornamenti GitHub soltanto quando non ci sono conflitti sugli stessi dati. Se entrambi i dispositivi hanno modificato la stessa voce, la procedura si ferma.</p></section>`;
}
function renderSettings(){root.innerHTML=`<section class="hero"><div><h2>Impostazioni</h2><p>Catalog Builder Mobile · v1.3 BETA</p></div></section><section class="section"><h2>Catalogo collegato</h2><p><strong>${esc(REPO)}</strong><br><span class="muted small">Branch: ${BRANCH} · GitHub Pages</span></p><p><a href="${PUBLIC_BASE}" target="_blank" rel="noopener noreferrer">Apri il catalogo online ↗</a></p></section><section class="section"><h2>Sicurezza</h2><p>Il token GitHub viene richiesto soltanto quando premi Pubblica e non viene memorizzato in locale. La BETA confronta la versione GitHub prima di pubblicare; puoi anche riconciliare modifiche non sovrapposte. Non memorizziamo il token sul dispositivo.</p><p class="small muted">La pagina resta visibile pubblicamente: non scrivere password o informazioni riservate nelle promozioni.</p></section><section class="section"><h2>Ricarica</h2><p>Ricaricare dal repository elimina la bozza locale: usa questa funzione soltanto se non ti serve più.</p><button class="btn btn-light" data-action="reload">Ricarica catalogo online</button></section>`;}
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
async function api(path,options={}){
 const {method='GET',token=null,body=null}=options;
 const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 if(token)headers.Authorization=`Bearer ${token}`;
 if(body!==null)headers['Content-Type']='application/json';
 let response;
 try{response=await fetch(API+path,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error'});}
 catch{throw new Error('Connessione a GitHub non disponibile. Verifica Internet e riprova.');}
 let payload;try{payload=await response.json();}catch{payload=null;}
 if(!response.ok){
  if(response.status===401)throw new Error('Token GitHub non valido o scaduto (401).');
  if(response.status===403)throw new Error('Autorizzazione insufficiente o limite GitHub (403). Verifica Contents: Read and write e il repository selezionato.');
  if(response.status===409||response.status===422)throw new Error('GitHub segnala un conflitto o dati non validi. Controlla la versione remota prima di riprovare ('+response.status+').');
  throw new Error(`${payload?.message||response.statusText} (HTTP ${response.status})`);
 }
 return payload;
}
function decodeGitHubBase64(value){const raw=atob(String(value||'').replace(/\s/g,''));const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
async function currentRef(){return (await api(`/git/ref/heads/${BRANCH}`)).object.sha;}
async function loadRemote(force=false){if(state.dirty&&!force&&!confirm('Hai modifiche non pubblicate. Vuoi eliminarle e ricaricare il catalogo online?'))return;state.loading=true;render();try{const head=await currentRef();const [commit,json,index]=await Promise.all([api(`/git/commits/${head}`),api(`/contents/data/catalogo.json?ref=${head}`),api(`/contents/index.html?ref=${head}`)]);const list=JSON.parse(decodeGitHubBase64(json.content));if(!Array.isArray(list))throw new Error('Catalogo GitHub non valido.');state.promotions=list;state.baseHead=head;state.baseTree=commit.tree.sha;state.indexHTML=decodeGitHubBase64(index.content);state.dirty=false;state.review=null;state.needsReload=false;state.search='';state.filter='TUTTE';state.showArchived=true;state.error=false;state.message=`Catalogo caricato da GitHub (${list.length} promozioni).`;await stageClear();clearDraft();toast('Catalogo aggiornato.');}catch(e){state.error=true;state.message=e.message;toast(e.message);}finally{state.loading=false;render();}}
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
  if(now!==state.baseHead)throw new Error('CONFLITTO: il catalogo GitHub è cambiato dopo la creazione della bozza. Le tue modifiche sono ancora sul dispositivo. NON ricaricare finché non hai verificato come recuperarle.');
  const original=await api(`/contents/data/catalogo.json?ref=${encodeURIComponent(state.baseHead)}`);
  const oldList=JSON.parse(decodeGitHubBase64(original.content));
  const embedded=locateEmbeddedJSON(state.indexHTML).data;
  if(canonical(embedded)!==canonical(oldList))throw new Error('index.html e catalogo.json non sono coerenti: interrompo la pubblicazione.');
  state.originalLength=oldList.length;
  const diff=diffPromos(oldList,state.promotions),assets=usedStaged().map(x=>x[0]);
  if(!diff.changed.length&&!diff.added.length&&!diff.deleted.length&&!assets.length)throw new Error('La bozza non contiene modifiche effettive rispetto al catalogo online.');
  const html=embeddedHTML(state.promotions);locateEmbeddedJSON(html);
  state.review={...diff,assets,head:now};
  state.error=false;state.message='Verifica completata. Controlla attentamente l’anteprima prima di pubblicare.';
 }catch(e){state.error=true;state.message=e.message;toast(e.message);}
 finally{state.busy=false;render();}
}
async function publishNow(){
 if(state.busy||!state.review||!state.dirty)return;
 const tokenEl=document.getElementById('githubToken');const consent=document.getElementById('confirmedPublish');
 const token=(tokenEl?.value||'').trim();if(tokenEl)tokenEl.value='';
 if(!consent?.checked){toast('Spunta prima la conferma di pubblicazione.');return;}
 if(!/^github_pat_[a-zA-Z0-9_]+$/.test(token)){toast('Inserisci un fine-grained GitHub token valido.');return;}
 const total=state.review.changed.length+state.review.added.length+state.review.deleted.length;
 if(!confirm(`PUBBLICAZIONE ONLINE REALE\n\n${total} promozioni modificate/aggiunte/eliminate, ${state.review.assets.length} immagini nuove.\n\nConfermi che le officine potranno vedere queste modifiche?`))return;
 state.busy=true;const reviewed=state.review;state.review=null;state.error=false;state.message='Verifica versione online…';render();
 let committedSha=null;
 try{
  if((await currentRef())!==reviewed.head)throw new Error('Il catalogo è cambiato su GitHub. Pubblicazione annullata, bozza conservata.');
  const u=await api(`/git/ref/heads/${BRANCH}`,{token});if(!u?.object?.sha)throw new Error('Non riesco a verificare le credenziali GitHub.');
  state.message='Preparo i file del catalogo…';render();
  const json=JSON.stringify(state.promotions,null,2)+'\n';
  const html=embeddedHTML(state.promotions);
  // Atomic change: assets and both catalog files point to one new commit.
  const entries=[
   {path:'data/catalogo.json',mode:'100644',type:'blob',content:json},
   {path:'index.html',mode:'100644',type:'blob',content:html}
  ];
  for(const [path,asset] of usedStaged()){
   if(!safePath(path)||!/^image\/(webp|png|jpeg)$/.test(asset.mime))throw new Error('Immagine locale non valida: '+path);
   state.message='Carico le nuove immagini…';render();
   const blob=await api('/git/blobs',{method:'POST',token,body:{content:asset.base64,encoding:'base64'}});
   entries.push({path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const tree=await api('/git/trees',{method:'POST',token,body:{base_tree:state.baseTree,tree:entries}});
  const commit=await api('/git/commits',{method:'POST',token,body:{message:`A.R.D. Catalog Builder Mobile: aggiornamento ${today()}`,tree:tree.sha,parents:[reviewed.head]}});
  committedSha=commit.sha;
  if((await currentRef())!==reviewed.head)throw new Error('Un altro aggiornamento GitHub è arrivato durante la preparazione. Pubblicazione annullata, bozza conservata.');
  await api(`/git/refs/heads/${BRANCH}`,{method:'PATCH',token,body:{sha:commit.sha,force:false}});
  await publishSucceeded(commit.sha);
 }catch(e){
  // A lost connection after PATCH can make the result uncertain: check GitHub before retrying.
  if(committedSha){try{if((await currentRef())===committedSha){await publishSucceeded(committedSha);return;}}catch{}}
  state.error=true;state.message='Pubblicazione NON confermata: '+e.message+' Conserviamo la bozza; verifica il repository prima di tentare di nuovo.';
  toast('Pubblicazione non confermata; la bozza è stata conservata.');
 }finally{state.busy=false;render();}
}
async function publishSucceeded(sha){
 state.publishedSha=sha;
 state.baseHead=sha;state.baseTree=null;state.indexHTML=null;state.originalLength=null;
 state.dirty=false;state.review=null;state.needsReload=true;clearDraft();await stageClear();
 state.error=false;state.message=`Pubblicazione inviata a GitHub con successo (commit ${sha.slice(0,9)}). La pagina potrebbe aggiornarsi dopo qualche minuto. Ricarica il catalogo dal repository prima di nuove modifiche.`;
 state.tab='pubblica';toast('GitHub aggiornato!');
}

// VERSIONE 1.3 — export completo della bozza per trasferimento/backup. Mai includere credenziali.
async function exportBackup(){
 if(!state.promotions.length){toast('Non ci sono promozioni da esportare.');return;}
 const pack={format:'ARD-CATALOG-BUILDER-BACKUP',version:1,created:new Date().toISOString(),repo:REPO,
  promotions:state.promotions,baseHead:state.baseHead,baseTree:state.baseTree,indexHTML:state.indexHTML,
  images:[...state.staged].map(([path,asset])=>({path,mime:asset.mime,base64:asset.base64}))};
 const blob=new Blob([JSON.stringify(pack)],{type:'application/json'});
 const fileName='ARD-Catalog-Backup-'+today()+'.json';
 try{
  const file=new File([blob],fileName,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Backup bozza Catalog Builder A.R.D.'});return;}
 }catch(e){if(e?.name==='AbortError')return;}
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
 toast('Copia di sicurezza creata. Conservala nell’app File.');
}

// Importa un backup da File senza perdere nulla finché ogni campo e immagine è verificato.
async function importBackup(file){
 if(!file||state.busy)return;
 if(file.size>30_000_000){toast('Backup troppo grande (massimo 30 MB).');return;}
 state.busy=true;
 try{
  const data=JSON.parse(await file.text());
  if(data?.format!=='ARD-CATALOG-BUILDER-BACKUP'||data.version!==1||data.repo!==REPO||
   !Array.isArray(data.promotions)||data.promotions.length>500||!data.promotions.length||
   typeof data.indexHTML!=='string'||!Array.isArray(data.images)||data.images.length>100||
   !/^[a-f0-9]{40}$/.test(data.baseHead)||!/^[a-f0-9]{40}$/.test(data.baseTree))throw new Error('Backup A.R.D. non valido.');
  const ids=new Set();
  for(const p of data.promotions){
   if(!Number.isSafeInteger(p.id)||ids.has(p.id)||!safePath(p.immagine)||!safePath(p.thumb)||
    typeof p.titolo!=='string'||typeof p.marca!=='string'||typeof p.codice!=='string')throw new Error('Il backup contiene una promozione non valida.');
   ids.add(p.id);
  }
  locateEmbeddedJSON(data.indexHTML);
  let totalBytes=0;const files=[];
  for(const a of data.images){
   if(!safePath(a.path)||!/^image\/(?:png|jpeg|webp)$/.test(a.mime)||typeof a.base64!=='string'||
    !/^[a-zA-Z0-9+/]*={0,2}$/.test(a.base64)||a.base64.length>13_000_000)throw new Error('Il backup contiene un’immagine non valida.');
   totalBytes+=a.base64.length;if(totalBytes>26_000_000)throw new Error('Le immagini del backup sono troppo grandi.');
   files.push(a);
  }
  if(!confirm('Importare questo backup? Sostituirà la bozza e le immagini salvate su questo dispositivo. Esporta prima la bozza attuale se ti serve.'))return;
  const db=await dbOpen();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction('files','readwrite');const store=tx.objectStore('files');store.clear();
    for(const f of files)store.put({path:f.path,mime:f.mime,base64:f.base64});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Impossibile salvare le immagini del backup.'));tx.onabort=()=>reject(tx.error||new Error('Importazione annullata.'));
   });}finally{db.close();}
  resetImageURLs();state.staged=new Map(files.map(x=>[x.path,{mime:x.mime,base64:x.base64}]));
  state.promotions=data.promotions;state.baseHead=data.baseHead;state.baseTree=data.baseTree;
  state.indexHTML=data.indexHTML;state.review=null;state.dirty=true;state.error=false;state.needsReload=false;
  state.message='Bozza importata. Verifica o riconcilia con GitHub prima di pubblicare.';
  persistDraft();toast('Backup importato: nessuna pubblicazione effettuata.');
 }catch(e){state.error=true;state.message='Importazione non completata: '+e.message;toast('Importazione non riuscita.');}
 finally{state.busy=false;render();}
}

// Unisce soltanto modifiche non in conflitto, partendo da vecchio, bozza locale e GitHub attuale.
// Nessun commit/push durante la riconciliazione. Ogni voce mantiene il proprio ID.
function mergeUnrelated(base,local,remote){
 const byId=items=>new Map(items.map(p=>[p.id,p]));
 const oldMap=byId(base),locMap=byId(local),remMap=byId(remote),errors=[];
 const originalIDs=new Set(base.map(p=>p.id));
 const orderPreserved=items=>{
  const ids=items.filter(p=>originalIDs.has(p.id)).map(p=>p.id);
  const set=new Set(ids);
  const baseOrder=base.filter(p=>set.has(p.id)).map(p=>p.id);
  return JSON.stringify(ids)===JSON.stringify(baseOrder);
 };
 if(!orderPreserved(local)||!orderPreserved(remote))errors.push('L’ordine delle promozioni è stato modificato: riconciliazione manuale necessaria.');
 const merged=remote.map(p=>({...p}));const mergedMap=byId(merged);const newLocal=[];
 for(const item of local){
  const old=oldMap.get(item.id),latest=remMap.get(item.id);
  if(!old){if(latest)errors.push(`#${item.id}: ID aggiunto su entrambi i dispositivi.`);else newLocal.push({...item});continue;}
  if(!latest){if(JSON.stringify(item)!==JSON.stringify(old))errors.push(`#${item.id}: modificata sull’iPad ma eliminata su GitHub.`);continue;}
  const keys=[...new Set([...Object.keys(old),...Object.keys(item)])];
  for(const field of keys){
   const earlier=JSON.stringify(old[field]),mine=JSON.stringify(item[field]),online=JSON.stringify(latest[field]);
   if(mine===earlier)continue;
   if(online!==earlier&&online!==mine){errors.push(`#${item.id}: campo «${field}» modificato sia su Mac/GitHub che su iPad.`);continue;}
   mergedMap.get(item.id)[field]=item[field];
  }
 }
 for(const old of base){
  if(locMap.has(old.id))continue;
  const now=remMap.get(old.id);
  if(now&&JSON.stringify(now)!==JSON.stringify(old))errors.push(`#${old.id}: eliminata su iPad ma modificata su GitHub.`);
  if(now){const n=merged.findIndex(p=>p.id===old.id);if(n>=0)merged.splice(n,1);}
 }
 for(const p of newLocal)merged.unshift(p);
 return {merged,errors};
}

async function reconcileDraft(){
 if(!state.dirty||state.busy)return;
 if(!confirm('Riconciliare la bozza con l’ultima versione GitHub? Non verrà pubblicato nulla. Se possibile, esporta prima un backup della bozza.'))return;
 state.busy=true;state.message='Confronto la bozza con GitHub…';state.error=false;render();
 try{
  const current=await currentRef();
  if(current===state.baseHead){state.message='La bozza è già basata sull’ultima versione GitHub. Puoi fare «Verifica modifiche e conflitti».';return;}
  const [previous,newData,newHTML,commit]=await Promise.all([
   api(`/contents/data/catalogo.json?ref=${encodeURIComponent(state.baseHead)}`),
   api(`/contents/data/catalogo.json?ref=${encodeURIComponent(current)}`),
   api(`/contents/index.html?ref=${encodeURIComponent(current)}`),
   api(`/git/commits/${current}`)
  ]);
  const before=JSON.parse(decodeGitHubBase64(previous.content));
  const latest=JSON.parse(decodeGitHubBase64(newData.content));
  const html=decodeGitHubBase64(newHTML.content);
  if(!Array.isArray(before)||!Array.isArray(latest)||JSON.stringify(locateEmbeddedJSON(state.indexHTML).data)!==JSON.stringify(before)||JSON.stringify(locateEmbeddedJSON(html).data)!==JSON.stringify(latest))
   throw new Error('Il catalogo JSON e la pagina HTML non sono coerenti. Nessuna modifica applicata.');
  const result=mergeUnrelated(before,state.promotions,latest);
  if(result.errors.length)throw new Error('RICONCILIAZIONE BLOCCATA: '+result.errors.slice(0,4).join(' ')+' La bozza è ancora conservata.');
  if((await currentRef())!==current)throw new Error('GitHub è cambiato durante il controllo. Riprova: la bozza è conservata.');
  if(!confirm('Nessun conflitto sui dati modificati. Integrare gli aggiornamenti GitHub nella bozza, senza pubblicare nulla?'))return;
  state.promotions=result.merged;state.baseHead=current;state.baseTree=commit.tree.sha;state.indexHTML=html;
  state.dirty=true;state.review=null;state.originalLength=latest.length;
  persistDraft();state.message='Bozza riconciliata senza conflitti. Ora premi «Verifica modifiche e conflitti». Nessuna pubblicazione eseguita.';
  state.error=false;toast('Bozza riconciliata con GitHub.');
 }catch(e){state.error=true;state.message=e.message;toast('Riconciliazione fermata: bozza al sicuro.');}
 finally{state.busy=false;render();}
}

async function discard(){if(!state.dirty)return;await loadRemote(false);}
root.addEventListener('click',async event=>{const b=event.target.closest('[data-action],[data-filter]');if(!b||state.busy)return;if(b.dataset.filter){state.filter=b.dataset.filter;render();return;}const action=b.dataset.action;if(state.needsReload&&['edit','new','toggle','up','down'].includes(action)){toast('Ricarica prima da GitHub per modificare nuovamente.');return;}const id=Number(b.dataset.id);const p=state.promotions.find(x=>x.id===id);switch(action){case'new':editDialog();break;case'edit':if(p)editDialog(p);break;case'toggle':if(p){p.attiva=!p.attiva;p.dataAggiornamento=today();dirty();}break;case'up':case'down':{let i=state.promotions.findIndex(x=>x.id===id);let j=i+(action==='up'?-1:1);if(i<0||j<0||j>=state.promotions.length)return;[state.promotions[i],state.promotions[j]]=[state.promotions[j],state.promotions[i]];dirty();break;}case'archived':state.showArchived=!state.showArchived;render();break;case'discard':await discard();break;case'reload':await loadRemote();break;case'preflight':await preflight();break;case'export-backup':await exportBackup();break;case'reconcile':await reconcileDraft();break;case'publish':await publishNow();break;}});
root.addEventListener('input',event=>{if(event.target.id==='searchPromo'){const input=event.target;const i=input.selectionStart;state.search=input.value;render();const next=document.getElementById('searchPromo');next?.focus();next?.setSelectionRange(i,i);}});

dialog.addEventListener('click',event=>{if(event.target.closest('[data-action="close-dialog"]'))closeDialog();});
dialog.addEventListener('close',()=>{editingImage=null;});
dialog.addEventListener('submit',event=>{if(event.target.id==='promoForm')savePromo(event);});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;render();window.scrollTo({top:0,behavior:'smooth'});}));
document.getElementById('refreshBtn').addEventListener('click',()=>loadRemote());
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();}});
(async()=>{if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});if(draftRestore()){await stageLoad();render();}else await loadRemote(true);})();
