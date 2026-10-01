/* =========================================================
   سند - Service Worker
   يخلي الموقع يشتغل كتطبيق مثبّت (PWA) ويحتفظ بنسخة من
   الصفحات الأساسية للفتح السريع حتى لو ضعف الإنترنت.

   ملاحظة: بيانات المشتركين والمواعيد نفسها تبقى تحتاج إنترنت
   دائماً (لأنها من Supabase)، هذا الملف بس يسرّع فتح شكل
   الصفحة نفسها.
========================================================= */

const SANAD_CACHE_NAME = "sanad-cache-v2";

const SANAD_PRECACHE_FILES = [
  "./login.html",
  "./staff-login.html",
  "./elder-login.html",
  "./family-login.html",
  "./style.css",
  "./sanad-db.js",
  "./manifest.json",
  "./icons/final/icon-192.png",
  "./icons/final/icon-512.png"
];

/* التثبيت: نخزن نسخة من الصفحات الأساسية */

self.addEventListener("install", function(event){

  event.waitUntil(
    caches.open(SANAD_CACHE_NAME).then(function(cache){
      return cache.addAll(SANAD_PRECACHE_FILES).catch(function(error){
        console.warn("تعذر تخزين بعض الملفات مسبقاً:", error);
      });
    })
  );

  self.skipWaiting();

});

/* التفعيل: حذف أي نسخة كاش قديمة */

self.addEventListener("activate", function(event){

  event.waitUntil(
    caches.keys().then(function(cacheNames){
      return Promise.all(
        cacheNames
          .filter(function(name){ return name !== SANAD_CACHE_NAME; })
          .map(function(name){ return caches.delete(name); })
      );
    })
  );

  self.clients.claim();

});

/* الجلب: نحاول الشبكة أولاً (حتى تكون البيانات حديثة)،
   ولو فشل الاتصال نرجع للنسخة المخزنة إن وجدت */

self.addEventListener("fetch", function(event){

  if(event.request.method !== "GET"){
    return;
  }

  /* لا نخزّن طلبات Supabase أبداً - لازم تكون حية دائماً */
  if(event.request.url.indexOf("supabase.co") !== -1){
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(function(response){
        const responseClone = response.clone();
        caches.open(SANAD_CACHE_NAME).then(function(cache){
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(function(){
        return caches.match(event.request);
      })
  );

});

/* =========================================================
   الإشعارات الفورية (Push Notifications)
   يشتغل هذا حتى لو التطبيق مسكر تماماً بالموبايل/الكمبيوتر
========================================================= */

self.addEventListener("push", function(event){

  let data = {};
  try{
    data = event.data ? event.data.json() : {};
  }catch(error){
    data = { title: "سند", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "سند";
  const options = {
    body: data.body || "",
    icon: "./icons/final/icon-192.png",
    badge: "./icons/final/icon-192.png",
    data: { url: data.url || "./" }
  };

  event.waitUntil(self.registration.showNotification(title, options));

});

/* وقت المستخدم يدوس على الإشعار، نفتحله الصفحة المناسبة */

self.addEventListener("notificationclick", function(event){

  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "./";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(windowClients){
      for(let i = 0; i < windowClients.length; i++){
        const client = windowClients[i];
        if(client.url.indexOf(targetUrl.replace("./", "")) !== -1 && "focus" in client){
          return client.focus();
        }
      }
      if(clients.openWindow){
        return clients.openWindow(targetUrl);
      }
    })
  );

});
