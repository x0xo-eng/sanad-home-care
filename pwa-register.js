/* =========================================================
   سند - تسجيل Service Worker
   ضعه بكل صفحة HTML، قبل إغلاق </body> مباشرة:
   <script src="pwa-register.js"></script>
========================================================= */

if("serviceWorker" in navigator){
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").then(function(){
      console.log("سند: تم تفعيل وضع التطبيق (PWA) بنجاح.");
    }).catch(function(error){
      console.warn("سند: تعذر تفعيل Service Worker:", error);
    });
  });
}
