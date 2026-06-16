# تقرير التدقيق الشامل — Ramex Store
**تاريخ التدقيق:** 2026-06-16 | **المعيار:** Production — End-to-End | **الفرع:** main

---

## ملخص تنفيذي

| الحالة | العدد |
|---|---|
| ✅ مكتملة بالكامل | 14 |
| ⚠️ مكتملة جزئياً | 0 |
| ❌ معطوبة | 0 |
| 🔵 واجهة فقط | 0 |
| ⬜ غير موجودة | 0 |

---

## 1 — استلام مرتجع للمصنع من المحل

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `frontend/src/pages/items/Rolls.tsx`
- `backend/src/domain/items/rolls.service.ts` (سطر 158–198)
- `backend/src/domain/inventory/audit.helper.ts`
- `backend/src/db/migrations/066_add_shop_to_factory_return_event.ts`
- `frontend/src/i18n/ar.ts`

**نتائج التحقق:**
- ✅ زر "إرجاع إلى المصنع" موجود ومحمي بـ `can('inventory','write')`، يظهر فقط عند `warehouse==='shop'` و `status==='in_stock'`
- ✅ العملية تغيّر `warehouse` من `shop` إلى `factory` داخل transaction
- ✅ سجل `stock_movements` بنوع `shop_to_factory_return` يُنشأ
- ✅ النوع مُضاف في migration 066
- ✅ الحركة تظهر في تقرير حركات المخزن
- ✅ **سجل `audit_log` يُنشأ الآن داخل نفس الـ transaction** — `action: 'shop_to_factory_return'`, `entity: 'roll'`, `severity: 'medium'`, يحتوي على `roll_sr_no` و `before.warehouse` و `after.warehouse`

**التغيير المُطبَّق:**
```typescript
// في rolls.service.ts — import مُضاف
import { auditFromService } from '../inventory/audit.helper.js';

// داخل الـ transaction — بعد stock_movements.insert
await auditFromService(trx, {
  actorUserId,
  action: 'shop_to_factory_return',
  entity: 'roll',
  entityId: rollId,
  before: { warehouse: 'shop', roll_sr_no: roll.roll_sr_no, status: roll.status },
  after: { warehouse: 'factory' },
  severity: 'medium',
});
```

**الإصلاحات المطلوبة:** لا شيء.

---

## 2 — صلاحيات المصنع

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `backend/src/db/migrations/064_factory_sender_shipments_approve_hard_deny.ts`
- `backend/src/middleware/requirePermission.ts`
- `backend/src/domain/permissions/permissionsService.ts`
- `frontend/src/pages/settings/SettingsPage.tsx`
- `frontend/src/pages/settings/EditUserPermissionsDialog.tsx`

**نتائج التحقق:**
- ✅ حجب `shipments.approve` عند **3 طبقات مستقلة**: DB (migration 064) + HTTP middleware + code-level `HARD_DENY`
- ✅ صلاحيات factory_sender مرئية في محرر الأدوار
- ✅ سطر `shipments.approve` مقفول بصرياً (disabled + tooltip)
- ✅ نافذة التعديل لكل مستخدم أيضاً تقفل هذا الصف
- ✅ factory_sender يملك: `fabric_rolls.read/write`, `inventory.read`, `shipments.read/write`
- ✅ جميع الصلاحيات محفوظة في DB

**الإصلاحات المطلوبة:** لا شيء.

---

## 3 — تعديل داشبورد أحمد المصنع

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

> **تصحيح:** المتطلب الأصلي هو شاشة وصول سريع فقط — لا إحصائيات، لا API، لا ويدجت. تقييم "معطوبة" في النسخة السابقة كان مبنياً على افتراض خاطئ.

**الملفات المعنية:**
- `frontend/src/components/dashboard/FactorySenderDashboard.tsx`
- `frontend/src/pages/Home.tsx`
- `frontend/src/App.tsx` (سطر 110، 121)

