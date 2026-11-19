import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://portal-test:portal-test@localhost:5432/portal-test";

const consultation = import("../src/lib/public-consultation");

test("rejects incomplete website consultation payloads", async () => {
  const { ConsultationError, parseConsultationInput } = await consultation;

  assert.throws(
    () => parseConsultationInput({ name: "A", phone: "0901234567", age: "6-11", program: "ielts" }),
    (error) => error instanceof ConsultationError && error.status === 400,
  );
  assert.throws(
    () => parseConsultationInput({ name: "Nguyen Van A", phone: "12", age: "6-11", program: "ielts" }),
    (error) => error instanceof ConsultationError && error.status === 400,
  );
  assert.throws(
    () => parseConsultationInput({ name: "Nguyen Van A", phone: "0901234567", age: "teen", program: "ielts" }),
    (error) => error instanceof ConsultationError && error.status === 400,
  );
});

test("accepts a complete website consultation payload", async () => {
  const { parseConsultationInput } = await consultation;
  const input = parseConsultationInput({
    name: "Nguyễn Văn An",
    phone: "+84 901 234 567",
    age: "6-11",
    program: "cambridge-ket",
    locale: "en",
  });

  assert.equal(input.name, "Nguyễn Văn An");
  assert.equal(input.age, "6-11");
  assert.equal(input.program, "cambridge-ket");
  assert.equal(input.locale, "en");
});
