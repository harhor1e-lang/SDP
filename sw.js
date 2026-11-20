const CACHE_NAME='salah-aldin-pwa-v1';
const APP_SHELL=['./','./index.html','./manifest.webmanifest','./app-icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy));}
      return response;
    }).catch(()=>caches.match('./index.html').then(cached=>cached||caches.match('./'))));
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(caches.match(request).then(cached=>{
      const network=fetch(request).then(response=>{
        if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
        return response;
      }).catch(()=>cached);
      return cached||network;
    }));
    return;
  }
  if(['script','style','font'].includes(request.destination)){
    event.respondWith(caches.match(request).then(cached=>{
      const network=fetch(request).then(response=>{
        if(response&&(response.ok||response.type==='opaque')){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
        return response;
      }).catch(()=>cached);
      return cached||network;
    }));
  }
});
self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?event.data.json():{};}catch(_){payload={body:event.data?event.data.text():'يوجد تحديث جديد في منصة المدرسة'};}
  const title=payload.title||'إعدادية صلاح الدين للبنين';
  const options={body:payload.body||payload.message||'تم نشر تحديث جديد في منصة المدرسة',icon:'./app-icon.svg',badge:'./app-icon.svg',tag:payload.tag||'salah-aldin-update',renotify:false,data:{url:payload.url||'./'}};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data&&event.notification.data.url||'./',self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    for(const client of clients){if(client.url.startsWith(self.registration.scope)&&'focus'in client)return client.focus();}
    return self.clients.openWindow?self.clients.openWindow(target):undefined;
  }));
});