**نتائج التحقق مقابل المتطلب الفعلي:**
- ✅ زر "إضافة توب" موجود ومرتبط بـ `/items/tops/add`
- ✅ زر "إنشاء طلبية" موجود ومرتبط بـ `/shipments/create`
- ✅ كلا المسارين محميان بـ `PermGate` في `App.tsx`: `fabric_rolls` و `shipments`
- ✅ `HomePage` يوجّه `factory_sender` تلقائياً لهذه الشاشة
- ✅ إذا لم يكن للمستخدم أي ميزة متاحة → يُعاد توجيهه لـ `/no-access`

**الإصلاحات المطلوبة:** لا شيء.

---

## 4 — أتواب للعينات

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `frontend/src/pages/items/Rolls.tsx`
- `frontend/src/i18n/ar.ts`
- `backend/src/domain/sales/invoices.service.ts`
- `backend/src/domain/sales/openInvoices.service.ts`

**نتائج التحقق:**
- ✅ زرا "تحويل إلى عيّنة" و"إلغاء العيّنة" موجودان ومقيّدان بدور المالك
- ✅ التحويل يضبط `status='sample'` + `is_visible_at_pos=false`
- ✅ نقطة البيع تمنع إضافة توب بـ `is_visible_at_pos=false` في خدمتين مستقلتين
- ✅ التسميات موجودة في `ar.ts` (`markAsSample`, `unmarkSample`, `sampleConfirm`)

**الإصلاحات المطلوبة:** لا شيء.

---

## 5 — إضافة خامات الريب والإكسسوار بالكيلو

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `backend/src/db/migrations/065_add_fabric_category.ts`
- `frontend/src/pages/items/AddTop.tsx`
- `frontend/src/lib/fabric-unit.ts`
- `frontend/src/i18n/ar.ts`
- `backend/src/domain/items/tops.service.ts`

**نتائج التحقق:**
- ✅ حقل `category` في DB يقبل `main | rib | accessory`
- ✅ نموذج AddTop يعرض أزرار التصنيف وخيار الوحدة (كجم / متر)
- ✅ خامات الكيلو لا تستلزم `length_m`؛ خامات المتر تستلزمه
- ✅ `fabric-unit.ts` يُرجع `'كجم'` أو `'م'` في كل مكان
- ✅ التقارير والمخزن يستخدمان `fabric_unit` عبر JOIN

**الإصلاحات المطلوبة:** لا شيء.

---

## 6 — تغيير اسم رولات وأصناف إلى أتواب في السيستم كله

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**نتائج التحقق — واجهة المستخدم (ar.ts):**
- ✅ جميع تسميات UI تستخدم "توب / أتواب / اتواب"
- ✅ `nav.config.ts` → `labelAr: 'الاتواب'`
- ✅ الجداول والتقارير والنماذج والـ PDF — نظيفة

**التعليقات المُحدَّثة:**

| الملف | السطر | قبل | بعد |
|---|---|---|---|
| `backend/src/domain/inventory/inventory.routes.ts` | 27 | `رولات in factory` | `أتواب in factory` |
| `backend/src/domain/inventory/adjustments.service.ts` | 17 | `Factory رولات may only leave` | `Factory أتواب may only leave` |
| `backend/src/domain/items/items.routes.ts` | 39 | `رولات may only be created` | `أتواب may only be created` |
| `backend/src/db/scripts/wipe-inventory.ts` | 48 | `new رولات start clean` | `new أتواب start clean` |

**الإصلاحات المطلوبة:** لا شيء.

---

## 7 — التقارير — إلغاء إجمالي الأرباح

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `frontend/src/pages/reports/GeneralReport.tsx`
- `frontend/src/pages/reports/DailyReport.tsx`
- `backend/src/domain/reports/generalReportService.ts`
- `frontend/src/pages/inventory/StockView.tsx`

