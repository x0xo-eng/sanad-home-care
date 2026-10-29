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

async function sanadCallAccounts(action, payload) {
  /* كل إنشاء حسابات وإعادة تعيين كلمات المرور يمر عبر الدالة الآمنة
     sanad-accounts (Edge Function) والسيرفر يتحقق من صلاحية المتصل */
  try {
    const { data, error } = await sanadClient.functions.invoke("sanad-accounts", {
      body: Object.assign({ action: action }, payload || {})
    });

    if (error) {
      let message = error.message || "تعذر الاتصال بالخادم.";
      try {
        if (error.context && typeof error.context.json === "function") {
          const body = await error.context.json();
          if (body && body.message) { message = body.message; }
        }
      } catch (e) {}
      return { success: false, message: message };
    }

    if (!data) {
      return { success: false, message: "لا يوجد رد من الخادم." };
    }

    return data;
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
    const r = await sanadCallAccounts("reset_password", { kind: "customer", phone: customer.phone });
    results.push("المسن (" + customer.phone + "): " + (r.success ? "✅ كلمة المرور الجديدة " + r.password : "❌ " + r.message));
  }

  const familyMember = (customer.family_members && customer.family_members[0]) || null;

  if (familyMember && familyMember.phone) {
    const r = await sanadCallAccounts("reset_password", { kind: "family", phone: familyMember.phone });
    results.push("العائلة (" + familyMember.phone + "): " + (r.success ? "✅ كلمة المرور الجديدة " + r.password : "❌ " + r.message));
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

  /* كلمات المرور لا تُخزَّن بالجداول أبداً. تُولَّد عشوائياً بالسيرفر
     وتُعرض لموظف الاستقبال مرة واحدة ليسلّمها للمسن والعائلة.
     عمود password القديم يحمل قيمة ثابتة غير حقيقية */

  const { data, error } = await sanadClient
    .from("customers")
    .insert({
      customer_code: code,
      name: customer.name,
      phone: normalizedPhone,
      password: "managed-by-auth",
      age: customer.age,
      address: customer.address,
      package: customer.package,
      package_name: customer.packageName,
      package_price: customer.packagePrice,
      notes: customer.notes,
      assistant_requested: customer.assistantRequested,
      status: customer.package === "companion" ? "active" : "pending_schedule",
      /* رفيق سند مفعّل تلقائياً لكل المشتركين: مجاناً مع الباقات
         (الاعتيادية والمتوسطة والفاخرة)، وبالاشتراك المدفوع لمن اختار
         باقة "رفيق سند" وحدها. يقدر المدير يعطّله يدوياً عند الحاجة */
      companion_active: true,
      created_by: customer.createdBy || null
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: "تعذر حفظ المشترك: " + error.message };
  }

  /* إضافة فرد العائلة إذا توفرت بياناته */

  if (customer.familyName && normalizedFamilyPhone) {
    await sanadClient.from("family_members").insert({
      customer_id: data.id,
      name: customer.familyName,
      phone: normalizedFamilyPhone,
      password: "managed-by-auth",
      relation: customer.relation || ""
    });
  }

  /* إنشاء حسابات الدخول (للمسن والعائلة) من جهة السيرفر */

  const credentials = {
    customerPhone: normalizedPhone || "",
    customerPassword: "",
    familyPhone: normalizedFamilyPhone || "",
    familyPassword: ""
  };

  if (normalizedPhone || (customer.familyName && normalizedFamilyPhone)) {
    const accounts = await sanadCallAccounts("create_customer_logins", {
      customerPhone: normalizedPhone || "",
      familyPhone: (customer.familyName && normalizedFamilyPhone) ? normalizedFamilyPhone : ""
    });

    if (!accounts.success) {
      return {
        success: false,
        message: "تم حفظ ملف المشترك لكن تعذر إنشاء حسابات الدخول: " + (accounts.message || "")
      };
    }

    credentials.customerPassword = accounts.customerPassword || "";
    credentials.familyPassword = accounts.familyPassword || "";

    const problems = [];
    if (accounts.customerError) { problems.push("المسن: " + accounts.customerError); }
    if (accounts.familyError) { problems.push("العائلة: " + accounts.familyError); }
    if (problems.length) { credentials.problems = problems.join(" — "); }
  }

  return { success: true, customer: data, credentials: credentials };
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

/* دليل الكادر العام: الاسم والدور فقط (بدون كلمات المرور).
   يُستخدم في لوحة المسن والعائلة بدل قراءة جدول الكادر كامل. */
async function sanadGetStaffDirectory() {
  const { data, error } = await sanadClient.rpc("sanad_staff_directory");

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
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
  /* نحتفظ بأرقام الهواتف قبل الحذف حتى نحذف حسابات الدخول أيضاً */
  const { data: toDelete } = await sanadClient
    .from("customers")
    .select("phone, family_members(phone)")
    .eq("id", customerId)
    .maybeSingle();

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

  /* حذف حسابات الدخول (المسن + العائلة) حتى ما تبقى حسابات يتيمة
     وحتى يمكن إعادة استخدام نفس الأرقام لمشترك جديد */
  if (toDelete) {
    const family = (toDelete.family_members && toDelete.family_members[0]) || null;
    await sanadCallAccounts("delete_customer_logins", {
      customerPhone: toDelete.phone || "",
      familyPhone: family ? (family.phone || "") : ""
    });
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

  /* حذف كل حسابات دخول المشتركين والعائلات */
  await sanadCallAccounts("delete_all_customer_logins", {});

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

function sanadFormatReportText(appointment, options) {
  /* options.includeFinalReport === false يخفي "التقرير النهائي" (للمسن والعائلة) */
  const includeFinalReport = !(options && options.includeFinalReport === false);
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

  if (report.finalReport && includeFinalReport) {
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
  const password = String(staffData.password || "");

  if (password.length < 8) {
    return { success: false, message: "كلمة المرور لازم تكون 8 خانات على الأقل." };
  }

  /* الإنشاء كاملاً (الموظف + حساب الدخول) يتم بالسيرفر ويتحقق أن المتصل مالك النظام */
  const result = await sanadCallAccounts("create_staff", {
    name: staffData.name,
    phone: normalizedPhone,
    role: staffData.role,
    password: password
  });

  if (!result.success) {
    return { success: false, message: "تعذر إنشاء حساب الكادر: " + (result.message || "") };
  }

  return { success: true, staff: result.staff };
}

/* =========================================================
   20-ب. تغيير كلمة مرور موظف (المالك فقط، عبر الدالة الآمنة)
========================================================= */

async function sanadResetStaffPassword(phone, newPassword) {
  const password = String(newPassword || "");

  if (password.length < 8) {
    return { success: false, message: "كلمة المرور لازم تكون 8 خانات على الأقل." };
  }

  return await sanadCallAccounts("reset_password", {
    kind: "staff",
    phone: sanadNormalizePhone(phone),
    password: password
  });
}

/* =========================================================
   20-ج. حذف موظف (المالك فقط). يفشل برسالة واضحة إذا له سجلات
========================================================= */

async function sanadDeleteStaff(phone) {
  return await sanadCallAccounts("delete_staff", { phone: sanadNormalizePhone(phone) });
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
      requested_by: request.requestedBy || "",
      requested_by_id: request.requestedById || null
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
   عارض التقرير مع زر الطباعة
   opts: { includeFinalReport: bool, patientName: string }
========================================================= */

function sanadOpenReportViewer(appointment, opts) {
  opts = opts || {};
  const text = sanadFormatReportText(appointment, { includeFinalReport: opts.includeFinalReport !== false });

  if (!text) {
    alert("لا يوجد تقرير محفوظ لهذه الزيارة.");
    return;
  }

  const esc = function (v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  const old = document.getElementById("sanadReportViewer");
  if (old) { old.remove(); }

  const overlay = document.createElement("div");
  overlay.id = "sanadReportViewer";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,40,38,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;";

  const box = document.createElement("div");
  box.dir = "rtl";
  box.style.cssText = "background:#fff;border-radius:20px;max-width:560px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.25);font-family:inherit;";

  const body = document.createElement("div");
  body.style.cssText = "padding:22px 22px 8px;overflow:auto;white-space:pre-wrap;line-height:2;font-size:15px;color:#163b38;";
  body.textContent = text;

  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:10px;padding:14px 22px 20px;border-top:1px solid #e5efed;";

  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.textContent = "🖨️ طباعة";
  printBtn.style.cssText = "flex:1;padding:12px;border:0;border-radius:12px;background:#16877d;color:#fff;font-weight:800;font-size:15px;cursor:pointer;";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "إغلاق";
  closeBtn.style.cssText = "flex:1;padding:12px;border:1px solid #d5e3e0;border-radius:12px;background:#fff;color:#456;font-weight:700;font-size:15px;cursor:pointer;";

  closeBtn.onclick = function () { overlay.remove(); };
  overlay.onclick = function (e) { if (e.target === overlay) { overlay.remove(); } };

  printBtn.onclick = function () {
    sanadPrintReport(appointment, opts);
  };

  bar.appendChild(printBtn);
  bar.appendChild(closeBtn);
  box.appendChild(body);
  box.appendChild(bar);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}


/* طباعة تقرير زيارة: ورقة A4 بتصميم رسمي فاخر */
function sanadBuildPrintableHtml(appointment, opts) {
  opts = opts || {};
  const includeFinal = opts.includeFinalReport !== false;
  const r = appointment.report || {};

  const esc = function (v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  const val = function (v) {
    const t = String(v == null ? "" : v).trim();
    return t ? esc(t) : '<span class="empty">—</span>';
  };
  const row = function (label, value) {
    return '<tr><th>' + label + '</th><td>' + val(value) + '</td></tr>';
  };

  const refNo = "SND-" + String(appointment.id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  const visitDate = appointment.visit_date || "";
  const visitTime = String(appointment.visit_time || "").slice(0, 5);
  const staffName = r.staff && r.staff.name ? r.staff.name : "";
  const printedAt = new Date().toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric" });

  let vitals = "";
  if (r.vitalSigns) {
    const v = r.vitalSigns;
    const cell = function (label, value, unit) {
      const has = String(value == null ? "" : value).trim() !== "";
      return '<div class="vital"><div class="vl">' + label + '</div><div class="vv">' +
        (has ? esc(value) + (unit ? '<small>' + unit + '</small>' : '') : '<span class="empty">—</span>') + '</div></div>';
    };
    vitals =
      '<section><h3><i></i>العلامات الحيوية</h3><div class="vitals">' +
      cell("ضغط الدم", v.bloodPressure, "mmHg") +
      cell("سكر الدم", v.bloodSugar, "mg/dL") +
      cell("الحرارة", v.temperature, "°C") +
      cell("النبض", v.pulse, "bpm") +
      cell("الأوكسجين", v.oxygen, "%") +
      cell("الوزن", v.weight, "kg") +
      '</div></section>';
  }

  let medical = "";
  if (r.medical) {
    const m = r.medical;
    medical =
      '<section><h3><i></i>التقييم الطبي</h3><table class="kv">' +
      row("الأعراض", m.symptoms) + row("الفحص السريري", m.examination) +
      row("التشخيص", m.diagnosis) + row("العلاج", m.treatment) + row("التوصيات", m.recommendations) +
      '</table></section>';
  }

  let nursing = "";
  if (r.nursing) {
    const n = r.nursing;
    nursing =
      '<section><h3><i></i>الرعاية التمريضية</h3><table class="kv">' +
      row("الأدوية المعطاة", n.medicationGiven) + row("الرعاية الشخصية", n.personalCare) +
      row("الحالة الغذائية", n.nutritionStatus) + row("ملاحظات التمريض", n.nursingNotes) +
      '</table></section>';
  }

  let finalBox = "";
  if (r.finalReport && includeFinal) {
    finalBox = '<section><h3><i></i>الملخص النهائي</h3><div class="final">' + esc(r.finalReport) + '</div></section>';
  }

  const css =
    "@page{size:A4;margin:0}" +
    "*{box-sizing:border-box}" +
    "html,body{margin:0;padding:0;background:#e9eeed;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "body{font-family:'Tajawal','Cairo',Tahoma,Arial,sans-serif;color:#1b3a37;line-height:1.7;font-size:13px}" +
    ".sheet{position:relative;width:210mm;min-height:296mm;margin:0 auto;background:#fff;display:flex;flex-direction:column;overflow:hidden}" +
    ".wm{position:absolute;top:46%;left:50%;transform:translate(-50%,-50%) rotate(-18deg);font-size:210px;font-weight:800;color:#16877d;opacity:.035;white-space:nowrap;pointer-events:none}" +
    ".top{background:linear-gradient(135deg,#0d5f58,#16877d);color:#fff;padding:8mm 16mm 8mm;position:relative}" +
    ".top:after{content:'';position:absolute;right:0;left:0;bottom:0;height:3mm;background:linear-gradient(90deg,#c9a24a,#ecd28a,#c9a24a)}" +
    ".brand{display:flex;justify-content:space-between;align-items:flex-end}" +
    ".logo{font-size:48px;font-weight:800;letter-spacing:-2px;line-height:1}" +
    ".logo span{color:#e7c76a}" +
    ".tag{font-size:12px;opacity:.85;margin-top:4px;letter-spacing:.3px}" +
    ".ref{text-align:left;font-size:11.5px;opacity:.92;line-height:1.7}" +
    ".ref b{font-size:14px;letter-spacing:1px;color:#f3dc95}" +
    ".title{padding:5mm 16mm 0;display:flex;align-items:center;gap:12px}" +
    ".title h1{margin:0;font-size:26px;color:#0d5f58;font-weight:800}" +
    ".title .line{flex:1;height:1px;background:linear-gradient(90deg,#c9a24a,transparent)}" +
    ".info{margin:5mm 16mm 0;border:1px solid #e6dcc0;background:#fffdf6;border-radius:12px;padding:10px 16px;display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}" +
    ".info div{display:flex;gap:8px;font-size:13px}.info b{color:#8a6a1f;min-width:78px;font-weight:700}" +
    "section{margin:4mm 16mm 0;break-inside:avoid}" +
    "h3{margin:0 0 8px;font-size:16px;color:#0d5f58;display:flex;align-items:center;gap:9px;font-weight:800}" +
    "h3 i{display:inline-block;width:5px;height:19px;border-radius:3px;background:linear-gradient(#c9a24a,#e7c76a)}" +
    ".vitals{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}" +
    ".vital{border:1px solid #d6e6e3;border-radius:12px;padding:6px 8px;text-align:center;background:linear-gradient(180deg,#fff,#f4faf9)}" +
    ".vl{font-size:11px;color:#6a8582;font-weight:600}.vv{font-size:18px;font-weight:800;color:#0d5f58;line-height:1.45}" +
    ".vv small{display:block;font-size:9.5px;color:#8aa09d;font-weight:600;line-height:1.2}" +
    "table.kv{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #d6e6e3;border-radius:12px;overflow:hidden}" +
    "table.kv th{width:26%;text-align:right;background:#eef7f5;color:#0d5f58;font-weight:700;padding:4px 14px;vertical-align:top;border-bottom:1px solid #e0edeb}" +
    "table.kv td{padding:4px 14px;text-align:right;border-bottom:1px solid #e9f1ef;white-space:pre-wrap;vertical-align:top}" +
    "table.kv tr:last-child th,table.kv tr:last-child td{border-bottom:0}" +
    ".final{border:1px solid #e6dcc0;border-right:5px solid #c9a24a;background:#fffdf6;border-radius:12px;padding:12px 16px;white-space:pre-wrap}" +
    ".empty{color:#b3c2bf}" +
    ".sign{margin:auto 16mm 8mm;padding-top:10mm;display:grid;grid-template-columns:1fr 1fr;gap:30px;break-inside:avoid}" +
    ".sign div{border-top:1px solid #9bb3af;padding-top:6px;text-align:center;font-size:12px;color:#5f7774}" +
    ".sign b{display:block;color:#1b3a37;font-size:13px;min-height:20px}" +
    ".foot{margin-top:0;padding:5mm 16mm 5mm;border-top:3px solid #c9a24a;background:#f4faf9;text-align:center;font-size:11px;color:#5f7774;line-height:1.7}" +
    ".foot b{color:#0d5f58}" +
    "@media print{html,body{background:#fff}.sheet{margin:0;box-shadow:none}}" +
    "@media screen{.sheet{box-shadow:0 10px 40px rgba(0,0,0,.18);margin:16px auto}}";

  return "<!DOCTYPE html><html lang='ar' dir='rtl'><head><meta charset='UTF-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>تقرير زيارة " + esc(refNo) + " - سند</title>" +
    "<link rel='preconnect' href='https://fonts.googleapis.com'><link rel='preconnect' href='https://fonts.gstatic.com' crossorigin>" +
    "<link href='https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap' rel='stylesheet'>" +
    "<style>" + css + "</style></head><body><div class='sheet'><div class='wm'>سند</div>" +
    "<div class='top'><div class='brand'>" +
    "<div><div class='logo'>سند<span>.</span></div><div class='tag'>الرعاية المنزلية لكبار السن</div></div>" +
    "<div class='ref'>رقم التقرير<br><b>" + esc(refNo) + "</b><br>تاريخ الإصدار: " + esc(printedAt) + "</div>" +
    "</div></div>" +
    "<div class='title'><h1>تقرير زيارة منزلية</h1><div class='line'></div></div>" +
    "<div class='info'>" +
    "<div><b>المشترك</b><span>" + val(opts.patientName) + "</span></div>" +
    "<div><b>رقم الملف</b><span>" + val(opts.patientCode) + "</span></div>" +
    "<div><b>الخدمة</b><span>" + val(appointment.service_name) + "</span></div>" +
    "<div><b>موعد الزيارة</b><span>" + val((visitDate + (visitTime ? " — " + visitTime : "")).trim()) + "</span></div>" +
    "<div><b>الكادر المنفذ</b><span>" + val(staffName) + "</span></div>" +
    "<div><b>حالة الزيارة</b><span>مكتملة</span></div>" +
    "</div>" +
    vitals + medical + nursing + finalBox +
    "<div class='sign'><div><b>" + esc(staffName) + "</b>توقيع الكادر المنفذ</div><div><b>&nbsp;</b>ختم وتوقيع الشركة</div></div>" +
    "<div class='foot'><b>سند لرعاية كبار السن</b><br>هذا التقرير للمتابعة الصحية ولا يغني عن مراجعة الطبيب. المعلومات الواردة سرّية وتخص المشترك وعائلته.</div>" +
    "</div></body></html>";
}

function sanadPrintReport(appointment, opts) {
  opts = opts || {};

  if (!appointment || !appointment.report) {
    alert("لا يوجد تقرير محفوظ لهذه الزيارة.");
    return;
  }

  const w = window.open("", "_blank");
  if (!w) {
    alert("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع وأعد المحاولة.");
    return;
  }

  w.document.write(sanadBuildPrintableHtml(appointment, opts));
  w.document.close();
  w.focus();

  /* ننتظر تحميل الخط ثم نطبع (مع مهلة احتياطية) */
  let printed = false;
  const doPrint = function () {
    if (printed) { return; }
    printed = true;
    try { w.print(); } catch (e) {}
  };
  try {
    if (w.document.fonts && w.document.fonts.ready) {
      w.document.fonts.ready.then(function () { setTimeout(doPrint, 250); });
    }
  } catch (e) {}
  setTimeout(doPrint, 2200);
}

/* =========================================================
   قسم "التقارير المكتملة" (للاستقبال والمدير): بحث + شهر + عرض + طباعة
   cfg: { root: عنصر, appointments, customers, includeFinalReport }
========================================================= */

function sanadRenderCompletedReports(cfg) {
  const root = cfg.root;
  if (!root) { return; }

  const esc = function (v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  const customers = cfg.customers || [];
  const includeFinal = cfg.includeFinalReport !== false;

  const completed = (cfg.appointments || [])
    .filter(function (a) { return a.status === "completed" && a.report; })
    .sort(function (a, b) {
      return (String(b.visit_date || "") + String(b.visit_time || "")).localeCompare(String(a.visit_date || "") + String(a.visit_time || ""));
    });

  root.innerHTML =
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">' +
    '<input type="text" class="sanad-rep-search" placeholder="🔍 ابحث باسم المشترك أو كوده" style="flex:2;min-width:200px;padding:11px 14px;border:1px solid #d5e3e0;border-radius:12px;font-family:inherit;font-size:14px;">' +
    '<input type="month" class="sanad-rep-month" style="flex:1;min-width:150px;padding:11px 14px;border:1px solid #d5e3e0;border-radius:12px;font-family:inherit;font-size:14px;">' +
    '</div>' +
    '<div class="sanad-rep-count" style="font-size:13px;color:#718480;margin-bottom:10px;"></div>' +
    '<div class="sanad-rep-list"></div>';

  const searchEl = root.querySelector(".sanad-rep-search");
  const monthEl = root.querySelector(".sanad-rep-month");
  const countEl = root.querySelector(".sanad-rep-count");
  const listEl = root.querySelector(".sanad-rep-list");

  function customerOf(a) {
    return customers.find(function (c) { return String(c.id) === String(a.customer_id); });
  }

  function draw() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const month = monthEl.value || "";

    const rows = completed.filter(function (a) {
      if (month && String(a.visit_date || "").slice(0, 7) !== month) { return false; }
      if (!q) { return true; }
      const c = customerOf(a);
      const hay = ((c ? c.name : "") + " " + (c ? c.customer_code : "") + " " + (a.service_name || "")).toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    countEl.textContent = "عدد التقارير: " + rows.length;
    listEl.innerHTML = "";

    if (rows.length === 0) {
      listEl.innerHTML = '<div style="padding:22px;text-align:center;color:#718480;border:1px dashed #cfe0dd;border-radius:14px;">لا توجد تقارير مكتملة مطابقة.</div>';
      return;
    }

    rows.slice(0, 200).forEach(function (a) {
      const c = customerOf(a);
      const staffName = a.report && a.report.staff ? a.report.staff.name : "";
      const div = document.createElement("div");
      div.style.cssText = "border:1px solid #e1ecea;border-radius:16px;padding:14px 16px;margin-bottom:10px;background:#fff;";
      div.innerHTML =
        '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
        '<b style="color:#163b38;">👴 ' + esc(c ? c.name : "مشترك") + (c && c.customer_code ? ' <span style="color:#718480;font-weight:600;font-size:12px;">(' + esc(c.customer_code) + ')</span>' : '') + '</b>' +
        '<span style="color:#16877d;font-weight:700;font-size:13px;">' + esc(a.visit_date || "") + ' — ' + esc(String(a.visit_time || "").slice(0, 5)) + '</span>' +
        '</div>' +
        '<div style="font-size:13px;color:#5f7774;margin:4px 0 10px;">' + esc(a.service_name || "") + (staffName ? ' • الكادر: ' + esc(staffName) : '') + '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" data-act="view" style="flex:1;padding:9px;border:1px solid #16877d;background:#fff;color:#16877d;border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit;">📄 عرض</button>' +
        '<button type="button" data-act="print" style="flex:1;padding:9px;border:0;background:#16877d;color:#fff;border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit;">🖨️ طباعة</button>' +
        '</div>';

      const opts = { includeFinalReport: includeFinal, patientName: c ? c.name : "", patientCode: c ? (c.customer_code || "") : "" };
      div.querySelector('[data-act="view"]').onclick = function () { sanadOpenReportViewer(a, opts); };
      div.querySelector('[data-act="print"]').onclick = function () { sanadPrintReport(a, opts); };
      listEl.appendChild(div);
    });
  }

  searchEl.addEventListener("input", draw);
  monthEl.addEventListener("change", draw);
  draw();
}

/* ---------- الصندوق المالي ---------- */

// الاستقبال/المدير/المالك: تسجيل دفعة (تدخل الصندوق تلقائياً)
async function sanadRecordPayment(customerId, amount, month, notes) {
  const { data, error } = await sanadClient.rpc("sanad_record_payment", {
    p_customer_id: customerId,
    p_amount: Number(amount),
    p_month: month,
    p_notes: notes || ""
  });

  if (error) {
    return { success: false, message: "تعذر تسجيل الدفعة: " + error.message };
  }
  return { success: true, paymentId: data };
}

// المالك فقط: حذف دفعة (ينقص من الصندوق بقيد عكسي)
async function sanadDeletePayment(paymentId) {
  const { error } = await sanadClient.rpc("sanad_delete_payment", { p_payment_id: paymentId });
  if (error) {
    return { success: false, message: "تعذر حذف الدفعة: " + error.message };
  }
  return { success: true };
}

// المالك فقط
async function sanadGetCashBoxSummary() {
  window.sanadLastCashError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await sanadClient.rpc("sanad_cash_box_summary");
    if (!error && data) { return data; }
    console.error(error);
    window.sanadLastCashError = error ? (error.message || "") : "لا توجد بيانات";
    await new Promise(function(r){ setTimeout(r, 800); });
  }
  return null;
}

async function sanadGetCashBoxLedger(fromIso, toIso) {
  const { data, error } = await sanadClient.rpc("sanad_cash_box_ledger", {
    p_from: fromIso || null,
    p_to: toIso || null
  });
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
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
