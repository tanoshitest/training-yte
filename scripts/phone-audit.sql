WITH norm AS (
  SELECT 'students.phone' AS col, regexp_replace(phone,'[^0-9]','','g') AS dd FROM students WHERE btrim(phone)<>''
  UNION ALL SELECT 'students.parentZalo', regexp_replace("parentZalo",'[^0-9]','','g') FROM students WHERE btrim("parentZalo")<>''
  UNION ALL SELECT 'students.parentPhone1', regexp_replace("parentPhone1",'[^0-9]','','g') FROM students WHERE btrim("parentPhone1")<>''
  UNION ALL SELECT 'students.parentPhone2', regexp_replace("parentPhone2",'[^0-9]','','g') FROM students WHERE btrim("parentPhone2")<>''
  UNION ALL SELECT 'teachers.phone', regexp_replace(phone,'[^0-9]','','g') FROM teachers WHERE btrim(phone)<>''
  UNION ALL SELECT 'accountants.phone', regexp_replace(phone,'[^0-9]','','g') FROM accountants WHERE btrim(phone)<>''
  UNION ALL SELECT 'assistants.phone', regexp_replace(phone,'[^0-9]','','g') FROM assistants WHERE btrim(phone)<>''
)
SELECT col, count(*)::int AS filled,
  sum(CASE WHEN dd ~ '^0[0-9]{9}$' THEN 1 ELSE 0 END)::int AS chuan,
  sum(CASE WHEN dd ~ '^[1-9][0-9]{8}$' THEN 1 ELSE 0 END)::int AS mat_so_0,
  sum(CASE WHEN dd ~ '^84[0-9]{9}$' THEN 1 ELSE 0 END)::int AS dang_84,
  sum(CASE WHEN dd ~ '^0[0-9]{9}$' OR dd ~ '^[1-9][0-9]{8}$' OR dd ~ '^84[0-9]{9}$' THEN 0 ELSE 1 END)::int AS loi_khac
FROM norm GROUP BY col ORDER BY col;
