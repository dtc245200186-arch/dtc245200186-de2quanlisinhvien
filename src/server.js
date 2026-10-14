require('dotenv').config({ override: true });
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mysql = require('mysql2/promise');
const prom = require('prom-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 3000);
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || '';
const sessionSecret = process.env.SESSION_SECRET;
const sessionCookie = 'educore_session';
const sessionTtlSeconds = Number(process.env.SESSION_TTL_SECONDS || 4 * 60 * 60);
const sessions = new Map();
const passwordHashParts = adminPasswordHash.split(':');
if (passwordHashParts.length !== 3 || passwordHashParts[0] !== 'scrypt' || !/^[a-f0-9]{32,}$/.test(passwordHashParts[1]) || !/^[a-f0-9]{128}$/.test(passwordHashParts[2]) || !sessionSecret || sessionSecret.length < 32 || !Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 1) {
  throw new Error('ADMIN_PASSWORD_HASH (scrypt:salt:hash) and SESSION_SECRET (at least 32 characters) must be configured.');
}

const logPath = process.env.LOG_FILE || '';
let logStream;
if (logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
}
function log(entry) {
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n';
  process.stdout.write(line);
  if (logStream) logStream.write(line);
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'qlsv',
    user: process.env.DB_USER || 'qlsv_app',
    password: process.env.DB_PASSWORD,
    enableKeepAlive: true,
    charset: 'utf8mb4'
});

const register = new prom.Registry();

prom.collectDefaultMetrics({ register });

const requests = new prom.Counter({
  name: 'http_requests_total',
  help: 'HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const duration = new prom.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 3],
  registers: [register]
});

const studentsGauge = new prom.Gauge({
  name: 'qlsv_students_total',
  help: 'Number of students',
  registers: [register]
});

const dbReady = new prom.Gauge({
  name: 'qlsv_database_ready',
  help: 'Database readiness',
  registers: [register]
});
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function makeSession(username) {
  for (const [token, session] of sessions) if (session.expiresAt <= Date.now()) sessions.delete(token);
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { username, expiresAt: Date.now() + sessionTtlSeconds * 1000 });
  return token;
}
function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.username === adminUser ? session : null;
}
function requireAdmin(req, res, next) {
  res.set('Cache-Control', 'no-store, private');
  const session = readSession(req.cookies[sessionCookie]);
  if (!session) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Cần đăng nhập.' });
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  req.admin = { username: session.username };
  next();
}
function validateId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function cleanText(value, max, required = true) {
  const text = String(value ?? '').trim();
  if ((!text && required) || text.length > max) return null;
  return text || null;
}
function validEmail(value) { return !value || /^\S+@\S+\.\S+$/.test(value); }
function apiError(res, status, message) { return res.status(status).json({ error: message }); }

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/login' || req.path === '/logout' || req.path === '/dashboard' || req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store, private');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));
app.use((req, res, next) => {
  const end = duration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path || (req.path.startsWith('/api/students') ? '/api/students/:id' : req.path);
    requests.inc({ method: req.method, route, status: String(res.statusCode) });
    end({ method: req.method, route, status: String(res.statusCode) });
    log({ level: res.statusCode >= 500 ? 'error' : 'info', method: req.method, path: req.path, status: res.statusCode, actor: req.admin?.username || 'anonymous' });
  });
  next();
});