**نتائج التحقق:**
- ✅ `GeneralReport.tsx` — لا يعرض أرباحاً
- ✅ `DailyReport.tsx` — لا يعرض أرباحاً
- ✅ `generalReportService.ts` — لا يحسب أرباحاً في الـ API
- ✅ صادرات Excel/PDF — لا تحتوي على أرباح
- ✅ **`StockView.tsx` — بطاقة "الأرباح المتوقعة" محذوفة، والحقل `profit` محذوف من الـ `useMemo`، والـ import `PiggyBank` محذوف**

**التغييرات المُطبَّقة في `StockView.tsx`:**
1. حُذف `profit: totalSale - totalPurchase` من نتيجة `useMemo`
2. حُذفت بطاقة `MetricCard` بالكامل (label="الأرباح المتوقعة")
3. حُذف `PiggyBank` من قائمة imports لأنه لم يعد مستخدماً

**الإصلاحات المطلوبة:** لا شيء.

---

## 8 — تسويات الموظفين → سلف وخصومات

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `frontend/src/navigation/nav.config.ts` (سطر 464)
- `frontend/src/i18n/ar.ts`
- `frontend/src/pages/hr/Adjustments.tsx`
- `backend/src/domain/hr/adjustments.service.ts`

**نتائج التحقق:**
- ✅ القائمة: `labelAr: 'السُّلف والخصومات'`
- ✅ ar.ts: `adjustments: 'السُّلف والخصومات'`
- ✅ عنوان الصفحة وتسميات النموذج: "إضافة سلفة أو خصم"
- ✅ ملاحظة الخزينة في الـ backend: `'سُلفة: ...'`
- ✅ لا يوجد استخدام للفظة "تسويات" في أي كود واجهة مستخدم

**الإصلاحات المطلوبة:** لا شيء.

---

## 9 — تعديل UI شاشة صلاحيات السوبر أدمن

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `frontend/src/pages/settings/SettingsPage.tsx`
- `frontend/src/pages/settings/EditUserPermissionsDialog.tsx`
- `backend/src/domain/permissions/permissions.routes.ts`
- `backend/src/domain/permissions/permissionsService.ts`

**نتائج التحقق:**
- ✅ مصفوفة الأدوار الكاملة قابلة للتحميل والحفظ
- ✅ تبويبات لكل دور: `shop_seller`, `factory_sender`, `accountant`
- ✅ بحث + فلتر المجموعات + تفعيل/تعطيل جماعي
- ✅ نافذة التعديل لكل مستخدم: ثلاثي الحالة (افتراضي / سماح / رفض)
- ✅ مسارا الـ API محميان بـ `super_admin` فقط
- ✅ إلغاء cache عند الحفظ

**الإصلاحات المطلوبة:** لا شيء.

---

## 10 — العهدة — إظهار شاشة المصروفات وعدم الاعتماد على URL فقط

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `frontend/src/navigation/nav.config.ts`
- `frontend/src/App.tsx` (سطر 147)

**نتائج التحقق:**
- ✅ عنصر القائمة مخفي عند غياب صلاحية `cash_drawer.read` — بالمنطق لا بالـ URL
- ✅ المسار محمي بـ `<PermGate resource="cash_drawer">` — الدخول المباشر بـ URL يُعيد توجيه لـ `/no-access`
- ✅ حماية مزدوجة: القائمة + PermGate

**الإصلاحات المطلوبة:** لا شيء.

---

## 11 — السلف لا تُخصم أوتوماتيك

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `backend/src/domain/hr/salaries.service.ts` (سطر 38–48)
- `backend/src/db/migrations/067_hr_advance_repayments.ts`
- `frontend/src/pages/hr/Salaries.tsx`
- `frontend/src/i18n/ar.ts`

