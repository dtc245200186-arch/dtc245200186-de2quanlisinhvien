-- EduCore Manager sample data. Safe to re-run; existing rows are updated by
-- their unique class code or student code, and old grade data is preserved.
USE qlsv;

INSERT INTO classes (code, name, major)
VALUES
  ('ANMAG',     'An Ninh Mạng',                        'An Ninh Mạng'),
  ('CNTT01',    'Công nghệ thông tin 01',              'Công nghệ phần mềm'),
  ('CNTrTK23B', 'Công Nghệ Truyền Thông',              'Công Nghệ Truyền Thông'),
  ('SNATR',     'Ngôn Ngữ Anh',                        'ngôn ngữ'),
  ('QTKD',      'Quản trị kinh doanh',                 'Quản Trị Kinh Doanh'),
  ('QTKD01',    'Quản trị kinh doanh 01',              'Quản trị kinh doanh')
AS incoming
ON DUPLICATE KEY UPDATE
  name = incoming.name,
  major = incoming.major;

INSERT INTO students (student_code, full_name, email, class_id, status)
SELECT sample.student_code, sample.full_name, sample.email, classes.id, sample.status
FROM (
  SELECT 'DTC245200567' AS student_code, 'Bùi Văn An' AS full_name,
         'dtc245200567@educore.edu.vn' AS email, 'QTKD01' AS class_code,
         'reserved' AS status
  UNION ALL
  SELECT 'DTC245200006', 'Trần Thị Lực',
         'dtc245200006@educore.edu.vn', 'CNTrTK23B', 'studying'
  UNION ALL
  SELECT 'DTC245200199', 'Nguyễn Ngọc Anh',
         'dtc245200199@educor.edu.vn', 'CNTT01', 'studying'
  UNION ALL
  SELECT 'DTC245200186', 'Phạm Thị Bích Ngọc',
         'dtc245200186@educore.edu.vn', 'QTKD01', 'studying'
) AS sample
JOIN classes ON classes.code = sample.class_code
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  email = VALUES(email),
  class_id = VALUES(class_id),
  status = VALUES(status);

-- GPA is calculated by the application from grades. On a clean database this
-- single score makes DTC245200186's GPA 8.30; other sample students have 0.00.
-- Do not delete existing grades when re-running this seed script.
INSERT INTO grades (student_id, subject, semester, score)
SELECT students.id, 'Điểm mẫu', 1, 8.30
FROM students
WHERE students.student_code = 'DTC245200186'
  AND NOT EXISTS (
    SELECT 1 FROM grades
    WHERE grades.student_id = students.id
      AND grades.subject = 'Điểm mẫu'
      AND grades.semester = 1
  );
