-- Sửa định dạng SĐT trên production: thêm số 0 đầu cho số 9 chữ số,
-- 84xxxxxxxxx -> 0xxxxxxxxx, bỏ ký tự phân tách khi phần số đã hợp lệ.
-- Giữ giá trị cũ trong phone_fix_backup_20260930 để truy vết/hoàn tác.

CREATE OR REPLACE FUNCTION _fix_phone(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN raw IS NULL OR btrim(raw) = '' THEN raw
    WHEN raw !~ '^[0-9 .()+-]+$' THEN raw
    WHEN regexp_replace(raw,'[^0-9]','','g') ~ '^[1-9][0-9]{8}$'
      THEN '0' || regexp_replace(raw,'[^0-9]','','g')
    WHEN regexp_replace(raw,'[^0-9]','','g') ~ '^84[0-9]{9}$'
      THEN '0' || substr(regexp_replace(raw,'[^0-9]','','g'), 3)
    WHEN regexp_replace(raw,'[^0-9]','','g') ~ '^0[0-9]{9}$'
      THEN regexp_replace(raw,'[^0-9]','','g')
    ELSE raw
  END
$$;

CREATE TABLE IF NOT EXISTS phone_fix_backup_20260930 (
  tbl text, col text, row_id text, old_value text, new_value text,
  fixed_at timestamptz DEFAULT now()
);

BEGIN;

INSERT INTO phone_fix_backup_20260930(tbl,col,row_id,old_value,new_value)
SELECT 'students','phone',id,phone,_fix_phone(phone) FROM students WHERE _fix_phone(phone) IS DISTINCT FROM phone;
UPDATE students SET phone = _fix_phone(phone) WHERE _fix_phone(phone) IS DISTINCT FROM phone;

INSERT INTO phone_fix_backup_20260930(tbl,col,row_id,old_value,new_value)
SELECT 'students','parentZalo',id,"parentZalo",_fix_phone("parentZalo") FROM students WHERE _fix_phone("parentZalo") IS DISTINCT FROM "parentZalo";
UPDATE students SET "parentZalo" = _fix_phone("parentZalo") WHERE _fix_phone("parentZalo") IS DISTINCT FROM "parentZalo";

INSERT INTO phone_fix_backup_20260930(tbl,col,row_id,old_value,new_value)
SELECT 'students','parentPhone1',id,"parentPhone1",_fix_phone("parentPhone1") FROM students WHERE _fix_phone("parentPhone1") IS DISTINCT FROM "parentPhone1";
UPDATE students SET "parentPhone1" = _fix_phone("parentPhone1") WHERE _fix_phone("parentPhone1") IS DISTINCT FROM "parentPhone1";

INSERT INTO phone_fix_backup_20260930(tbl,col,row_id,old_value,new_value)
SELECT 'students','parentPhone2',id,"parentPhone2",_fix_phone("parentPhone2") FROM students WHERE _fix_phone("parentPhone2") IS DISTINCT FROM "parentPhone2";
UPDATE students SET "parentPhone2" = _fix_phone("parentPhone2") WHERE _fix_phone("parentPhone2") IS DISTINCT FROM "parentPhone2";

INSERT INTO phone_fix_backup_20260930(tbl,col,row_id,old_value,new_value)
SELECT 'teachers','phone',id,phone,_fix_phone(phone) FROM teachers WHERE _fix_phone(phone) IS DISTINCT FROM phone;
UPDATE teachers SET phone = _fix_phone(phone) WHERE _fix_phone(phone) IS DISTINCT FROM phone;

INSERT INTO phone_fix_backup_20260930(tbl,col,row_id,old_value,new_value)
SELECT 'accountants','phone',id,phone,_fix_phone(phone) FROM accountants WHERE _fix_phone(phone) IS DISTINCT FROM phone;
UPDATE accountants SET phone = _fix_phone(phone) WHERE _fix_phone(phone) IS DISTINCT FROM phone;

INSERT INTO phone_fix_backup_20260930(tbl,col,row_id,old_value,new_value)
SELECT 'assistants','phone',id,phone,_fix_phone(phone) FROM assistants WHERE _fix_phone(phone) IS DISTINCT FROM phone;
UPDATE assistants SET phone = _fix_phone(phone) WHERE _fix_phone(phone) IS DISTINCT FROM phone;

INSERT INTO phone_fix_backup_20260930(tbl,col,row_id,old_value,new_value)
SELECT 'center_settings','phone',id,phone,_fix_phone(phone) FROM center_settings WHERE _fix_phone(phone) IS DISTINCT FROM phone;
UPDATE center_settings SET phone = _fix_phone(phone) WHERE _fix_phone(phone) IS DISTINCT FROM phone;

COMMIT;

SELECT tbl, col, count(*)::int AS da_sua FROM phone_fix_backup_20260930 GROUP BY tbl, col ORDER BY tbl, col;
