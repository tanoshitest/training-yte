/**
 * Dựng đối tượng `InvoiceData` gửi MISA meInvoice (POST /invoice/publishing và
 * /invoice/unpublishview) theo đúng đặc tả tại developer.misa.vn/products-openapi/MEINVOICE.
 *
 * Học phí là một dòng dịch vụ duy nhất (ItemType 1, số lượng 1). Số tiền phụ huynh đã trả là
 * tổng thanh toán ĐÃ gồm thuế; thuế suất lấy nguyên văn từ cấu hình `taxRateLabel`
 * (KCT / KKKNT / 0% / 5% / 8% / 10% / KHAC:x%) rồi tách ngược ra tiền trước thuế + tiền thuế.
 * Tiền VND làm tròn tới đồng (OptionUserDefined khai 0 chữ số thập phân cho mọi loại tiền),
 * tiền thuế = tổng − tiền trước thuế để tổng luôn khớp đúng số tiền đã thu.
 */

export interface MisaInvoiceBuyer {
  /** Họ tên người mua (cá nhân) — bắt buộc với hóa đơn học phí. */
  fullName: string;
  /** Tên đơn vị — MISA bắt buộc khi có mã số thuế người mua. */
  legalName?: string;
  taxCode?: string;
  address?: string;
  email?: string;
  phone?: string;
  code?: string;
  /** Số CCCD 12 chữ số của người mua — gửi `BuyerIDNumber` (mẫu theo NĐ70). */
  idNumber?: string;
}

export interface MisaInvoiceDraft {
  refId: string;
  invSeries: string;
  invTemplateNo?: string;
  taxRateLabel: string;
  buyer: MisaInvoiceBuyer;
  itemName: string;
  unitName?: string;
  /** Tổng tiền thanh toán (đã gồm thuế), VND. */
  amount: number;
  /** Hình thức thanh toán in trên hóa đơn; mặc định "TM/CK". */
  paymentMethodName?: string;
  /** Mặc định ngày hôm nay theo giờ Việt Nam — MISA không cho ngày hóa đơn lùi sau hóa đơn đã phát hành. */
  invoiceDate?: Date;
}

export type MisaPayloadResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: string; message: string };

const FIXED_LABELS = new Set(["KCT", "KKKNT"]);

/** Chuẩn hoá nhãn thuế suất và trả về phần trăm; `null` nếu nhãn không thuộc danh sách MISA chấp nhận. */
export function parseMisaVatRate(label: string): { name: string; percent: number } | null {
  const raw = label.trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return null;
  if (FIXED_LABELS.has(raw)) return { name: raw, percent: 0 };
  const other = /^KHAC:(\d+(?:[.,]\d+)?)%?$/.exec(raw);
  if (other) {
    const percent = Number(other[1].replace(",", "."));
    return Number.isFinite(percent) ? { name: `KHAC:${percent}%`, percent } : null;
  }
  const standard = /^(\d+)%?$/.exec(raw);
  if (standard && ["0", "5", "8", "10"].includes(standard[1])) {
    return { name: `${standard[1]}%`, percent: Number(standard[1]) };
  }
  return null;
}

