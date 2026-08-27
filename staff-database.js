/* =========================================================
   سند - قاعدة بيانات الكادر
   الملف: staff-database.js
   ========================================================= */

/*
   هذا الملف هو المصدر الرئيسي لبيانات الكادر.

   المدير: ثابت واحد
   باقي الوظائف: تبدأ بموظف واحد ويمكن إضافة موظفين مستقبلاً.

   البيانات تحفظ في localStorage حتى ننتقل لاحقاً
   إلى قاعدة بيانات حقيقية بدون تغيير منطق النظام.
*/


const SANAD_STAFF_STORAGE_KEY = "sanadStaffDatabase";


/* =========================================================
   1. الوظائف المعتمدة في شركة سند
========================================================= */

const SANAD_STAFF_ROLES = {

    manager: {
        role: "manager",
        title: "مدير الشركة",
        icon: "👨‍💼",
        fixed: true,
        initialCount: 1
    },

    receptionist: {
        role: "receptionist",
        title: "موظف استقبال",
        icon: "🧑‍💼",
        fixed: false,
        initialCount: 1
    },

    specialist: {
        role: "specialist",
        title: "طبيب أخصائي",
        icon: "👨‍⚕️",
        fixed: false,
        initialCount: 1
    },

    resident: {
        role: "resident",
        title: "طبيب مقيم",
        icon: "🩺",
        fixed: false,
        initialCount: 1
    },

    nurse: {
        role: "nurse",
        title: "ممرض صحي",
        icon: "👩‍⚕️",
        fixed: false,
        initialCount: 1
    },

    nutrition: {
        role: "nutrition",
        title: "أخصائي تغذية",
        icon: "🥗",
        fixed: false,
        initialCount: 1
    },

    entertainment: {
        role: "entertainment",
        title: "أخصائي ترفيه",
        icon: "🎭",
        fixed: false,
        initialCount: 1
    },

    physio: {
        role: "physio",
        title: "أخصائي علاج طبيعي",
        icon: "🏃",
        fixed: false,
        initialCount: 1
    },

    psychologist: {
        role: "psychologist",
        title: "أخصائي نفسي",
        icon: "🧠",
        fixed: false,
        initialCount: 1
    },

    hairdresser: {
        role: "hairdresser",
        title: "كوافير",
        icon: "💇",
        fixed: false,
        initialCount: 1
    },

    assistant: {
        role: "assistant",
        title: "معين",
        icon: "🛁",
        fixed: false,
        initialCount: 1
    }

};


/* =========================================================
   2. الكادر الابتدائي
========================================================= */

const SANAD_INITIAL_STAFF = [

    {
        staffId: "ST-001",
        name: "مدير سند",
        role: "manager",
        active: true,
        editableName: false
    },

    {
        staffId: "ST-002",
        name: "موظف استقبال 1",
        role: "receptionist",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-003",
        name: "طبيب أخصائي 1",
        role: "specialist",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-004",
        name: "طبيب مقيم 1",
        role: "resident",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-005",
        name: "ممرض صحي 1",
        role: "nurse",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-006",
        name: "أخصائي تغذية 1",
        role: "nutrition",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-007",
        name: "أخصائي ترفيه 1",
        role: "entertainment",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-008",
        name: "أخصائي علاج طبيعي 1",
        role: "physio",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-009",
        name: "أخصائي نفسي 1",
        role: "psychologist",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-010",
        name: "كوافير 1",
        role: "hairdresser",
        active: true,
        editableName: true
    },

    {
        staffId: "ST-011",
        name: "معين 1",
        role: "assistant",
        active: true,
        editableName: true
    }

];


/* =========================================================
   3. إنشاء معرف موظف جديد
========================================================= */

function generateStaffId() {

    const staff =
        getStaffDatabase();

    let maxNumber = 0;

    staff.forEach(function(employee) {

        const match =
            String(employee.staffId || "")
            .match(/^ST-(\d+)$/);

        if (match) {

            const number =
                Number(match[1]);

            if (number > maxNumber) {
                maxNumber = number;
            }

        }

    });

    return "ST-" +
        String(maxNumber + 1)
        .padStart(3, "0");

}


/* =========================================================
   4. قراءة قاعدة الكادر
========================================================= */