async function initialize() {
  await pool.query(`CREATE TABLE IF NOT EXISTS classes (
    id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL, major VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY, student_code VARCHAR(30) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL, email VARCHAR(190), date_of_birth DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'studying', class_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS grades (
    id INT AUTO_INCREMENT PRIMARY KEY, student_id INT NOT NULL,
    subject VARCHAR(120) NOT NULL, semester TINYINT NOT NULL DEFAULT 1,
    score DECIMAL(4,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_score CHECK (score >= 0 AND score <= 10),
    CONSTRAINT fk_grade_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [majorColumn] = await pool.query("SHOW COLUMNS FROM classes LIKE 'major'");
  if (!majorColumn.length) await pool.query("ALTER TABLE classes ADD COLUMN major VARCHAR(120) NOT NULL DEFAULT '' AFTER name");
  const [statusColumn] = await pool.query("SHOW COLUMNS FROM students LIKE 'status'");
  if (!statusColumn.length) await pool.query("ALTER TABLE students ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'studying' AFTER date_of_birth");
  const [semesterColumn] = await pool.query("SHOW COLUMNS FROM grades LIKE 'semester'");
  if (!semesterColumn.length) await pool.query("ALTER TABLE grades ADD COLUMN semester TINYINT NOT NULL DEFAULT 1 AFTER subject");
  await pool.query("INSERT IGNORE INTO classes (code,name,major) VALUES ('CNTT01','Công nghệ thông tin 01','Công nghệ phần mềm'),('QTKD01','Quản trị kinh doanh 01','Quản trị kinh doanh')");
  await pool.query("UPDATE classes SET major='Công nghệ phần mềm' WHERE code='CNTT01' AND major=''");
  await refreshStudentGauge();
}
async function refreshStudentGauge() {
  try { const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM students'); studentsGauge.set(row.total); dbReady.set(1); }
  catch (error) { dbReady.set(0); throw error; }
}
async function listStudents({ q = '', classId = '', status = '' } = {}) {
  const clauses = [], values = [];
  if (q) { clauses.push('(s.full_name LIKE ? OR s.student_code LIKE ? OR s.email LIKE ?)'); values.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (classId && validateId(classId)) { clauses.push('s.class_id=?'); values.push(validateId(classId)); }
  if (['studying', 'reserved'].includes(status)) { clauses.push('s.status=?'); values.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.execute(`SELECT s.id,s.student_code,s.full_name,s.email,s.date_of_birth,s.status,s.class_id,c.name AS class_name,c.major,COALESCE(ROUND(AVG(g.score),2),0) AS average_score,COUNT(g.id) AS grade_count FROM students s LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN grades g ON g.student_id=s.id ${where} GROUP BY s.id,c.id ORDER BY s.id DESC`, values);
  return rows;
}
async function getOverview() {
  const [[counts]] = await pool.query(`SELECT (SELECT COUNT(*) FROM students) AS student_count,(SELECT COUNT(*) FROM classes) AS class_count,(SELECT ROUND(AVG(score),2) FROM grades) AS average_score,(SELECT COUNT(*) FROM students WHERE status='reserved') AS reserved_count`);
  const [recent] = await pool.query('SELECT id,student_code,full_name,created_at FROM students ORDER BY id DESC LIMIT 5');
  await refreshStudentGauge();
  return { ...counts, recent };
}

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { dbReady.set(0); res.status(503).json({ status: 'unavailable' }); }
});
app.get('/metrics', async (_req, res) => { await refreshStudentGauge().catch(() => {}); res.set('Content-Type', register.contentType); res.end(await register.metrics()); });
app.get('/login', (req, res) => {
  if (readSession(req.cookies[sessionCookie])) return res.redirect('/dashboard');
  res.set('Cache-Control', 'no-store');
  res.render('login', { error: '', next: typeof req.query.next === 'string' && req.query.next.startsWith('/') && !req.query.next.startsWith('//') ? req.query.next : '/dashboard' });
});
app.post('/login', rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  const next = typeof req.body.next === 'string' && req.body.next.startsWith('/') && !req.body.next.startsWith('//') ? req.body.next : '/dashboard';
  const [, salt, expectedHash] = passwordHashParts;
  const suppliedHash = crypto.scryptSync(String(req.body.password || ''), salt, 64).toString('hex');
  if (!safeEqual(req.body.username || '', adminUser) || !safeEqual(suppliedHash, expectedHash)) {
    log({ level: 'warn', event: 'login_failed', ip: req.ip });
    res.status(401).set('Cache-Control', 'no-store').render('login', { error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.', next });
    return;
  }
  res.cookie(sessionCookie, makeSession(adminUser), { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', maxAge: sessionTtlSeconds * 1000, path: '/' });
  log({ level: 'info', event: 'login_success', actor: adminUser });
  res.redirect(next);
});
app.post('/logout', requireAdmin, (req, res) => {
  sessions.delete(req.cookies[sessionCookie]);
  res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/' });
  log({ level: 'info', event: 'logout', actor: req.admin.username });
  res.redirect('/login');
});
app.get('/', (req, res) => {
  if (!readSession(req.cookies[sessionCookie])) return res.redirect(`/login?next=${encodeURIComponent('/dashboard')}`);
  return res.redirect('/dashboard');
});
app.get('/dashboard', requireAdmin, (_req, res) => res.render('index', { title: 'Tổng quan', adminUser }));

app.get('/api/auth/me', requireAdmin, (req, res) => res.json({ username: req.admin.username }));
app.get('/api/overview', requireAdmin, async (_req, res, next) => { try { res.json(await getOverview()); } catch (error) { next(error); } });
app.get('/api/students', requireAdmin, async (req, res, next) => {
  try { res.json({ items: await listStudents({ q: cleanText(req.query.q, 120, false) || '', classId: req.query.class_id || '', status: req.query.status || '' }) }); }
  catch (error) { next(error); }
});
app.post('/api/students', requireAdmin, async (req, res, next) => {
  const studentCode = cleanText(req.body.student_code, 30), fullName = cleanText(req.body.full_name, 120);
  const email = cleanText(req.body.email, 190, false), dob = cleanText(req.body.date_of_birth, 10, false);
  const classId = req.body.class_id ? validateId(req.body.class_id) : null;
  const status = ['studying', 'reserved'].includes(req.body.status) ? req.body.status : 'studying';
  if (!studentCode || !fullName || (req.body.class_id && !classId) || (email && !validEmail(email))) return apiError(res, 400, 'Vui lòng kiểm tra thông tin sinh viên.');
  try {
    const [result] = await pool.execute('INSERT INTO students (student_code,full_name,email,date_of_birth,class_id,status) VALUES (?,?,?,?,?,?)', [studentCode,fullName,email,dob,classId,status]);
    await refreshStudentGauge(); res.status(201).json({ id: result.insertId, message: 'Đã thêm sinh viên.' });
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return apiError(res, 409, 'Mã sinh viên đã tồn tại.'); next(error); }
});
app.patch('/api/students/:id', requireAdmin, async (req, res, next) => {
  const id = validateId(req.params.id), studentCode = cleanText(req.body.student_code, 30), fullName = cleanText(req.body.full_name, 120);
  const email = cleanText(req.body.email, 190, false), dob = cleanText(req.body.date_of_birth, 10, false);
  const classId = req.body.class_id ? validateId(req.body.class_id) : null;
  const status = ['studying', 'reserved'].includes(req.body.status) ? req.body.status : null;
  if (!id || !studentCode || !fullName || !status || (req.body.class_id && !classId) || (email && !validEmail(email))) return apiError(res, 400, 'Vui lòng kiểm tra thông tin sinh viên.');
  try {
    const [result] = await pool.execute('UPDATE students SET student_code=?,full_name=?,email=?,date_of_birth=?,class_id=?,status=? WHERE id=?', [studentCode,fullName,email,dob,classId,status,id]);
    if (!result.affectedRows) return apiError(res, 404, 'Không tìm thấy sinh viên.');
    await refreshStudentGauge(); res.json({ message: 'Đã cập nhật sinh viên.' });
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return apiError(res, 409, 'Mã sinh viên đã tồn tại.'); next(error); }
});
app.delete('/api/students/:id', requireAdmin, async (req, res, next) => {
  const id = validateId(req.params.id); if (!id) return apiError(res, 400, 'ID không hợp lệ.');
  try { await pool.execute('DELETE FROM students WHERE id=?', [id]); await refreshStudentGauge(); res.json({ message: 'Đã xóa sinh viên.' }); } catch (error) { next(error); }
});

app.get('/api/classes', requireAdmin, async (_req, res, next) => {
  try { const [items] = await pool.query('SELECT c.id,c.code,c.name,c.major,COUNT(DISTINCT s.id) AS student_count FROM classes c LEFT JOIN students s ON s.class_id=c.id GROUP BY c.id ORDER BY c.name'); res.json({ items }); }
  catch (error) { next(error); }
});
app.post('/api/classes', requireAdmin, async (req, res, next) => {
  const code = cleanText(req.body.code, 30), name = cleanText(req.body.name, 120), major = cleanText(req.body.major, 120, false) || '';
  if (!code || !name) return apiError(res, 400, 'Mã lớp và tên lớp là bắt buộc.');
  try { const [result] = await pool.execute('INSERT INTO classes (code,name,major) VALUES (?,?,?)', [code,name,major]); res.status(201).json({ id: result.insertId, message: 'Đã tạo lớp.' }); }
  catch (error) { if (error.code === 'ER_DUP_ENTRY') return apiError(res, 409, 'Mã lớp đã tồn tại.'); next(error); }
});
app.patch('/api/classes/:id', requireAdmin, async (req, res, next) => {
  const id = validateId(req.params.id), code = cleanText(req.body.code, 30), name = cleanText(req.body.name, 120), major = cleanText(req.body.major, 120, false) || '';
  if (!id || !code || !name) return apiError(res, 400, 'Thông tin lớp không hợp lệ.');
  try { const [result] = await pool.execute('UPDATE classes SET code=?,name=?,major=? WHERE id=?', [code,name,major,id]); if (!result.affectedRows) return apiError(res, 404, 'Không tìm thấy lớp.'); res.json({ message: 'Đã cập nhật lớp.' }); }
  catch (error) { if (error.code === 'ER_DUP_ENTRY') return apiError(res, 409, 'Mã lớp đã tồn tại.'); next(error); }
});
app.delete('/api/classes/:id', requireAdmin, async (req, res, next) => {
  const id = validateId(req.params.id); if (!id) return apiError(res, 400, 'ID không hợp lệ.');
  try { await pool.execute('DELETE FROM classes WHERE id=?', [id]); res.json({ message: 'Đã xóa lớp.' }); } catch (error) { next(error); }
});

app.get('/api/grades', requireAdmin, async (req, res, next) => {
  const semesterFilter = String(req.query.semester || '1');
  if (!['1', '2', 'all'].includes(semesterFilter)) return apiError(res, 400, 'Học kỳ phải là 1, 2 hoặc all.');
  try {
    const where = semesterFilter === 'all' ? '' : ' WHERE g.semester=?';
    const listQuery = semesterFilter === 'all'
      ? pool.query('SELECT g.id,g.subject,g.semester,g.score,g.student_id,s.student_code,s.full_name FROM grades g JOIN students s ON s.id=g.student_id ORDER BY g.semester,g.id DESC')
      : pool.execute(`SELECT g.id,g.subject,g.semester,g.score,g.student_id,s.student_code,s.full_name FROM grades g JOIN students s ON s.id=g.student_id${where} ORDER BY g.semester,g.id DESC`, [Number(semesterFilter)]);
    const [[items], [semesters]] = await Promise.all([
      listQuery,
      pool.query('SELECT semester,COUNT(*) AS total,ROUND(AVG(score),2) AS average,COUNT(DISTINCT student_id) AS students FROM grades GROUP BY semester ORDER BY semester')
    ]);
    res.json({ items, semesters, semester: semesterFilter });
  }
  catch (error) { next(error); }
});
app.post('/api/grades', requireAdmin, async (req, res, next) => {
  const studentId = validateId(req.body.student_id), subject = cleanText(req.body.subject, 120), score = Number(req.body.score);
  const semester = Number(req.body.semester);
  if (!studentId || !subject || ![1, 2].includes(semester) || !Number.isFinite(score) || score < 0 || score > 10) return apiError(res, 400, 'Chọn học kỳ 1 hoặc 2; điểm phải từ 0 đến 10.');
  try { const [result] = await pool.execute('INSERT INTO grades (student_id,subject,semester,score) VALUES (?,?,?,?)', [studentId,subject,semester,score]); res.status(201).json({ id: result.insertId, message: `Đã ghi điểm học kỳ ${semester}.` }); }
  catch (error) { if (error.code === 'ER_NO_REFERENCED_ROW_2') return apiError(res, 400, 'Sinh viên được chọn không tồn tại.'); next(error); }
});
app.patch('/api/grades/:id', requireAdmin, async (req, res, next) => {
  const id = validateId(req.params.id), studentId = validateId(req.body.student_id), subject = cleanText(req.body.subject, 120), score = Number(req.body.score);
  const semester = Number(req.body.semester);
  if (!id || !studentId || !subject || ![1, 2].includes(semester) || !Number.isFinite(score) || score < 0 || score > 10) return apiError(res, 400, 'Chọn học kỳ 1 hoặc 2; điểm phải từ 0 đến 10.');
  try { const [result] = await pool.execute('UPDATE grades SET student_id=?,subject=?,semester=?,score=? WHERE id=?', [studentId,subject,semester,score,id]); if (!result.affectedRows) return apiError(res, 404, 'Không tìm thấy điểm.'); res.json({ message: `Đã cập nhật điểm học kỳ ${semester}.` }); }
  catch (error) { if (error.code === 'ER_NO_REFERENCED_ROW_2') return apiError(res, 400, 'Sinh viên được chọn không tồn tại.'); next(error); }
});
app.delete('/api/grades/:id', requireAdmin, async (req, res, next) => {
  const id = validateId(req.params.id); if (!id) return apiError(res, 400, 'ID không hợp lệ.');
  try { await pool.execute('DELETE FROM grades WHERE id=?', [id]); res.json({ message: 'Đã xóa điểm.' }); } catch (error) { next(error); }
});

app.get('/api/reports/grades', requireAdmin, async (_req, res, next) => {
  try { const [items] = await pool.query("SELECT semester,CASE WHEN score>=8.5 THEN 'Gioi' WHEN score>=7 THEN 'Kha' WHEN score>=5 THEN 'Trung binh' ELSE 'Can cai thien' END AS band,COUNT(*) AS total FROM grades GROUP BY semester,band ORDER BY semester,band"); res.json({ items }); }
  catch (error) { next(error); }
});
app.get('/api/system', requireAdmin, async (_req, res, next) => {
  try { const [[row]] = await pool.query('SELECT VERSION() AS database_version'); res.json({ app: 'EduCore Manager', status: 'operational', database: 'connected', database_version: row.database_version, uptime_seconds: Math.floor(process.uptime()) }); }
  catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  log({ level: 'error', error: error.code || error.message });
  if (res.headersSent) return;
  res.status(500).json({ error: 'Có lỗi máy chủ. Vui lòng thử lại.' });
});

initialize().then(() => app.listen(port, '0.0.0.0', () => log({ level: 'info', message: `EduCore Manager listening on ${port}` }))).catch((error) => { log({ level: 'error', error: error.message }); process.exit(1); });
