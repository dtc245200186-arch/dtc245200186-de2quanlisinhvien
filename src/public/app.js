(() => {
  const state = { students: [], classes: [], grades: [], gradeSummary: [], semesterFilter: '1', page: 1, pageSize: 8, activeView: 'overview' };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(-2).map((part) => part[0]?.toLocaleUpperCase('vi-VN') || '').join('');
  const dateText = (value) => value ? new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value ?? '—'; };
  function toast(message, error = false) {
    const element = $('#toast'); element.textContent = message; element.classList.toggle('error', error); element.classList.remove('hidden');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.add('hidden'), 3200);
  }
  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    if (response.status === 401) { window.location.assign(`/login?next=${encodeURIComponent(location.pathname)}`); throw new Error('Phiên đăng nhập đã hết hạn.'); }
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Không thể hoàn thành thao tác.');
    return payload;
  }
  function initialsColor(id) { return ['avatar-blue', 'avatar-violet', 'avatar-peach', 'avatar-teal'][Number(id) % 4]; }
  function setView(view) {
    if (!$('#view-' + view)) return;
    state.activeView = view;
    $$('.page-view').forEach((section) => section.classList.toggle('hidden', section.id !== `view-${view}`));
    $$('.nav-link[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    const nav = $(`.nav-link[data-view="${view}"]`);
    setText('#breadcrumb-current', nav?.querySelector('span:nth-child(2)')?.textContent || (view === 'overview' ? 'Tổng quan' : view));
    $('#account-menu').classList.remove('open'); $('#sidebar').classList.remove('open');
    if (view === 'reports') loadReports();
    if (view === 'settings') loadSystem();
    if (view === 'classes') renderClasses();
    if (view === 'grades') renderGrades();
  }
  function statusBadge(status) {
    return status === 'reserved' ? '<span class="badge badge-reserved">Bảo lưu</span>' : '<span class="badge badge-study">Đang học</span>';
  }
  function renderStudentRows() {
    const query = ($('#student-search').value || '').toLocaleLowerCase('vi');
    const classId = $('#student-class-filter').value;
    const status = $('#student-status-filter').value;
    const filtered = state.students.filter((student) => {
      const searchable = `${student.full_name} ${student.student_code} ${student.email || ''}`.toLocaleLowerCase('vi');
      return (!query || searchable.includes(query)) && (!classId || String(student.class_id || '') === classId) && (!status || student.status === status);
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);
    const body = $('#students-body');
    body.innerHTML = pageRows.length ? pageRows.map((student) => {
      const score = Math.max(0, Math.min(10, Number(student.average_score || 0)));
      const email = student.email || 'Chưa cập nhật email';
      return `<tr><td class="check-col"><input class="student-check" type="checkbox" value="${student.id}" aria-label="Chọn ${escapeHtml(student.full_name)}"></td><td><div class="person-cell"><span class="avatar avatar-student ${initialsColor(student.id)}">${escapeHtml(initials(student.full_name))}</span><span><strong>${escapeHtml(student.full_name)}</strong><small>${escapeHtml(email)}</small></span></div></td><td class="code-cell">${escapeHtml(student.student_code)}</td><td><div class="class-cell"><strong>${escapeHtml(student.class_name || 'Chưa xếp lớp')}</strong><small>${escapeHtml(student.major || '—')}</small></div></td><td><div class="grade-meter"><div><i style="width:${score * 10}%"></i></div><strong>${score.toFixed(1)}</strong></div></td><td>${statusBadge(student.status)}</td><td><div class="row-actions"><button data-action="edit-student" data-id="${student.id}" aria-label="Sửa hồ sơ">✎</button><button class="delete" data-action="delete-student" data-id="${student.id}" aria-label="Xóa hồ sơ">⌫</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="loading-cell">Không tìm thấy sinh viên phù hợp.</td></tr>';
    setText('#student-range', filtered.length ? `Hiển thị ${start + 1}–${Math.min(start + state.pageSize, filtered.length)} trong ${filtered.length} sinh viên` : 'Không có sinh viên');
    setText('#page-label', `${state.page} / ${totalPages}`);
    $('#page-prev').disabled = state.page <= 1; $('#page-next').disabled = state.page >= totalPages;
    $('#select-all').checked = false;
    setText('#student-total', state.students.length);
    setText('#student-active', state.students.filter((student) => student.status === 'studying').length);
    setText('#student-reserved', state.students.filter((student) => student.status === 'reserved').length);
    setText('#nav-student-count', state.students.length);
  }
  function renderClassFilter() {
    const select = $('#student-class-filter'); const current = select.value;
    select.innerHTML = '<option value="">Tất cả lớp học</option>' + state.classes.map((item) => `<option value="${item.id}">${escapeHtml(item.code)} · ${escapeHtml(item.name)}</option>`).join('');
    select.value = state.classes.some((item) => String(item.id) === current) ? current : '';
  }
  function renderClasses() {
    const grid = $('#classes-grid');
    if (!state.classes.length) { grid.innerHTML = '<div class="surface loading-cell">Chưa có lớp học. Hãy tạo lớp đầu tiên.</div>'; return; }
    grid.innerHTML = state.classes.map((item) => `<article class="class-card"><div class="class-card-top"><span class="class-symbol">▦</span><div class="row-actions"><button data-action="edit-class" data-id="${item.id}" aria-label="Sửa lớp">✎</button><button class="delete" data-action="delete-class" data-id="${item.id}" aria-label="Xóa lớp">⌫</button></div></div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.major || 'Chưa gán chuyên ngành')}</p><div class="class-meta"><span>Mã lớp <strong>${escapeHtml(item.code)}</strong></span><span><strong>${Number(item.student_count || 0)}</strong> sinh viên</span></div></article>`).join('');
  }
  function gradeBand(score) {
    if (score >= 8.5) return 'Giỏi'; if (score >= 7) return 'Khá'; if (score >= 5) return 'Trung bình'; return 'Cần cải thiện';
  }
  function renderGrades() {
    const query = ($('#grade-search').value || '').toLocaleLowerCase('vi');
    const filtered = state.grades.filter((grade) => `${grade.full_name} ${grade.student_code} ${grade.subject}`.toLocaleLowerCase('vi').includes(query));
    const emptyMessage = state.grades.length
      ? 'Không tìm thấy điểm phù hợp với từ khóa.'
      : `Chưa có điểm ở ${state.semesterFilter === 'all' ? 'các học kỳ' : `Học kỳ ${state.semesterFilter}`}. Hãy nhập điểm và chọn đúng học kỳ.`;
    $('#grades-body').innerHTML = filtered.length ? filtered.map((grade) => `<tr><td><div class="person-cell"><span class="avatar avatar-student ${initialsColor(grade.student_id)}">${escapeHtml(initials(grade.full_name))}</span><span><strong>${escapeHtml(grade.full_name)}</strong><small>${escapeHtml(grade.student_code)}</small></span></div></td><td>${escapeHtml(grade.subject)}</td><td><span class="term-chip term-${grade.semester}">Học kỳ ${Number(grade.semester)}</span></td><td class="grade-score">${Number(grade.score).toFixed(2)}</td><td class="grade-band">${gradeBand(Number(grade.score))}</td><td><div class="row-actions"><button data-action="edit-grade" data-id="${grade.id}" aria-label="Sửa điểm">✎</button><button class="delete" data-action="delete-grade" data-id="${grade.id}" aria-label="Xóa điểm">⌫</button></div></td></tr>`).join('') : `<tr><td colspan="6" class="loading-cell"><div class="grade-empty"><span>${escapeHtml(emptyMessage)}</span>${state.grades.length ? '' : '<button class="button button-primary" data-action="add-grade">＋ Nhập điểm cho kỳ này</button>'}</div></td></tr>`;
    const summaryFor = (semester) => state.gradeSummary.find((item) => Number(item.semester) === semester) || { total: 0, average: null };
    for (const semester of [1, 2]) {
      const summary = summaryFor(semester);
      setText(`#semester-${semester === 1 ? 'one' : 'two'}-average`, summary.average === null ? '—' : Number(summary.average).toFixed(2));
      setText(`#semester-${semester === 1 ? 'one' : 'two'}-count`, `${Number(summary.total)} đầu điểm`);
    }
    $$('.semester-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.semester === state.semesterFilter));
    $$('.semester-card').forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.semester === state.semesterFilter)));
    setText('#grade-range', `${filtered.length} đầu điểm · ${state.semesterFilter === 'all' ? 'tất cả học kỳ' : `học kỳ ${state.semesterFilter}`}`);
  }
  function renderRecent(items) {
    $('#recent-students').innerHTML = items.length ? items.map((item) => `<tr><td><div class="person-cell"><span class="avatar avatar-student ${initialsColor(item.id)}">${escapeHtml(initials(item.full_name))}</span><span><strong>${escapeHtml(item.full_name)}</strong><small>Hồ sơ sinh viên</small></span></div></td><td class="code-cell">${escapeHtml(item.student_code)}</td><td>${dateText(item.created_at)}</td><td>${statusBadge(state.students.find((student) => student.id === item.id)?.status)}</td></tr>`).join('') : '<tr><td colspan="4" class="loading-cell">Chưa có hồ sơ sinh viên.</td></tr>';
  }
  async function loadOverview() {
    const data = await api('/api/overview');
    setText('#stat-students', data.student_count); setText('#stat-classes', data.class_count);
    setText('#stat-average', data.average_score === null ? '—' : Number(data.average_score).toFixed(2)); setText('#stat-reserved', data.reserved_count);
    renderRecent(data.recent || []);
  }
  async function loadStudents() {
    const result = await api('/api/students'); state.students = result.items || [];
    renderClassFilter(); renderStudentRows(); renderClasses(); renderGrades();
  }
  async function loadClasses() { const result = await api('/api/classes'); state.classes = result.items || []; renderClassFilter(); renderStudentRows(); renderClasses(); }
  async function loadGrades() {
    const result = await api(`/api/grades?semester=${encodeURIComponent(state.semesterFilter)}`);
    state.grades = result.items || []; state.gradeSummary = result.semesters || []; renderGrades();
  }
  async function selectSemester(semester) {
    if (!['1', '2', 'all'].includes(semester) || semester === state.semesterFilter) return;
    state.semesterFilter = semester;
    state.grades = [];
    $('#grades-body').innerHTML = '<tr><td colspan="6" class="loading-cell">Đang tải điểm học kỳ…</td></tr>';
    try { await loadGrades(); }
    catch (error) { toast(error.message, true); }
  }
  async function loadReports() {
    try {
      const result = await api('/api/reports/grades'); const items = result.items || [];
      const names = { Gioi: 'Giỏi · 8.5–10', Kha: 'Khá · 7.0–8.4', 'Trung binh': 'Trung bình · 5.0–6.9', 'Can cai thien': 'Cần cải thiện · dưới 5.0' };
      for (const semester of [1, 2]) {
        const container = $(`[data-report-semester="${semester}"]`);
        const semesterItems = items.filter((item) => Number(item.semester) === semester);
        const max = Math.max(1, ...semesterItems.map((item) => Number(item.total)));
        container.innerHTML = semesterItems.length ? semesterItems.map((item) => `<div class="distribution-row"><span>${names[item.band] || escapeHtml(item.band)}</span><div class="distribution-track"><i style="width:${Number(item.total) / max * 100}%"></i></div><strong>${Number(item.total)}</strong></div>`).join('') : '<div class="loading-cell">Chưa có điểm trong học kỳ này.</div>';
      }
      setText('#report-date', new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' }));
    } catch (error) { toast(error.message, true); }
  }
  async function loadSystem() {
    try {
      const info = await api('/api/system');
      $('#system-info').innerHTML = `<div class="system-item"><span>Ứng dụng</span><strong>${escapeHtml(info.app)} · ${escapeHtml(info.status)}</strong></div><div class="system-item"><span>Cơ sở dữ liệu</span><strong>${escapeHtml(info.database)} · MySQL ${escapeHtml(info.database_version)}</strong></div><div class="system-item"><span>Phiên quản trị</span><strong>${escapeHtml($('#account-button .account-copy small').textContent)}</strong></div><div class="system-item"><span>Thời gian hoạt động</span><strong>${Math.floor(info.uptime_seconds / 60)} phút</strong></div>`;
    } catch (error) { toast(error.message, true); }
  }
  function field(name, label, value = '', type = 'text', options = {}) {
    const required = options.required ? 'required' : '';
    const full = options.full ? ' full' : '';
    let control;
    if (options.choices) control = `<select name="${name}" ${required}>${options.choices.map((item) => `<option value="${escapeHtml(item.value)}" ${String(item.value) === String(value) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select>`;
    else control = `<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required} ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''} ${options.step ? `step="${options.step}"` : ''} ${options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ''}>`;
    return `<div class="field${full ? ' full' : ''}"><label>${label}</label>${control}</div>`;
  }
  function openModal(type, item = null) {
    const fields = $('#modal-fields'); const title = $('#modal-title'); const modal = $('#modal-backdrop');
    $('#editor-form').dataset.type = type; $('#editor-form').dataset.id = item?.id || '';
    if (type === 'student') {
      title.textContent = item ? 'Cập nhật sinh viên' : 'Thêm sinh viên';
      fields.innerHTML = field('student_code', 'Mã sinh viên', item?.student_code || '', 'text', { required: true }) + field('full_name', 'Họ và tên', item?.full_name || '', 'text', { required: true }) + field('email', 'Email', item?.email || '', 'email') + field('date_of_birth', 'Ngày sinh', item?.date_of_birth ? String(item.date_of_birth).slice(0, 10) : '', 'date') + field('class_id', 'Lớp học', item?.class_id || '', 'text', { choices: [{ value: '', label: 'Chưa xếp lớp' }, ...state.classes.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))] }) + field('status', 'Trạng thái', item?.status || 'studying', 'text', { choices: [{ value: 'studying', label: 'Đang học' }, { value: 'reserved', label: 'Bảo lưu' }] });
    } else if (type === 'class') {
      title.textContent = item ? 'Cập nhật lớp học' : 'Tạo lớp học';
      fields.innerHTML = field('code', 'Mã lớp', item?.code || '', 'text', { required: true }) + field('name', 'Tên lớp', item?.name || '', 'text', { required: true }) + field('major', 'Chuyên ngành', item?.major || '', 'text', { full: true, placeholder: 'Ví dụ: Công nghệ phần mềm' });
    } else {
      title.textContent = item ? 'Cập nhật điểm số' : 'Nhập điểm số';
      fields.innerHTML = field('student_id', 'Sinh viên', item?.student_id || '', 'text', { required: true, full: true, choices: state.students.map((s) => ({ value: s.id, label: `${s.student_code} · ${s.full_name}` })) }) + field('subject', 'Môn học', item?.subject || '', 'text', { required: true }) + field('semester', 'Học kỳ', item?.semester || (state.semesterFilter === '2' ? 2 : 1), 'text', { required: true, choices: [{ value: 1, label: 'Học kỳ 1' }, { value: 2, label: 'Học kỳ 2' }] }) + field('score', 'Điểm (0–10)', item?.score ?? '', 'number', { required: true, min: 0, max: 10, step: '0.01' });
    }
    modal.classList.remove('hidden'); document.body.classList.add('modal-open'); fields.querySelector('input,select')?.focus();
  }
  function closeModal() { $('#modal-backdrop').classList.add('hidden'); document.body.classList.remove('modal-open'); }
  async function saveModal(event) {
    event.preventDefault(); const form = event.currentTarget, type = form.dataset.type, id = form.dataset.id;
    const values = Object.fromEntries(new FormData(form).entries());
    if (values.class_id) values.class_id = Number(values.class_id); else if (type === 'student') values.class_id = null;
    if (values.student_id) values.student_id = Number(values.student_id);
    if (type === 'grade') { values.score = Number(values.score); values.semester = Number(values.semester); }
    const resource = type === 'student' ? 'students' : type === 'class' ? 'classes' : 'grades';
    try {
      const result = await api(`/api/${resource}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) });
      closeModal(); toast(result.message || 'Đã lưu thay đổi.'); await reloadAll();
    } catch (error) { toast(error.message, true); }
  }
  async function deleteItem(type, id) {
    const text = type === 'student' ? 'sinh viên' : type === 'class' ? 'lớp học' : 'đầu điểm';
    if (!window.confirm(`Bạn có chắc muốn xóa ${text} này?`)) return;
    const resource = type === 'student' ? 'students' : type === 'class' ? 'classes' : 'grades';
    try { const result = await api(`/api/${resource}/${id}`, { method: 'DELETE' }); toast(result.message); await reloadAll(); }
    catch (error) { toast(error.message, true); }
  }
  async function reloadAll() {
    try { await Promise.all([loadOverview(), loadStudents(), loadClasses(), loadGrades()]); }
    catch (error) { toast(error.message, true); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const date = new Date(); setText('#today-date', date.toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' }));
    setText('#today-weekday', date.toLocaleDateString('vi-VN', { weekday: 'long' }).toLocaleUpperCase('vi-VN'));
    setText('#report-date', date.toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' }));
    Promise.all([loadOverview(), loadStudents(), loadClasses(), loadGrades()]).catch((error) => toast(error.message, true));
    document.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-view]'); if (viewButton) { setView(viewButton.dataset.view); return; }
      const action = event.target.closest('[data-action]'); if (!action) return;
      const { action: name, id } = action.dataset;
      if (name === 'add-student') openModal('student');
      if (name === 'add-class') openModal('class');
      if (name === 'add-grade') openModal('grade');
      if (name === 'edit-student') openModal('student', state.students.find((item) => String(item.id) === id));
      if (name === 'edit-class') openModal('class', state.classes.find((item) => String(item.id) === id));
      if (name === 'edit-grade') openModal('grade', state.grades.find((item) => String(item.id) === id));
      if (name === 'delete-student') deleteItem('student', id);
      if (name === 'delete-class') deleteItem('class', id);
      if (name === 'delete-grade') deleteItem('grade', id);
    });
    $('#editor-form').addEventListener('submit', saveModal);
    $('#modal-close').addEventListener('click', closeModal); $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
    $('#student-search').addEventListener('input', () => { state.page = 1; renderStudentRows(); });
    $('#student-class-filter').addEventListener('change', () => { state.page = 1; renderStudentRows(); });
    $('#student-status-filter').addEventListener('change', () => { state.page = 1; renderStudentRows(); });
    $('#grade-search').addEventListener('input', renderGrades);
    $$('.semester-tab, .semester-card').forEach((control) => control.addEventListener('click', () => selectSemester(control.dataset.semester)));
    $$('.semester-card').forEach((card) => {
      card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSemester(card.dataset.semester); } });
    });
    $('#page-prev').addEventListener('click', () => { state.page = Math.max(1, state.page - 1); renderStudentRows(); });
    $('#page-next').addEventListener('click', () => { state.page += 1; renderStudentRows(); });
    $('#select-all').addEventListener('change', (event) => $$('.student-check').forEach((checkbox) => { checkbox.checked = event.target.checked; }));
    $('#refresh-students').addEventListener('click', reloadAll);
    $('#global-search').addEventListener('input', (event) => { if (event.target.value) { setView('students'); $('#student-search').value = event.target.value; renderStudentRows(); } });
    $('#account-button').addEventListener('click', () => $('#account-menu').classList.toggle('open'));
    $('#notification-button').addEventListener('click', () => toast('Không có thông báo mới.'));
    $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#global-search').focus(); } if (event.key === 'Escape') closeModal(); });
  });
})();
