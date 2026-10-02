/* =========================================================
   سند - ملف الاتصال بقاعدة البيانات (Supabase)
   الملف: sanad-db.js

   هذا الملف يحل محل التخزين المحلي (localStorage) ويربط
   الموقع بقاعدة بيانات حقيقية على الإنترنت.

   ضعه بكل صفحة بعد سكربت مكتبة Supabase مباشرة:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="sanad-db.js"></script>
========================================================= */

/* =========================================================
   1. بيانات الاتصال بالمشروع
========================================================= */

const SANAD_SUPABASE_URL = "https://lfiapezircguatazlchk.supabase.co";
const SANAD_SUPABASE_KEY = "sb_publishable_A14QmMkXFTasjbdy9kMydA_oU6o6vud";

const sanadClient = supabase.createClient(
  SANAD_SUPABASE_URL,
  SANAD_SUPABASE_KEY
);

/* =========================================================
   1-أ. رقم واتساب الطوارئ / التواصل السريع
   =========================================================
   اكتب رقم الواتساب هنا بالصيغة الدولية بدون + أو أصفار بالأول
   (مثال: رقم عراقي 07701234567 يصير 9647701234567)
   لو تركته فاضي "" زر الطوارئ ما يظهر للمسن والعائلة أبداً،
   يعني تكدر تضيفه بأي وقت بس تسوي بس تعدل هذا السطر.
========================================================= */

const SANAD_EMERGENCY_WHATSAPP_NUMBER = "";

function sanadGetEmergencyWhatsAppLink(message) {
  if (!SANAD_EMERGENCY_WHATSAPP_NUMBER) {
    return null;
  }
  const text = encodeURIComponent(message || "مرحباً، أحتاج مساعدة بخصوص اشتراكي بسند.");
  return "https://wa.me/" + SANAD_EMERGENCY_WHATSAPP_NUMBER + "?text=" + text;
}

/* معرّف "فارغ" نستخدمه لحيلة حذف كل الصفوف (Supabase يطلب شرط فلترة دائماً) */
const SANAD_EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

/* =========================================================
   1-د. الإشعارات الفورية (Push Notifications)
   =========================================================
   المفتاح العام (VAPID Public Key) - آمن يكون بالكود الظاهر،
   هذا طبيعي وموجود بكل أنظمة الإشعارات (المفتاح الخاص محفوظ
   بسرية بإعدادات Supabase Edge Function، مو هنا إطلاقاً)
========================================================= */

const SANAD_VAPID_PUBLIC_KEY =
  "BCl81XuBPD7WhRPqQumOyYejb7myG2FxW4P0oYu2uFLUSl5W-dwhP32YBl_5gJrpSxXj-wI1UKhd03-ZNnCPFz4";

const SANAD_PUSH_FUNCTION_URL =
  SANAD_SUPABASE_URL + "/functions/v1/send-push";

function sanadUrlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/* يلف أي Promise بمهلة زمنية، حتى ما يضل الزر "جارِ التفعيل..."
   عالق للأبد لو تعطلت خطوة معينة (مثلاً الاتصال بخدمة الإشعارات) */
function sanadWithTimeout(promise, ms, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error(timeoutMessage || "انتهت مهلة الانتظار."));
      }, ms);
    })
  ]);
}

/* يفعّل الإشعارات لهذا الجهاز لمستخدم معيّن (مسن / عائلة / كادر)
   ملاحظة مهمة: لازم تُستدعى هذي الدالة مباشرة من داخل معالج ضغطة
   الزر (click) بدون أي "await" قبلها، وإلا متصفح آيفون (Safari)
   يرفض يظهر نافذة طلب الإذن ويضل الطلب معلّق للأبد بصمت */
