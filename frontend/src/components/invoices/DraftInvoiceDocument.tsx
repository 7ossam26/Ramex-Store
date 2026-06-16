import './DraftInvoiceDocument.css';
import { fmtMoney, fmtInt, fmtWeight } from '@/components/dashboard/format';

export interface DraftInvoiceLine {
  description: string;
  bolts: number;
  quantity: number;
  quantityUnit: 'kg' | 'm' | 'pcs' | string;
  unitPrice: number;
  discountPct: number;
  amount: number;
}

export interface DraftInvoiceDocumentProps {
  shopName?: string;
  customerName?: string;
  phone: string;
  totalBolts: number;
  totalQuantity: number;
  customerCode: string;
  lines: DraftInvoiceLine[];
  subtotal: number;
  rounding: number;
  total: number;
  issuedAt?: string;
  notes?: string[];
  footerWarning?: string;
  currencyLabel?: string;
  invoiceType?: 'sale' | 'open';
  depositPaid?: number;
  balance?: number;
}

const DEFAULT_NOTES = [
  'يرجي الانتباه علي رقم وصورة اللوط لعدم الدمج أثناء القص',
  'يرجي التأكيد علي ثباتيات اللون و الانكماشات قبل القص',
  'مدة الارتجاع او الاستبدال حد أقصي 14 يوم من تاريخ الاستلام في حال وجود عيوب تصنيع و في حال لون أو رسمة خاصة لا يتم الارتجاع او الاستبدال',
  'لا يتم استرجاع أو استبدل أقمشة الاكسسوارات أو الألوان و الرسومات الخاصة',
  'يرجى العلم أنه قد يتم تقريب الكمية المطلوبة لأقرب وزن توب، و ذلك في حدود نسبة تفاوت لا تتجاوز ± %10 من الكمية المطلوبة',
];

const DEFAULT_FOOTER =
  'الشركة غير مسئولة عن أي بضاعة بعد القص مهما كانت الأسباب';

const ROWS_PER_PAGE = 14;
const INFO_LABELS = {
  phone: '\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641',
  bolts: '\u0627\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0627\u062a\u0648\u0627\u0628',
  qty: '\u0627\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0643\u0645\u064a\u0629',
};
const CUSTOMER_LABELS = {
  name: '\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064a\u0644',
  code: '\u0643\u0648\u062f \u0627\u0644\u0639\u0645\u064a\u0644',
};

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function fmtIssuedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return `${date}  ${time}`;
}

/* Forces LTR reading direction for digits/currency codes inside RTL cells. */
function Num({ v }: { v: string }) {
  return (
    <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {v}
    </span>
  );
}