function getStaffDatabase() {

    try {

        const saved =
            localStorage.getItem(
                SANAD_STAFF_STORAGE_KEY
            );

        if (!saved) {

            const initial =
                SANAD_INITIAL_STAFF.map(function(employee) {

                    return {
                        ...employee
                    };

                });

            localStorage.setItem(
                SANAD_STAFF_STORAGE_KEY,
                JSON.stringify(initial)
            );

            return initial;

        }

        const parsed =
            JSON.parse(saved);

        if (!Array.isArray(parsed)) {

            throw new Error(
                "Staff database is not an array."
            );

        }

        return parsed;

    } catch (error) {

        console.error(
            "خطأ في قراءة قاعدة بيانات الكادر:",
            error
        );

        return [];

    }

}


/* =========================================================
   5. حفظ قاعدة الكادر
========================================================= */

function saveStaffDatabase(staff) {

    if (!Array.isArray(staff)) {

        return false;

    }

    localStorage.setItem(

        SANAD_STAFF_STORAGE_KEY,

        JSON.stringify(staff)

    );

    /*
       إشعار بقية صفحات النظام
    */

    localStorage.setItem(

        "sanadStaffDatabaseLastUpdate",

        new Date().toISOString()

    );

    return true;

}


/* =========================================================
   6. الحصول على موظف بواسطة ID
========================================================= */

function getStaffById(staffId) {

    const staff =
        getStaffDatabase();

    return staff.find(function(employee) {

        return employee.staffId === staffId;

    }) || null;

}


/* =========================================================
   7. الحصول على الموظفين حسب الوظيفة
========================================================= */

function getStaffByRole(role) {

    const staff =
        getStaffDatabase();

    return staff.filter(function(employee) {

        return (
            employee.role === role &&
            employee.active === true
        );

    });

}


/* =========================================================
   8. الحصول على الموظفين الفعالين
========================================================= */

function getActiveStaff() {

    const staff =
        getStaffDatabase();

    return staff.filter(function(employee) {

        return employee.active === true;

    });

}


/* =========================================================
   9. إضافة موظف
========================================================= */

