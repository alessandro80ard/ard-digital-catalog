const CACHE_NAME='ard-builder-mobile-v1.1-test';
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ard-builder-mobile-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request, url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 // Non memorizzare mai le risposte delle API GitHub né i dati del catalogo.
 event.respondWith(fetch(req).then(res=>{
   if(res.ok && SHELL.some(f=>new URL(f,self.registration.scope).pathname===url.pathname)){
     const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy)).catch(()=>{});
   }
   return res;
 }).catch(()=>caches.match(req).then(x=>x||Response.error())));
});