**نتائج التحقق:**
- ✅ الخصومات (`kind='deduction'`) تُجمع أوتوماتيكياً في المرتب
- ✅ السلف (`kind='advance'`) **لا تُخصم أوتوماتيكياً** — القيمة الافتراضية = 0
- ✅ يتطلب إدخال يدوي للمبلغ المُسدَّد من السلفة
- ✅ التحقق: السداد لا يتجاوز الرصيد المستحق
- ✅ المبلغ يُحفظ في جدول `hr_advance_repayments` وفي سجل صرف المرتب

**الإصلاحات المطلوبة:** لا شيء.

---

## 12 — صفحة ديون الموردين

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `frontend/src/pages/treasury/SupplierLedgerPage.tsx`
- `frontend/src/pages/treasury/SuppliersListPage.tsx`
- `frontend/src/lib/suppliers-api.ts`
- `backend/src/domain/treasury/suppliers/suppliers.service.ts`
- `backend/src/db/migrations/068_supplier_payables.ts`

**نتائج التحقق:**
- ✅ اسم المورد معروض
- ✅ إجمالي الدين (`total_invoiced_egp`) معروض
- ✅ جميع المدفوعات مع تواريخها معروضة
- ✅ الرصيد المتبقي (`balance_egp`) معروض بلون خطر عند `> 0`
- ✅ الحسابات صحيحة: `balance = total_invoiced − total_paid`
- ✅ المسار محمي بـ `<PermGate resource="suppliers">`
- ✅ سجل `audit_log` عند إنشاء فاتورة أو تسجيل دفعة

**الإصلاحات المطلوبة:** لا شيء.

---

## 13 — شاشة كل الطلبيات

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

**الملفات المعنية:**
- `frontend/src/pages/shipments/ShipmentsList.tsx`
- `frontend/src/pages/shipments/ReviewShipment.tsx`
- `backend/src/domain/inventory/inventory.routes.ts` (سطر 24–25)
- `backend/src/middleware/requirePermission.ts`

**نتائج التحقق:**
- ✅ `canApprove = !permsLoading && can('shipments','approve')` — آمن أثناء التحميل (default = false)
- ✅ أزرار الموافقة/الرفض ظاهرة **فقط** عند `canApprove=true`
- ✅ عمود الإجراءات في الجدول مخفي عند غياب الصلاحية
- ✅ API: `requirePermission('shipments','approve')` على سطري 24 و 25
- ✅ HARD_DENY لـ `factory_sender` على مستوى HTTP قبل أي استعلام DB

**الإصلاحات المطلوبة:** لا شيء.

---

## 14 — الشاشة الرئيسية الخاصة بأحمد

**الحالة: ✅ مكتملة بالكامل | الخطورة: منخفضة**

> **تصحيح:** المتطلب الأصلي هو زرّان للوصول السريع فقط — لا إحصائيات مطلوبة.

**الملفات المعنية:**
- `frontend/src/components/dashboard/FactorySenderDashboard.tsx`
- `frontend/src/pages/Home.tsx`

**نتائج التحقق مقابل المتطلب الفعلي:**
- ✅ زر "إضافة توب" موجود ومرتبط بـ `/items/tops/add` — مسار حقيقي، factory_sender يملك `fabric_rolls.write`
- ✅ زر "إنشاء طلبية" موجود ومرتبط بـ `/shipments/create` — مسار حقيقي، factory_sender يملك `shipments.write`
- ✅ الصلاحيات محترمة — كلا الزرّين يستدعيان مسارات محمية بـ `PermGate`
- ✅ لا يحتاج المستخدم لتذكّر أي URL — الشاشة هي الصفحة الرئيسية لهذا الدور

**الإصلاحات المطلوبة:** لا شيء.

---

## جدول الملخص النهائي

