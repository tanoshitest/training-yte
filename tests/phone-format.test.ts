import assert from "node:assert/strict";
import test from "node:test";

import { toZaloPhone } from "../cloudflare/phone-format";

test("số dạng 0xxxxxxxxx chuẩn được chuyển sang 84xxxxxxxxx", () => {
  assert.equal(toZaloPhone("0912345678"), "84912345678");
  assert.equal(toZaloPhone("0398765432"), "84398765432");
});

test("số đã có +84 hoặc 84 đầu được nhận diện đúng", () => {
  assert.equal(toZaloPhone("+84912345678"), "84912345678");
  assert.equal(toZaloPhone("84912345678"), "84912345678");
});

test("số có khoảng trắng, chấm, gạch ngang được dọn sạch trước khi kiểm tra", () => {
  assert.equal(toZaloPhone("091 234 5678"), "84912345678");
  assert.equal(toZaloPhone("091.234.5678"), "84912345678");
  assert.equal(toZaloPhone("091-234-5678"), "84912345678");
  assert.equal(toZaloPhone("(091) 234 5678"), "84912345678");
});

test("chuỗi rỗng, số bàn, số nước ngoài hoặc rác đều trả null, không đoán", () => {
  assert.equal(toZaloPhone(""), null);
  assert.equal(toZaloPhone("02438261234"), null, "đầu số 024 là số bàn Hà Nội, không phải di động");
  assert.equal(toZaloPhone("123"), null);
  assert.equal(toZaloPhone("abc"), null);
  assert.equal(toZaloPhone("+1 415 555 0100"), null, "số nước ngoài không thuộc dải di động VN");
});

test("giá trị không phải chuỗi (null/undefined) không throw, trả null", () => {
  assert.equal(toZaloPhone(null as unknown as string), null);
  assert.equal(toZaloPhone(undefined as unknown as string), null);
});

test("thiếu số 0 đầu nhưng đủ 9 số và đúng đầu số di động vẫn nhận được", () => {
  assert.equal(toZaloPhone("912345678"), "84912345678");
});