function InvoicePage({
  props,
  pageLines,
  isLastPage,
  pageNumber,
  totalPages,
}: {
  props: DraftInvoiceDocumentProps;
  pageLines: DraftInvoiceLine[];
  isLastPage: boolean;
  pageNumber: number;
  totalPages: number;
}) {
  const {
    shopName = 'RMX',
    customerName,
    phone,
    totalBolts,
    totalQuantity,
    customerCode,
    subtotal,
    rounding,
    total,
    issuedAt,
    notes = DEFAULT_NOTES,
    footerWarning = DEFAULT_FOOTER,
    currencyLabel = 'EGP',
    invoiceType = 'sale',
    depositPaid = 0,
    balance = 0,
  } = props;

  const infoItems: { label: string; value: string; ltr?: boolean }[] = [
    { label: INFO_LABELS.bolts, value: fmtInt(totalBolts) },
    { label: INFO_LABELS.qty, value: fmtWeight(totalQuantity) },
  ];

  return (
    <div className="rmx-draft-doc">

      {/* ── Header band: ONLY the brand name. Nothing else beside it. ── */}
      <div className="rmx-draft-header">
        <div className="rmx-draft-brand">{shopName}</div>
      </div>

      {/* ── Masthead: document title, right-aligned, large gray ── */}
      <div className="rmx-draft-masthead">
        <h1 className="rmx-draft-title">
          {invoiceType === 'open' ? 'فاتورة مفتوحة' : 'فاتورة مبيعات'}
        </h1>
        {issuedAt && (
          <div className="rmx-draft-issued-at" dir="ltr">{fmtIssuedAt(issuedAt)}</div>
        )}
      </div>

      {/* ── Customer block: name (right) · code (center) · phone (left) ── */}
      <div className="rmx-draft-cust-block">
        {customerName && (
          <div className="rmx-draft-cust-cell">
            <span className="rmx-draft-cust-label">{CUSTOMER_LABELS.name}</span>
            <span className="rmx-draft-cust-value">{customerName}</span>
          </div>
        )}
        <div className="rmx-draft-cust-cell" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="rmx-draft-cust-label">{CUSTOMER_LABELS.code}</span>
          <span className="rmx-draft-cust-value" dir="ltr">{customerCode}</span>
        </div>
        <div className="rmx-draft-cust-cell" style={{ alignItems: 'flex-end', textAlign: 'left' }}>
          <span className="rmx-draft-cust-label">{INFO_LABELS.phone}</span>
          <span className="rmx-draft-cust-value" dir="ltr">{phone}</span>
        </div>
      </div>

      {/* ── Info grid: phone + bolts + quantity ── */}
      <div
        className="rmx-draft-info-grid"
        style={{ gridTemplateColumns: `repeat(${infoItems.length}, 1fr)` }}
      >
        {infoItems.map((item, i) => (
          <div key={i} className="rmx-draft-info-cell">
            <span className="rmx-draft-info-label">{item.label}</span>
            <span className="rmx-draft-info-value" dir={item.ltr ? 'ltr' : undefined}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Line items table ── */}
      <table className="rmx-draft-table">
        <colgroup>
          <col className="rmx-draft-col-desc" />
          <col className="rmx-draft-col-bolts" />
          <col className="rmx-draft-col-qty" />
          <col className="rmx-draft-col-price" />
          <col className="rmx-draft-col-disc" />
          <col className="rmx-draft-col-amt" />
        </colgroup>
        <thead>
          <tr>
            <th>الوصف</th>
            <th>عدد الاتواب</th>
            <th>الكمية</th>
            <th>سعر الكيلو/المتر</th>
            <th>خصم %</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {pageLines.map((line, i) => (
            <tr key={i}>
              <td>{line.description}</td>
              <td><Num v={fmtInt(line.bolts)} /></td>
              <td><Num v={`${fmtWeight(line.quantity)} ${line.quantityUnit}`} /></td>
              <td><Num v={fmtMoney(line.unitPrice)} /></td>
              <td><Num v={fmtMoney(line.discountPct)} /></td>
              <td><Num v={`${currencyLabel} ${fmtMoney(line.amount)}`} /></td>
            </tr>
          ))}
          {pageLines.length === 0 && invoiceType === 'open' && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
                لا توجد أصناف مضافة بعد
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── Totals: last page only ── */}
      {isLastPage && (
        <div className="rmx-draft-totals-wrap">
          <div className="rmx-draft-totals">
            {invoiceType === 'open' ? (
              <>
                <div className="rmx-draft-totals-row">
                  <span className="rmx-draft-totals-label">إجمالي البضاعة</span>
                  <span className="rmx-draft-totals-value">
                    <Num v={`${currencyLabel} ${fmtMoney(total)}`} />
                  </span>
                </div>
                <div className="rmx-draft-totals-row">
                  <span className="rmx-draft-totals-label">العربون المدفوع</span>
                  <span className="rmx-draft-totals-value">
                    <Num v={`${currencyLabel} ${fmtMoney(depositPaid)}`} />
                  </span>
                </div>
                <div className="rmx-draft-totals-row rmx-draft-totals-row--total">
                  <span className="rmx-draft-totals-label">المتبقي</span>
                  <span className="rmx-draft-totals-value">
                    <Num v={`${currencyLabel} ${fmtMoney(balance)}`} />
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="rmx-draft-totals-row">
                  <span className="rmx-draft-totals-label">المبلغ</span>
                  <span className="rmx-draft-totals-value">
                    <Num v={`${currencyLabel} ${fmtMoney(subtotal)}`} />
                  </span>
                </div>
                <div className="rmx-draft-totals-row rmx-draft-totals-row--total">
                  <span className="rmx-draft-totals-label">الإجمالي</span>
                  <span className="rmx-draft-totals-value">
                    <Num v={`${currencyLabel} ${fmtMoney(total)}`} />
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Notes: last page only ── */}
      {isLastPage && (
        <div className="rmx-draft-notes">
          <div className="rmx-draft-notes-heading">
            ملاحظات و تعليمات بمثابة إخطار
          </div>
          <ol className="rmx-draft-notes-list">
            {notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="rmx-draft-footer">{footerWarning}</div>

      {/* ── Page number (multi-page only) ── */}
      {totalPages > 1 && (
        <div className="rmx-draft-page-num">
          Page {pageNumber} / {totalPages}
        </div>
      )}
    </div>
  );
}

export function DraftInvoiceDocument(props: DraftInvoiceDocumentProps) {
  const pages = chunk(props.lines, ROWS_PER_PAGE);
  if (pages.length === 0) pages.push([]);

  return (
    <>
      {pages.map((pageLines, idx) => (
        <div key={idx}>
          <InvoicePage
            props={props}
            pageLines={pageLines}
            isLastPage={idx === pages.length - 1}
            pageNumber={idx + 1}
            totalPages={pages.length}
          />
          {idx < pages.length - 1 && (
            <div className="rmx-draft-page-break" />
          )}
        </div>
      ))}
    </>
  );
}

export const demoDraftInvoice: DraftInvoiceDocumentProps = {
  shopName: 'RMX',
  customerName: 'محمد رمزي مصنع اويم',
  phone: '01017988498',
  totalBolts: 14,
  totalQuantity: 222.2,
  customerCode: 'B6123',
  issuedAt: '2026-05-25T11:30:00.000Z',
  lines: [
    {
      description: 'ميلتون للبيع (nt, 4121, nd, 1K)',
      bolts: 4,
      quantity: 106.3,
      quantityUnit: 'kg',
      unitPrice: 342,
      discountPct: 8,
      amount: 33446.23,
    },
    {
      description: 'ميلتون P8 للبيع (nt, 1808, nd, 1K)',
      bolts: 3,
      quantity: 80.7,
      quantityUnit: 'kg',
      unitPrice: 342,
      discountPct: 8,
      amount: 25391.45,
    },
    {
      description: 'ميلتون دربي P8 للبيع (nd, 1K, 1808)',
      bolts: 3,
      quantity: 16,
      quantityUnit: 'kg',
      unitPrice: 395,
      discountPct: 8,
      amount: 5814.4,
    },
    {
      description: 'ميلتون دربي للبيع (nd, 1K, 4121)',
      bolts: 4,
      quantity: 19.2,
      quantityUnit: 'kg',
      unitPrice: 395,
      discountPct: 8,
      amount: 6977.28,
    },
  ],
  subtotal: 71629.36,
  rounding: 0.64,
  total: 71630,
};