/** yyyy-MM-dd theo múi giờ Asia/Ho_Chi_Minh (máy chủ có thể chạy UTC). */
export function vietnamDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function buildMisaInvoiceData(draft: MisaInvoiceDraft): MisaPayloadResult {
  const vat = parseMisaVatRate(draft.taxRateLabel || "");
  if (!vat) {
    return { ok: false, code: "INVALID_TAX_RATE", message: `Thuế suất "${draft.taxRateLabel || ""}" không hợp lệ. Dùng một trong: KCT, KKKNT, 0%, 5%, 8%, 10%, KHAC:x%.` };
  }
  const invSeries = draft.invSeries.trim();
  if (!invSeries) return { ok: false, code: "MISSING_INV_SERIES", message: "Chưa cấu hình ký hiệu hóa đơn (InvSeries)." };
  const fullName = draft.buyer.fullName.trim();
  if (!fullName) return { ok: false, code: "MISSING_BUYER", message: "Thiếu tên người mua." };
  const amount = Math.round(Number(draft.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, code: "INVALID_AMOUNT", message: "Số tiền hóa đơn phải lớn hơn 0." };
  const taxCode = (draft.buyer.taxCode || "").trim();
  const address = (draft.buyer.address || "").trim();
  const email = (draft.buyer.email || "").trim();
  const idNumber = (draft.buyer.idNumber || "").trim();
  // MISA bắt buộc "Tên đơn vị" (BuyerLegalName) khi có mã số thuế, kể cả mã là CCCD 12 số: thiếu thì lấy tên người mua.
  const legalName = taxCode ? (draft.buyer.legalName || "").trim() || fullName : (draft.buyer.legalName || "").trim();
  if (taxCode && !address) {
    return { ok: false, code: "MISSING_BUYER_ADDRESS", message: "Có mã số thuế người mua thì MISA bắt buộc có địa chỉ người mua." };
  }

  const withoutVat = vat.percent > 0 ? Math.round((amount * 100) / (100 + vat.percent)) : amount;
  const vatAmount = amount - withoutVat;

  const data: Record<string, unknown> = {
    RefID: draft.refId,
    InvSeries: invSeries,
    // Ký tự đầu của ký hiệu chính là mẫu số (1 = GTGT, 2 = bán hàng) khi không cấu hình riêng.
    InvTemplateNo: (draft.invTemplateNo || "").trim() || invSeries.charAt(0),
    InvDate: vietnamDateString(draft.invoiceDate),
    CurrencyCode: "VND",
    ExchangeRate: 1,
    PaymentMethodName: (draft.paymentMethodName || "").trim() || "TM/CK",
    IsInvoiceSummary: false,
    // Có email người mua thì MISA tự gửi hóa đơn tới đúng địa chỉ đó sau khi phát hành.
    IsSendEmail: Boolean(email),
    ReceiverName: email ? fullName : "",
    ReceiverEmail: email,
    BuyerCode: draft.buyer.code || "",
    BuyerFullName: fullName,
    // Tên đơn vị chỉ gửi khi có (hóa đơn có MST, hoặc đã nhập tay); mẫu đủ thông tin cá nhân thì bỏ hẳn trường này.
    ...(legalName ? { BuyerLegalName: legalName } : {}),
    BuyerTaxCode: taxCode,
    BuyerAddress: address,
    BuyerEmail: email,
    BuyerPhoneNumber: (draft.buyer.phone || "").trim(),
    BuyerIDNumber: idNumber,
    // Tài liệu MISA còn một trường "Căn cước công dân" riêng; gửi cùng giá trị để mẫu nào cũng in được.
    AccountObjectIdentificationNumber: idNumber,
    TotalSaleAmountOC: withoutVat,
    TotalSaleAmount: withoutVat,
    TotalDiscountAmountOC: 0,
    TotalDiscountAmount: 0,
    TotalAmountWithoutVATOC: withoutVat,
    TotalAmountWithoutVAT: withoutVat,
    TotalVATAmountOC: vatAmount,
    TotalVATAmount: vatAmount,
    TotalAmountOC: amount,
    TotalAmount: amount,
    // TotalAmountInWords bỏ trống: theo tài liệu MISA sẽ tự đọc số tiền bằng chữ theo quy định.
    OptionUserDefined: {
      MainCurrency: "VND",
      QuantityDecimalDigits: "0",
      UnitPriceOCDecimalDigits: "0",
      UnitPriceDecimalDigits: "0",
      AmountOCDecimalDigits: "0",
      AmountDecimalDigits: "0",
      CoefficientDecimalDigits: "2",
      ExchangRateDecimalDigits: "0",
    },
    OriginalInvoiceDetail: [{
      ItemType: 1,
      SortOrder: 1,
      LineNumber: 1,
      ItemName: draft.itemName.trim().slice(0, 500) || "Học phí",
      UnitName: draft.unitName || "Khóa",
      Quantity: 1,
      UnitPrice: withoutVat,
      AmountOC: withoutVat,
      Amount: withoutVat,
      DiscountRate: 0,
      DiscountAmountOC: 0,
      DiscountAmount: 0,
      AmountWithoutVATOC: withoutVat,
      AmountWithoutVAT: withoutVat,
      VATRateName: vat.name,
      VATAmountOC: vatAmount,
      VATAmount: vatAmount,
    }],
    TaxRateInfo: [{ VATRateName: vat.name, AmountWithoutVATOC: withoutVat, VATAmountOC: vatAmount }],
  };
  return { ok: true, data };
}