async function sanadSubscribeToPush(subscriberType, subscriberId) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return {
        success: false,
        message:
          "هذا الجهاز/المتصفح ما يدعم الإشعارات الفورية. على آيفون لازم: (1) نظام iOS 16.4 فأعلى، و(2) تفتح سند من أيقونة الشاشة الرئيسية (مثبّت كتطبيق) مو من متصفح Safari مباشرة."
      };
    }

    const permission = await sanadWithTimeout(
      Notification.requestPermission(),
      60000,
      "ما ظهرت نافذة طلب الإذن أو ما تم الرد عليها خلال وقت كافٍ."
    );
    if (permission !== "granted") {
      return { success: false, message: "لازم توافق على إذن الإشعارات من المتصفح." };
    }

    const registration = await sanadWithTimeout(
      navigator.serviceWorker.ready,
      15000,
      "تعذر تجهيز خدمة الإشعارات (Service Worker) بالوقت المحدد."
    );

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await sanadWithTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: sanadUrlBase64ToUint8Array(SANAD_VAPID_PUBLIC_KEY)
        }),
        20000,
        "تعذر الاتصال بخدمة الإشعارات (قد تكون مشكلة بالشبكة أو الإنترنت)."
      );
    }

    const subJson = subscription.toJSON();

    const { error } = await sanadClient.from("push_subscriptions").insert({
      subscriber_type: subscriberType,
      subscriber_id: subscriberId,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth
    });

    /* لو نفس الاشتراك موجود مسبقاً (endpoint مكرر)، نعتبرها نجاح */
    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      return { success: false, message: error.message };
    }

    try { localStorage.setItem("sanadPushEnabled", "true"); } catch (e) {}

    return { success: true };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/* يتحقق إذا الإشعارات مفعّلة بهذا الجهاز حالياً */
async function sanadIsPushSubscribed() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch (error) {
    return false;
  }
}

/* يرسل إشعار فعلي عبر Edge Function، يُستخدم من داخل التطبيق
   target أشكاله الممكنة:
     { type: "customer", id: customerId }
     { type: "family", id: familyMemberId }
     { type: "staff_role", roles: ["owner","manager"] }
     { type: "broadcast" }  (المالك فقط) */
async function sanadSendPushNotification(target, title, body, url) {
  try {
    const { data: sessionData } = await sanadClient.auth.getSession();
    const accessToken = sessionData && sessionData.session && sessionData.session.access_token;

    if (!accessToken) {
      return { success: false, message: "لا توجد جلسة دخول صالحة لإرسال الإشعار." };
    }

    const response = await fetch(SANAD_PUSH_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accessToken
      },
      body: JSON.stringify({ target: target, title: title, body: body, url: url })
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, message: result.error || "تعذر إرسال الإشعار." };
    }

    return { success: true, sent: result.sent, failed: result.failed };
  } catch (error) {
    /* ما نوقف أي عملية بالتطبيق بسبب فشل الإشعار */
    return { success: false, message: String(error) };
  }
}

/* =========================================================
   1-هـ. سجل الإشعارات الدائم (notifications_log)
   =========================================================
   هذا مختلف عن الإشعار الفوري (push) - هذا سجل يبقى محفوظ
   بقاعدة البيانات ويظهر بقائمة "🔔 الإشعارات" داخل كل لوحة،
   حتى لو المستخدم ما فعّل الإشعارات الفورية بجهازه أو كان
   التطبيق مسكر وقت الإرسال */

/* يرجع آخر الإشعارات لحساب معيّن (مسن/عائلة/كادر)
   recipientType: "customer" | "family" | "staff"
   options.includeBroadcast: افتراضياً true للمسن والعائلة،
   و false تلقائياً للكادر (رسائل المالك الجماعية خاصة بالمشتركين فقط) */
async function sanadGetNotificationsLog(recipientType, recipientId, options) {
  options = options || {};
  const includeBroadcast =
    options.includeBroadcast !== false && recipientType !== "staff";

  let orFilter =
    "and(recipient_type.eq." + recipientType + ",recipient_id.eq." + recipientId + ")";
  if (includeBroadcast) {
    orFilter += ",recipient_type.eq.broadcast";
  }

  const { data, error } = await sanadClient
    .from("notifications_log")
    .select("*")
    .or(orFilter)
    .order("created_at", { ascending: false })
    .limit(options.limit || 30);

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}

/* تتبّع "آخر مرة فتح فيها المستخدم قائمة الإشعارات" محلياً
   بهذا الجهاز، حتى نعرف شنو جديد (نقطة حمراء بالجرس) */
function sanadGetNotificationsSeenKey(recipientType, recipientId) {
  return "sanadNotifSeenAt_" + recipientType + "_" + recipientId;
}

function sanadMarkNotificationsSeen(recipientType, recipientId) {
  try {
    localStorage.setItem(
      sanadGetNotificationsSeenKey(recipientType, recipientId),
      new Date().toISOString()
    );
  } catch (e) {}
}

