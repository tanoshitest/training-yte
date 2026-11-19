import assert from "node:assert/strict";
import test from "node:test";

import { buildVietQrPayload, crc16Ccitt, OFFICIAL_STEPS_VIETQR, vietQrSvg } from "../cloudflare/vietqr";

test("static STEPS QR matches the official QRcodebank.jpg payload", () => {
  assert.equal(buildVietQrPayload({
    bankId: "970418",
    accountNumber: "868683888",
  }), OFFICIAL_STEPS_VIETQR);
  assert.equal(OFFICIAL_STEPS_VIETQR.slice(-4), crc16Ccitt(OFFICIAL_STEPS_VIETQR.slice(0, -4)));
});

test("VietQR payload uses the class transfer content so banks can autofill it", () => {
  const payload = buildVietQrPayload({
    bankId: "970418",
    accountNumber: "868683888",
    accountName: "CONG TY TNHH DAU TU GIAO DUC STEPS",
    amount: 480000,
    addInfo: "HPS1202609",
  });
  assert.match(payload, /^00020101021238/);
  assert.match(payload, /01108686838888/);
  assert.match(payload, /08(?:10|11)HPS1202609/);
  assert.match(payload, /5406480000/);
  assert.doesNotMatch(payload, /CONG TY/);
  assert.match(payload, /6304[0-9A-F]{4}$/);
  const withoutCrc = payload.slice(0, -4);
  assert.equal(payload.slice(-4), crc16Ccitt(withoutCrc));
  assert.match(vietQrSvg({
    bankId: "970418",
    accountNumber: "868683888",
    addInfo: "HPS1202609",
    amount: 480000,
  }), /<svg /);
});
