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

/* معرّف "فارغ" نستخدمه لحيلة حذف كل الصفوف (Supabase يطلب شرط فلترة دائماً) */
const SANAD_EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

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

  const { data, error } = await sanadClient
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .eq("password", password)
    .maybeSingle();

  if (error) {
    return { success: false, message: "حدث خطأ أثناء تسجيل الدخول." };
  }

  if (!data) {
    return { success: false, message: "رقم الهاتف أو كلمة المرور غير صحيحة." };
  }

  return { success: true, customer: data };
}

/* =========================================================
   4. تسجيل دخول العائلة (family_members)
========================================================= */

async function sanadLoginFamily(phone, password) {
  phone = sanadNormalizePhone(phone);
  password = sanadNormalizePhone(password);

  const { data, error } = await sanadClient
    .from("family_members")
    .select("*, customers(*)")
    .eq("phone", phone)
    .eq("password", password)
    .maybeSingle();

  if (error) {
    return { success: false, message: "حدث خطأ أثناء تسجيل الدخول." };
  }

  if (!data) {
    return { success: false, message: "رقم الهاتف أو كلمة المرور غير صحيحة." };
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

  const { data, error } = await sanadClient
    .from("customers")
    .insert({
      customer_code: code,
      name: customer.name,
      phone: normalizedPhone,
      /* افتراضياً كلمة المرور = رقم هاتف المسن نفسه لسهولة الاستخدام */
      password: sanadNormalizePhone(customer.password) || normalizedPhone,
      age: customer.age,
      address: customer.address,
      package: customer.package,
      package_name: customer.packageName,
      package_price: customer.packagePrice,
      notes: customer.notes,
      assistant_requested: customer.assistantRequested,
      status: "pending_schedule",
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
      /* افتراضياً كلمة مرور العائلة = رقم هاتفها */
      phone: normalizedFamilyPhone,
      password: sanadNormalizePhone(customer.familyPassword) || normalizedFamilyPhone,
      relation: customer.relation || ""
    });
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
   26. تقييم زيارة مكتملة من طرف العائلة (نجوم + تعليق)
========================================================= */

async function sanadRateAppointment(appointmentId, rating, comment) {
  const { data, error } = await sanadClient
    .from("appointments")
    .update({ rating: rating, rating_comment: comment || "" })
    .eq("id", appointmentId)
    .select()
    .single();

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, appointment: data };
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
