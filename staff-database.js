/* =====================================================
   قاعدة بيانات كادر سند
   Sanad Staff Database
===================================================== */

const SANAD_STAFF_DATABASE = [

    {
        id: "ST-001",
        name: "مدير سند",
        role: "manager",
        roleName: "مدير الشركة",
        active: true
    },

    {
        id: "ST-002",
        name: "موظف استقبال سند",
        role: "receptionist",
        roleName: "موظف استقبال",
        active: true
    },

    {
        id: "ST-003",
        name: "د. محمد",
        role: "specialist",
        roleName: "طبيب اختصاص",
        active: true
    },

    {
        id: "ST-004",
        name: "د. أحمد",
        role: "resident",
        roleName: "طبيب مقيم",
        active: true
    },

    {
        id: "ST-005",
        name: "ممرض سند 1",
        role: "nurse",
        roleName: "ممرض صحي",
        active: true
    },

    {
        id: "ST-006",
        name: "أخصائي التغذية",
        role: "nutrition",
        roleName: "أخصائي تغذية",
        active: true
    },

    {
        id: "ST-007",
        name: "أخصائي الترفيه",
        role: "entertainment",
        roleName: "أخصائي ترفيه",
        active: true
    },

    {
        id: "ST-008",
        name: "أخصائي العلاج الطبيعي",
        role: "physio",
        roleName: "أخصائي علاج طبيعي",
        active: true
    },

    {
        id: "ST-009",
        name: "الأخصائي النفسي",
        role: "psychologist",
        roleName: "أخصائي نفسي",
        active: true
    },

    {
        id: "ST-010",
        name: "كوافير سند",
        role: "hairdresser",
        roleName: "كوافير",
        active: true
    },

    {
        id: "ST-011",
        name: "معين سند",
        role: "assistant",
        roleName: "معين",
        active: true
    }

];


/* =====================================================
   تهيئة قاعدة الكادر
===================================================== */

function initializeStaffDatabase(){

    const existing =
        localStorage.getItem("sanadStaffDatabase");

    if(!existing){

        localStorage.setItem(
            "sanadStaffDatabase",
            JSON.stringify(
                SANAD_STAFF_DATABASE
            )
        );

    }

}


/* =====================================================
   قراءة الكادر
===================================================== */

function getStaffDatabase(){

    try{

        const staff =
            JSON.parse(
                localStorage.getItem(
                    "sanadStaffDatabase"
                ) || "[]"
            );

        return Array.isArray(staff)
            ? staff
            : [];

    }catch(error){

        return [];

    }

}


/* =====================================================
   الحصول على الكادر الفعال
===================================================== */

function getActiveStaff(){

    return getStaffDatabase().filter(
        function(staff){

            return staff.active === true;

        }
    );

}


/* =====================================================
   الحصول على الكادر حسب الوظيفة
===================================================== */

function getStaffByRole(role){

    return getActiveStaff().filter(
        function(staff){

            return staff.role === role;

        }
    );

}


/* =====================================================
   البحث عن موظف بواسطة ID
===================================================== */

function getStaffById(staffId){

    return getStaffDatabase().find(
        function(staff){

            return staff.id === staffId;

        }
    ) || null;

}


/* =====================================================
   تشغيل قاعدة البيانات
===================================================== */

initializeStaffDatabase();
