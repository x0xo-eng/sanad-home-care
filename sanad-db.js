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
   2. تسجيل دخول الكادر (staff)
========================================================= */

async function sanadLoginStaff(phone, password) {
  const { data, error } = await sanadClient
    .from("staff")
    .select("*")
    .eq("phone", phone)
    .eq("password", password)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    return { success: false, message: "حدث خطأ أثناء تسجيل الدخول." };
  }

  if (!data) {
    return { success: false, message: "رقم الهاتف أو كلمة المرور غير صحيحة." };
  }

  return { success: true, staff: data };
}

/* =========================================================
   3. تسجيل دخول المسن (customer)
========================================================= */

async function sanadLoginElder(phone, password) {
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
}

/* =========================================================
   6. إنشاء مشترك جديد (من الاستقبال)
========================================================= */

async function sanadCreateCustomer(customer) {
  const code = "CU-" + Date.now();

  const { data, error } = await sanadClient
    .from("customers")
    .insert({
      customer_code: code,
      name: customer.name,
      phone: customer.phone,
      /* افتراضياً كلمة المرور = رقم هاتف المسن نفسه لسهولة الاستخدام */
      password: customer.password || customer.phone,
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

  if (customer.familyName && customer.familyPhone) {
    await sanadClient.from("family_members").insert({
      customer_id: data.id,
      name: customer.familyName,
      /* افتراضياً كلمة مرور العائلة = رقم هاتفها */
      phone: customer.familyPhone,
      password: customer.familyPassword || customer.familyPhone,
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
    .select("*")
    .order("created_at", { ascending: true });

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
   18. الاستماع للتحديثات اللحظية (تستخدم بأي لوحة تريد
   تحديث تلقائي بدون ريفرش، إذا كان Realtime مفعّل بالجدول)
========================================================= */

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
