(function(){
 const el=document.getElementById('bootStatus');
 function warn(message){el.hidden=false;el.textContent=message;el.classList.add('boot-error');}
 window.addEventListener('error',function(ev){if(ev.filename&&ev.filename.includes('/admin-mobile-beta14/'))warn('Errore JavaScript nella BETA 1.4.0: '+ev.message+'. La versione 1.2 non è stata modificata.');});
 window.addEventListener('unhandledrejection',function(ev){warn('Errore imprevisto della BETA 1.4.0: '+String(ev.reason?.message||ev.reason||'errore sconosciuto'));});
 setTimeout(function(){if(!window.__ARD_BETA14_STARTED)warn('La BETA 1.4.0 non si è avviata correttamente. Controlla il caricamento dei file. La BETA 1.2 resta intatta.');},9500);
})();