function sanadCountUnseenNotifications(recipientType, recipientId, notifications) {
  let seenAt = null;
  try {
    seenAt = localStorage.getItem(sanadGetNotificationsSeenKey(recipientType, recipientId));
  } catch (e) {}

  if (!seenAt) {
    return (notifications || []).length;
  }

  const seenTime = new Date(seenAt).getTime();
  return (notifications || []).filter(function (n) {
    return new Date(n.created_at).getTime() > seenTime;
  }).length;
}

/* يهرّب أي نص قبل حقنه بـ innerHTML، حتى ما ينكسر التصميم أو
   يصير ثغرة لو احتوى اسم/رسالة على رموز HTML */
function sanadEscapeHTML(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ينسّق "منذ متى" بشكل مختصر بالعربي (مثل: الآن، قبل 5 دقائق...) */
function sanadFormatRelativeTime(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return "قبل " + diffMin + " دقيقة";
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return "قبل " + diffHour + " ساعة";
  const diffDay = Math.floor(diffHour / 24);
  return "قبل " + diffDay + " يوم";
}

/* =========================================================
   1-ج. إنشاء حساب دخول حقيقي (Supabase Auth) لمسن أو فرد عائلة
   بدون ما يسجل خروج موظف الاستقبال من حسابه الحالي.

   المشكلة اللي نحلها: sanadClient هو نفس الاتصال المستخدم لجلسة
   تسجيل دخول الموظف الحالي. لو استخدمناه مباشرة لإنشاء حساب جديد
   (auth.signUp)، نظام Supabase يستبدل الجلسة الحالية بجلسة
   الحساب الجديد ويطلع الموظف من حسابه فجأة.
   الحل: نسوي اتصال "مؤقت" منفصل تماماً (persistSession: false)
   يصير بس لحظة إنشاء الحساب الجديد، ولا يلمس جلسة الموظف إطلاقاً.
========================================================= */

async function sanadCreateAuthAccount(email, password) {
  try {
    const tempClient = supabase.createClient(
      SANAD_SUPABASE_URL,
      SANAD_SUPABASE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    const { data, error } = await tempClient.auth.signUp({
      email: email,
      password: password
    });

    if (error) {
      /* إذا الحساب موجود مسبقاً (نادراً، أو إعادة محاولة)، نعتبرها
         نجاح حتى ما توقف عملية تسجيل المشترك بالكامل */
      if (String(error.message || "").toLowerCase().includes("already registered")) {
        return { success: true, alreadyExisted: true };
      }
      return { success: false, message: error.message };
    }

    return { success: true, data: data };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/* =========================================================
   1-أ-2. إصلاح حساب دخول مشترك قديم (ناقص الحساب الحقيقي)
   تُستخدم لمشتركين انسجلوا قبل تفعيل الإنشاء التلقائي للحساب
========================================================= */

async function sanadRepairCustomerLogin(customerId) {
  const { data: customer, error: customerError } = await sanadClient
    .from("customers")
    .select("*, family_members(*)")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError || !customer) {
    return { success: false, message: "تعذر إيجاد بيانات المشترك." };
  }

  const results = [];

  if (customer.phone) {
    const r = await sanadCreateAuthAccount(
      customer.phone + "@sanad-customer.internal",
      customer.password || customer.phone
    );
    results.push("المسن: " + (r.success ? "✅" : "❌ " + r.message));
  }

  const familyMember = (customer.family_members && customer.family_members[0]) || null;

  if (familyMember && familyMember.phone) {
    const r = await sanadCreateAuthAccount(
      familyMember.phone + "@sanad-family.internal",
      familyMember.password || familyMember.phone
    );
    results.push("العائلة: " + (r.success ? "✅" : "❌ " + r.message));
  }

  return { success: true, message: results.join(" — ") };
}

/* =========================================================
   1-ب. تطبيع رقم الهاتف (تحويل الأرقام العربية ٠-٩ لأرقام
   عادية 0-9، وحذف المسافات والشرطات) حتى ما يصير فرق بين
   رقم انكتب وقت التسجيل ونفس الرقم وقت تسجيل الدخول
========================================================= */

function sanadNormalizePhone(value) {
  if (!value) return value;

  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

  let result = String(value).trim();

  result = result.replace(/[٠-٩]/g, function (digit) {
    return arabicDigits.indexOf(digit);
  });

  result = result.replace(/[^\d]/g, "");

  return result;
}

/* =========================================================
   2. تسجيل دخول الكادر (staff)
========================================================= */

async function sanadLoginStaff(phone, password) {
  phone = sanadNormalizePhone(phone);

  /* الخطوة 1: تسجيل الدخول الحقيقي عن طريق نظام Supabase Auth
     (الإيميل المستخدم داخلياً بس هو رقم الهاتف + @sanad.internal) */

  const authEmail = phone + "@sanad.internal";

  const { data: authData, error: authError } =
    await sanadClient.auth.signInWithPassword({
      email: authEmail,
      password: password
    });

  if (authError || !authData || !authData.user) {
    return { success: false, message: "رقم الهاتف أو كلمة المرور غير صحيحة." };
  }

  /* الخطوة 2: بعد التحقق من الهوية، نجيب بيانات الموظف
     (الاسم، الدور، إلخ) من جدول staff العادي بنفس رقم الهاتف */

  const { data, error } = await sanadClient
    .from("staff")
    .select("*")
    .eq("phone", phone)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    await sanadClient.auth.signOut();
    return { success: false, message: "تعذر العثور على بيانات الموظف." };
  }

  return { success: true, staff: data };
}

/* =========================================================
   3. تسجيل دخول المسن (customer)
========================================================= */

async function sanadLoginElder(phone, password) {
  phone = sanadNormalizePhone(phone);
  password = sanadNormalizePhone(password);

  const authEmail = phone + "@sanad-customer.internal";

  const { data: authData, error: authError } =
    await sanadClient.auth.signInWithPassword({
      email: authEmail,
      password: password
    });

  if (authError || !authData || !authData.user) {
    return { success: false, message: "رقم الهاتف أو كلمة المرور غير صحيحة." };
  }

  const { data, error } = await sanadClient
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error || !data) {
    await sanadClient.auth.signOut();
    return { success: false, message: "تعذر العثور على بيانات المسن." };
  }

  return { success: true, customer: data };
}

/* =========================================================
   4. تسجيل دخول العائلة (family_members)
========================================================= */

async function sanadLoginFamily(phone, password) {
  phone = sanadNormalizePhone(phone);
  password = sanadNormalizePhone(password);

  const authEmail = phone + "@sanad-family.internal";

  const { data: authData, error: authError } =
    await sanadClient.auth.signInWithPassword({
      email: authEmail,
      password: password
    });

  if (authError || !authData || !authData.user) {
    return { success: false, message: "رقم الهاتف أو كلمة المرور غير صحيحة." };
  }

  const { data, error } = await sanadClient
    .from("family_members")
    .select("*, customers(*)")
    .eq("phone", phone)
    .maybeSingle();

  if (error || !data) {
    await sanadClient.auth.signOut();
    return { success: false, message: "تعذر العثور على بيانات العائلة." };
  }

  return { success: true, familyMember: data };
}

/* =========================================================
   5. حفظ / قراءة الجلسة الحالية (بديل بسيط عن التوكن)
   ملاحظة: هذه جلسة محلية بالجهاز فقط (طبيعي وصحيح) —
   البيانات نفسها (المشتركين، المواعيد...) هي اللي لازم
   تكون بقاعدة البيانات وليس هذه الجلسة.
========================================================= */

function sanadSaveSession(type, record) {
  localStorage.setItem("sanadSessionType", type);
  localStorage.setItem("sanadSessionData", JSON.stringify(record));
}

function sanadGetSession() {
  const type = localStorage.getItem("sanadSessionType");
  const raw = localStorage.getItem("sanadSessionData");

  if (!type || !raw) {
    return null;
  }

  try {
    return { type: type, data: JSON.parse(raw) };
  } catch (error) {
    return null;
  }
}

function sanadClearSession() {
  localStorage.removeItem("sanadSessionType");
  localStorage.removeItem("sanadSessionData");
  /* تسجيل خروج حقيقي من نظام المصادقة (للكادر خصوصاً) */
  sanadClient.auth.signOut();
}

/* =========================================================
   6. إنشاء مشترك جديد (من الاستقبال)
========================================================= */

async function sanadCreateCustomer(customer) {
  const code = "CU-" + Date.now();

  const normalizedPhone = sanadNormalizePhone(customer.phone);
  const normalizedFamilyPhone = sanadNormalizePhone(customer.familyPhone);

  /* كلمة المرور الفعلية لكل حساب (نفس الرقم افتراضياً)، نحسبها هنا
     حتى نستخدمها بإنشاء حساب الدخول الحقيقي بالأسفل أيضاً */
  const customerPassword = sanadNormalizePhone(customer.password) || normalizedPhone;
  const familyPassword = sanadNormalizePhone(customer.familyPassword) || normalizedFamilyPhone;

  const { data, error } = await sanadClient
    .from("customers")
    .insert({
      customer_code: code,
      name: customer.name,
      phone: normalizedPhone,
      /* افتراضياً كلمة المرور = رقم هاتف المسن نفسه لسهولة الاستخدام */
      password: customerPassword,
      age: customer.age,
      address: customer.address,
      package: customer.package,
      package_name: customer.packageName,
      package_price: customer.packagePrice,
      notes: customer.notes,
      assistant_requested: customer.assistantRequested,
      status: customer.package === "companion" ? "active" : "pending_schedule",
      /* من يشترك مباشرة بباقة "رفيق سند" يكون مفعّل تلقائياً
         (لأنه دفع اشتراكها وقت التسجيل) بدل ما ينتظر المدير
         يتذكر يفعّله يدوياً من لوحة "كل المشتركين" */
      companion_active: customer.package === "companion",
      created_by: customer.createdBy || null
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: "تعذر حفظ المشترك: " + error.message };
  }

  /* إنشاء حساب دخول حقيقي للمسن (Supabase Auth) حتى يقدر يسجل
     دخول فعلياً بلوحته من elder-login.html */
  if (normalizedPhone) {
    const authResult = await sanadCreateAuthAccount(
      normalizedPhone + "@sanad-customer.internal",
      customerPassword
    );
    if (!authResult.success) {
      return {
        success: false,
        message: "تم حفظ ملف المشترك لكن تعذر إنشاء حساب الدخول: " + authResult.message
      };
    }
  }

  /* إضافة فرد العائلة إذا توفرت بياناته */

  if (customer.familyName && normalizedFamilyPhone) {
    await sanadClient.from("family_members").insert({
      customer_id: data.id,
      name: customer.familyName,
      /* افتراضياً كلمة مرور العائلة = رقم هاتفها */
      phone: normalizedFamilyPhone,
      password: familyPassword,
      relation: customer.relation || ""
    });

    /* ونفس الشي، حساب دخول حقيقي لفرد العائلة */
    await sanadCreateAuthAccount(
      normalizedFamilyPhone + "@sanad-family.internal",
      familyPassword
    );
  }

  return { success: true, customer: data };
}

/* =========================================================
   7. إنشاء موعد / زيارة (من المدير)
========================================================= */

async function sanadCreateAppointment(appointment) {
  const { data, error } = await sanadClient
    .from("appointments")
    .insert({
      customer_id: appointment.customerId,
      staff_id: appointment.staffId,
      service: appointment.service,
      service_name: appointment.serviceName,
      visit_date: appointment.date,
      visit_time: appointment.time,
      status: "scheduled",
      notes: appointment.notes || "",
      created_by: appointment.createdBy || null
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: "تعذر حفظ الموعد: " + error.message };
  }

  return { success: true, appointment: data };
}

/* =========================================================
   8. قراءة كل المشتركين (للمدير / الاستقبال)
========================================================= */

async function sanadGetCustomers() {
  const { data, error } = await sanadClient
    .from("customers")
    .select("*, family_members(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

/* =========================================================
   9. قراءة كل الكادر (للمدير)
========================================================= */

async function sanadGetStaff() {
  const { data, error } = await sanadClient
    .from("staff")
    .select("*");

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

/* =========================================================
   10. قراءة مواعيد موظف معين (لوحة الكادر)
========================================================= */

async function sanadGetAppointmentsForStaff(staffId) {
  const { data, error } = await sanadClient
    .from("appointments")
    .select("*")
    .eq("staff_id", staffId)
    .order("visit_date", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

/* =========================================================
   11. قراءة مواعيد مسن معين (لوحة المسن)
========================================================= */

async function sanadGetAppointmentsForCustomer(customerId) {
  const { data, error } = await sanadClient
    .from("appointments")
    .select("*")
    .eq("customer_id", customerId)
    .order("visit_date", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

/* =========================================================
   12. قراءة كل المواعيد (للمدير - كل الجداول دفعة وحدة)
========================================================= */

async function sanadGetAllAppointments() {
  const { data, error } = await sanadClient
    .from("appointments")
    .select("*")
    .order("visit_date", { ascending: true })
    .order("visit_time", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

/* =========================================================
   13. حذف مشترك واحد (ومواعيده وأفراد عائلته)
========================================================= */

async function sanadDeleteCustomer(customerId) {
  await sanadClient.from("appointments").delete().eq("customer_id", customerId);
  await sanadClient.from("family_members").delete().eq("customer_id", customerId);
  /* لازم نحذفهم كمان قبل المشترك نفسه، وإلا قاعدة البيانات
     ترفض حذف المشترك لأن سجل بجدول الطلبات/الدفعات لسه
     مرتبط بيه (foreign key) */
  await sanadClient.from("service_requests").delete().eq("customer_id", customerId);
  await sanadClient.from("payments").delete().eq("customer_id", customerId);

  const { error } = await sanadClient
    .from("customers")
    .delete()
    .eq("id", customerId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   14. حذف جميع المشتركين (وكل المواعيد وأفراد العوائل)
========================================================= */

async function sanadDeleteAllCustomers() {
  await sanadClient.from("appointments").delete().neq("id", SANAD_EMPTY_UUID);
  await sanadClient.from("family_members").delete().neq("id", SANAD_EMPTY_UUID);
  /* لازم نحذفهم كمان قبل المشتركين أنفسهم، وإلا قاعدة البيانات
     ترفض حذف أي مشترك لسه مرتبط بيه طلب رفيق سند أو دفعة
     (foreign key) وتفشل عملية الحذف بالكامل بدون ما توضح السبب */
  await sanadClient.from("service_requests").delete().neq("id", SANAD_EMPTY_UUID);
  await sanadClient.from("payments").delete().neq("id", SANAD_EMPTY_UUID);

  const { error } = await sanadClient
    .from("customers")
    .delete()
    .neq("id", SANAD_EMPTY_UUID);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   15. حذف موعد واحد
========================================================= */

async function sanadDeleteAppointment(appointmentId) {
  const { error } = await sanadClient
    .from("appointments")
    .delete()
    .eq("id", appointmentId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   16. تحديث حالة موعد/زيارة (تُستخدم من لوحة الكادر:
   بدء الزيارة، إتمامها مع التقرير، إلخ)

   updates مثال:
   { status: "in_progress", started_at: "...", started_by: "..." }
   { status: "completed", completed_at: "...", report: {...} }
========================================================= */

async function sanadUpdateAppointmentStatus(appointmentId, updates) {
  const { data, error } = await sanadClient
    .from("appointments")
    .update(updates)
    .eq("id", appointmentId)
    .select()
    .single();

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, appointment: data };
}

/* =========================================================
   17. تحديث حالة المشترك (يستخدمها المدير بعد ترتيب المواعيد)
========================================================= */

async function sanadUpdateCustomerStatus(customerId, status) {
  const { error } = await sanadClient
    .from("customers")
    .update({ status: status })
    .eq("id", customerId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   19. تنسيق تقرير الزيارة الكامل كنص (يُستخدم بنفس الشكل
   عند المدير والعائلة والمسن حتى يكون التقرير موحّد وكامل)
========================================================= */

function sanadFormatReportText(appointment) {
  if (!appointment || !appointment.report) {
    return null;
  }

  const report = appointment.report;
  const lines = [];

  lines.push("📄 تقرير الزيارة");
  lines.push("الخدمة: " + (appointment.service_name || ""));
  lines.push("التاريخ: " + (appointment.visit_date || "") + " — " + String(appointment.visit_time || "").slice(0, 5));

  if (report.staff) {
    lines.push("الكادر: " + (report.staff.name || ""));
  }

  lines.push("");

  if (report.vitalSigns) {
    lines.push("❤️ العلامات الحيوية:");
    lines.push("ضغط الدم: " + (report.vitalSigns.bloodPressure || "—"));
    lines.push("سكر الدم: " + (report.vitalSigns.bloodSugar || "—"));
    lines.push("الحرارة: " + (report.vitalSigns.temperature || "—"));
    lines.push("النبض: " + (report.vitalSigns.pulse || "—"));
    lines.push("الأوكسجين: " + (report.vitalSigns.oxygen || "—"));
    lines.push("الوزن: " + (report.vitalSigns.weight || "—"));
    lines.push("");
  }

  if (report.medical) {
    lines.push("🩺 التقييم الطبي:");
    lines.push("الأعراض: " + (report.medical.symptoms || "—"));
    lines.push("الفحص: " + (report.medical.examination || "—"));
    lines.push("التشخيص: " + (report.medical.diagnosis || "—"));
    lines.push("العلاج: " + (report.medical.treatment || "—"));
    lines.push("التوصيات: " + (report.medical.recommendations || "—"));
    lines.push("");
  }

  if (report.nursing) {
    lines.push("👩‍⚕️ الرعاية التمريضية:");
    lines.push("الأدوية: " + (report.nursing.medicationGiven || "—"));
    lines.push("الرعاية الشخصية: " + (report.nursing.personalCare || "—"));
    lines.push("التغذية: " + (report.nursing.nutritionStatus || "—"));
    lines.push("ملاحظات: " + (report.nursing.nursingNotes || "—"));
    lines.push("");
  }

  if (report.finalReport) {
    lines.push("📝 التقرير النهائي:");
    lines.push(report.finalReport);
  }

  return lines.join("\n");
}

/* =========================================================
   20. إنشاء حساب كادر جديد (من لوحة المدير)
========================================================= */

async function sanadCreateStaff(staffData) {
  const normalizedPhone = sanadNormalizePhone(staffData.phone);

  const { data, error } = await sanadClient
    .from("staff")
    .insert({
      name: staffData.name,
      phone: normalizedPhone,
      password: sanadNormalizePhone(staffData.password) || normalizedPhone,
      role: staffData.role,
      active: true
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: "تعذر إنشاء حساب الكادر: " + error.message };
  }

  return { success: true, staff: data };
}

/* =========================================================
   21. تفعيل / تعطيل حساب كادر
========================================================= */

async function sanadSetStaffActive(staffId, active) {
  const { error } = await sanadClient
    .from("staff")
    .update({ active: active })
    .eq("id", staffId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   22. تعديل بيانات مشترك (رقم الهاتف، العنوان، إلخ)
   من لوحة المدير
========================================================= */

async function sanadUpdateCustomer(customerId, updates) {
  const cleanUpdates = Object.assign({}, updates);

  if (cleanUpdates.phone) {
    cleanUpdates.phone = sanadNormalizePhone(cleanUpdates.phone);
    /* كلمة المرور الافتراضية = رقم الهاتف، فإذا تغيّر الرقم لازم
       نحدّث كلمة المرور المخزّنة معاه حتى تضل متطابقة ويقدر
       يسجل دخول بالرقم الجديد (وإلا تضل كلمة مرور الرقم القديم) */
    cleanUpdates.password = cleanUpdates.phone;
  }

  const { data, error } = await sanadClient
    .from("customers")
    .update(cleanUpdates)
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, customer: data };
}

/* =========================================================
   23. تعديل بيانات فرد عائلة (رقم الهاتف مثلاً)
========================================================= */

async function sanadUpdateFamilyMember(familyMemberId, updates) {
  const cleanUpdates = Object.assign({}, updates);

  if (cleanUpdates.phone) {
    cleanUpdates.phone = sanadNormalizePhone(cleanUpdates.phone);
    /* نفس منطق المسن: كلمة المرور = رقم الهاتف، فلازم تتحدث معاه */
    cleanUpdates.password = cleanUpdates.phone;
  }

  const { error } = await sanadClient
    .from("family_members")
    .update(cleanUpdates)
    .eq("id", familyMemberId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   24. تسجيل عملية بسجل العمليات (Audit Log)
========================================================= */

async function sanadLogActivity(action, actorName, actorRole, targetType, targetId, details) {
  try {
    await sanadClient.from("activity_log").insert({
      action: action,
      actor_name: actorName || "",
      actor_role: actorRole || "",
      target_type: targetType || "",
      target_id: targetId || "",
      details: typeof details === "string" ? details : JSON.stringify(details || {})
    });
  } catch (error) {
    console.error("تعذر تسجيل العملية بالسجل:", error);
  }
}

/* =========================================================
   25. قراءة سجل العمليات (لمالك النظام)
========================================================= */

async function sanadGetActivityLog(limitCount) {
  const { data, error } = await sanadClient
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limitCount || 100);

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

async function sanadUpdateAppointment(appointmentId, updates) {
  return sanadUpdateAppointmentStatus(appointmentId, updates);
}

/* =========================================================
   30. طلبات الخدمة المستعجلة (من المسن/العائلة)
========================================================= */

async function sanadCreateServiceRequest(request) {
  const { data, error } = await sanadClient
    .from("service_requests")
    .insert({
      customer_id: request.customerId,
      service_type: request.serviceType,
      service_label: request.serviceLabel,
      location_type: request.locationType,
      location_note: request.locationNote || "",
      notes: request.notes || "",
      status: "pending",
      requested_by: request.requestedBy || ""
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: "تعذر إرسال الطلب: " + error.message };
  }

  return { success: true, request: data };
}

async function sanadGetServiceRequestsForCustomer(customerId) {
  const { data, error } = await sanadClient
    .from("service_requests")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

async function sanadGetAllServiceRequests() {
  const { data, error } = await sanadClient
    .from("service_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

async function sanadUpdateServiceRequest(requestId, updates) {
  const { data, error } = await sanadClient
    .from("service_requests")
    .update(updates)
    .eq("id", requestId)
    .select()
    .single();

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, request: data };
}

async function sanadDeleteServiceRequest(requestId) {
  const { error } = await sanadClient
    .from("service_requests")
    .delete()
    .eq("id", requestId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   26. تقييم زيارة مكتملة من طرف العائلة (نجوم + تعليق)
========================================================= */

async function sanadRateAppointment(appointmentId, rating, comment) {
  const { error } = await sanadClient.rpc("sanad_submit_rating", {
    p_appointment_id: appointmentId,
    p_rating: rating,
    p_comment: comment || ""
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   27. تسجيل دفعة اشتراك شهرية
========================================================= */

async function sanadCreatePayment(payment) {
  const { data, error } = await sanadClient
    .from("payments")
    .insert({
      customer_id: payment.customerId,
      amount: payment.amount,
      payment_month: payment.month,
      method: payment.method || "",
      notes: payment.notes || "",
      created_by: payment.createdBy || null
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: "تعذر تسجيل الدفعة: " + error.message };
  }

  return { success: true, payment: data };
}

/* =========================================================
   28. قراءة كل الدفعات (للمدير)
========================================================= */

async function sanadGetAllPayments() {
  const { data, error } = await sanadClient
    .from("payments")
    .select("*")
    .order("paid_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

/* =========================================================
   29. قراءة دفعات مشترك معين
========================================================= */

async function sanadGetPaymentsForCustomer(customerId) {
  const { data, error } = await sanadClient
    .from("payments")
    .select("*")
    .eq("customer_id", customerId)
    .order("paid_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

/* =========================================================
   31. المصاريف (مصاريف تشغيل الشركة: إيجار، مستلزمات، إلخ)
========================================================= */

async function sanadCreateExpense(expense) {
  const { data, error } = await sanadClient
    .from("expenses")
    .insert({
      title: expense.title,
      category: expense.category || "",
      amount: expense.amount,
      expense_date: expense.date,
      notes: expense.notes || "",
      created_by: expense.createdBy || null
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: "تعذر تسجيل المصروف: " + error.message };
  }

  return { success: true, expense: data };
}

async function sanadGetAllExpenses() {
  const { data, error } = await sanadClient
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

async function sanadDeleteExpense(expenseId) {
  const { error } = await sanadClient
    .from("expenses")
    .delete()
    .eq("id", expenseId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

/* =========================================================
   32. رواتب الكادر
========================================================= */

async function sanadCreateSalaryPayment(payment) {
  const { data, error } = await sanadClient
    .from("salary_payments")
    .insert({
      staff_id: payment.staffId,
      amount: payment.amount,
      salary_month: payment.month,
      notes: payment.notes || "",
      created_by: payment.createdBy || null
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: "تعذر تسجيل الراتب: " + error.message };
  }

  return { success: true, payment: data };
}

async function sanadGetAllSalaryPayments() {
  const { data, error } = await sanadClient
    .from("salary_payments")
    .select("*")
    .order("paid_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

async function sanadDeleteSalaryPayment(paymentId) {
  const { error } = await sanadClient
    .from("salary_payments")
    .delete()
    .eq("id", paymentId);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}

function sanadListenTable(tableName, callback) {
  return sanadClient
    .channel(tableName + "-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: tableName },
      callback
    )
    .subscribe();
}