| # | الميزة | الحالة | الخطورة | ملاحظات |
|---|---|---|---|---|
| 1 | استلام مرتجع للمصنع | ✅ مكتملة | منخفضة | `audit_log` يُنشأ الآن داخل الـ transaction |
| 2 | صلاحيات المصنع | ✅ مكتملة | منخفضة | حجب ثلاثي الطبقات مؤكّد |
| 3 | تعديل داشبورد أحمد | ✅ مكتملة | منخفضة | زرّا الوصول السريع موجودان ومحميان — لا إحصائيات مطلوبة |
| 4 | أتواب للعينات | ✅ مكتملة | منخفضة | POS محجوب في خدمتين مستقلتين |
| 5 | خامات الريب بالكيلو | ✅ مكتملة | منخفضة | الفئة والوحدة مربوطان end-to-end |
| 6 | تغيير رولات → أتواب | ✅ مكتملة | منخفضة | UI نظيفة؛ 4 تعليقات backend مُحدَّثة |
| 7 | إلغاء الأرباح من التقارير | ✅ مكتملة | منخفضة | التقارير نظيفة؛ بطاقة الأرباح محذوفة من StockView.tsx |
| 8 | تسويات → سلف وخصومات | ✅ مكتملة | منخفضة | القائمة + ar.ts + الصفحة + backend كلها محدّثة |
| 9 | UI شاشة صلاحيات السوبر أدمن | ✅ مكتملة | منخفضة | مصفوفة كاملة + تعديل لكل مستخدم |
| 10 | إظهار المصروفات في القائمة | ✅ مكتملة | منخفضة | حماية مزدوجة: قائمة + PermGate |
| 11 | السلف لا تُخصم أوتوماتيك | ✅ مكتملة | منخفضة | إدخال يدوي فقط؛ يتحقق من الرصيد |
| 12 | صفحة ديون الموردين | ✅ مكتملة | منخفضة | كامل: اسم + دين + مدفوعات + تواريخ + رصيد |
| 13 | شاشة كل الطلبيات | ✅ مكتملة | منخفضة | حجب الموافقة في UI + API + HARD_DENY |
| 14 | الشاشة الرئيسية لأحمد | ✅ مكتملة | منخفضة | الزرّان يعملان — لا إحصائيات مطلوبة بالمتطلب الأصلي |

---

## أ) مكتملة بالكامل (14)
1، 2، 3، 4، 5، 6، 7، 8، 9، 10، 11، 12، 13، 14

## ب) مكتملة جزئياً (0)
لا يوجد

## ج) معطوبة (0)
لا يوجد

## د) واجهة فقط
لا يوجد

## هـ) غير موجودة
لا يوجد — جميع الميزات الـ 14 موجودة بشكل من الأشكال

## و) مخاوف أمنية
- لا مخاوف حرجة — جميع مسارات API تحمل `requirePermission` أو `requireRole('super_admin')`

## ز) مخاوف الصلاحيات
- لا مخاوف — `factory_sender` محجوب من `shipments.approve` بثلاث طبقات مستقلة

## ح) مخاوف قاعدة البيانات
لا يوجد — جميع الكتابات الحساسة لها سجل في `audit_log`.

---

## ط) الملفات التي تم تعديلها

جميع الإصلاحات مُطبَّقة. لا توجد تعديلات معلّقة.

| الملف | التغيير | الميزة |
|---|---|---|
| `backend/src/domain/items/rolls.service.ts` | import مُضاف + `auditFromService` داخل transaction | 1 |
| `frontend/src/pages/inventory/StockView.tsx` | حذف `profit` من useMemo + حذف MetricCard + حذف import PiggyBank | 7 |
| `backend/src/domain/inventory/inventory.routes.ts` | تعليق سطر 27: رولات → أتواب | 6 |
| `backend/src/domain/inventory/adjustments.service.ts` | تعليق سطر 17: رولات → أتواب | 6 |
| `backend/src/domain/items/items.routes.ts` | تعليق سطر 39: رولات → أتواب | 6 |
| `backend/src/db/scripts/wipe-inventory.ts` | تعليق سطر 48: رولات → أتواب | 6 |

---

*تقرير التدقيق الشامل — Ramex Store — 2026-06-16*
*معيار التدقيق: End-to-End — UI → API → Backend → Database → Permissions*