function addStaff(name, role) {

    name =
        String(name || "").trim();

    role =
        String(role || "").trim();


    if (!name) {

        return {
            success: false,
            message: "يرجى إدخال اسم الموظف."
        };

    }


    if (!SANAD_STAFF_ROLES[role]) {

        return {
            success: false,
            message: "الوظيفة غير موجودة."
        };

    }


    const staff =
        getStaffDatabase();


    const staffId =
        generateStaffId();


    const employee = {

        staffId: staffId,

        name: name,

        role: role,

        active: true,

        editableName: true,

        createdAt:
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    staff.push(employee);


    saveStaffDatabase(staff);


    return {

        success: true,

        message:
            "تمت إضافة الموظف بنجاح.",

        employee: employee

    };

}


/* =========================================================
   10. تعديل اسم الموظف
========================================================= */

function updateStaffName(staffId, newName) {

    newName =
        String(newName || "").trim();


    if (!newName) {

        return {

            success: false,

            message:
                "يرجى إدخال اسم الموظف."

        };

    }


    const staff =
        getStaffDatabase();


    const employee =
        staff.find(function(item) {

            return item.staffId === staffId;

        });


    if (!employee) {

        return {

            success: false,

            message:
                "لم يتم العثور على الموظف."

        };

    }


    /*
       اسم المدير يمكن اعتباره ثابتاً
       حسب تصميم النظام الحالي.
    */

    if (employee.role === "manager") {

        return {

            success: false,

            message:
                "بيانات مدير الشركة ثابتة."

        };

    }


    employee.name =
        newName;


    employee.updatedAt =
        new Date().toISOString();


    saveStaffDatabase(staff);


    return {

        success: true,

        message:
            "تم تعديل اسم الموظف بنجاح.",

        employee: employee

    };

}


/* =========================================================
   11. تفعيل موظف
========================================================= */

function activateStaff(staffId) {

    return setStaffActive(
        staffId,
        true
    );

}


/* =========================================================
   12. تعطيل موظف
========================================================= */

function deactivateStaff(staffId) {

    const employee =
        getStaffById(staffId);


    if (
        employee &&
        employee.role === "manager"
    ) {

        return {

            success: false,

            message:
                "لا يمكن تعطيل مدير الشركة."

        };

    }


    return setStaffActive(
        staffId,
        false
    );

}


/* =========================================================
   13. تغيير حالة الموظف
========================================================= */

function setStaffActive(
    staffId,
    active
) {

    const staff =
        getStaffDatabase();


    const employee =
        staff.find(function(item) {

            return item.staffId === staffId;

        });


    if (!employee) {

        return {

            success: false,

            message:
                "لم يتم العثور على الموظف."

        };

    }


    employee.active =
        Boolean(active);


    employee.updatedAt =
        new Date().toISOString();


    saveStaffDatabase(staff);


    return {

        success: true,

        message:
            employee.active
            ?
            "تم تفعيل الموظف."
            :
            "تم تعطيل الموظف.",

        employee: employee

    };

}


/* =========================================================
   14. التحقق من الوظيفة
========================================================= */

function isValidStaffRole(role) {

    return Boolean(
        SANAD_STAFF_ROLES[role]
    );

}


/* =========================================================
   15. اسم الوظيفة بالعربي
========================================================= */

function getStaffRoleName(role) {

    return SANAD_STAFF_ROLES[role]
        ?
        SANAD_STAFF_ROLES[role].title
        :
        "غير محدد";

}


/* =========================================================
   16. أيقونة الوظيفة
========================================================= */

function getStaffRoleIcon(role) {

    return SANAD_STAFF_ROLES[role]
        ?
        SANAD_STAFF_ROLES[role].icon
        :
        "👤";

}


/* =========================================================
   17. عدد الموظفين في وظيفة
========================================================= */

function getStaffCount(role) {

    return getStaffByRole(role).length;

}


/* =========================================================
   18. البحث عن موظف بالاسم
========================================================= */

function findStaffByName(name) {

    const search =
        String(name || "")
        .trim()
        .toLowerCase();


    if (!search) {

        return null;

    }


    const staff =
        getStaffDatabase();


    return staff.find(function(employee) {

        return String(employee.name)
            .toLowerCase()
            .includes(search);

    }) || null;

}


/* =========================================================
   19. حذف موظف
========================================================= */

function deleteStaff(staffId) {

    const staff =
        getStaffDatabase();


    const employee =
        staff.find(function(item) {

            return item.staffId === staffId;

        });


    if (!employee) {

        return {

            success: false,

            message:
                "لم يتم العثور على الموظف."

        };

    }


    /*
       المدير لا يحذف.
    */

    if (employee.role === "manager") {

        return {

            success: false,

            message:
                "مدير الشركة ثابت ولا يمكن حذفه."

        };

    }


    /*
       لا نحذف الموظف فعلياً.
       نعطله حتى تبقى المواعيد القديمة
       مرتبطة به بشكل صحيح.
    */

    employee.active = false;

    employee.updatedAt =
        new Date().toISOString();


    saveStaffDatabase(staff);


    return {

        success: true,

        message:
            "تم تعطيل الموظف بدلاً من حذفه.",

        employee: employee

    };

}


/* =========================================================
   20. بيانات جاهزة للجداول
========================================================= */

function getStaffForSchedule(role) {

    return getStaffByRole(role)
        .map(function(employee) {

            return {

                staffId:
                    employee.staffId,

                name:
                    employee.name,

                role:
                    employee.role,

                roleName:
                    getStaffRoleName(
                        employee.role
                    ),

                active:
                    employee.active

            };

        });

}


/* =========================================================
   21. تهيئة قاعدة البيانات
========================================================= */

function initializeStaffDatabase() {

    const staff =
        getStaffDatabase();


    /*
       التأكد من وجود مدير واحد على الأقل.
    */

    const managers =
        staff.filter(function(employee) {

            return employee.role === "manager";

        });


    if (managers.length === 0) {

        staff.unshift({

            staffId: "ST-001",

            name: "مدير سند",

            role: "manager",

            active: true,

            editableName: false,

            createdAt:
                new Date().toISOString(),

            updatedAt:
                new Date().toISOString()

        });


        saveStaffDatabase(staff);

    }

}


/* =========================================================
   22. التشغيل
========================================================= */

initializeStaffDatabase();
