# Đề 2 — Hệ thống Quản lý Sinh viên

Bài tập lớn môn **Triển khai và Quản trị Hệ thống Phần mềm**. Stack: Node.js/Express, MySQL, Nginx, Prometheus, Grafana, Loki và Promtail; chạy bằng Docker Compose.

## Chức năng

- CRUD sinh viên, lớp và điểm; mã sinh viên/lớp duy nhất, điểm từ 0–10, phân tách Học kỳ 1 và Học kỳ 2.
- Quan hệ khóa ngoại: sinh viên thuộc lớp (xóa lớp thì sinh viên không thuộc lớp); xóa sinh viên sẽ xóa các điểm liên quan.
- Dashboard EduCore Manager: sidebar màu sắc, menu Tổng quan, Sinh viên, Lớp học, Điểm số, Báo cáo, Cài đặt và Trợ giúp; tìm kiếm, lọc, phân trang và modal CRUD.
- Đăng nhập/quản trị phiên Admin, cookie HttpOnly/SameSite, giới hạn thử đăng nhập và đăng xuất.
- API JSON cho CRUD sinh viên/lớp/điểm, báo cáo điểm; health `/health`, metrics `/metrics`.
- Ứng dụng ghi log JSON ra stdout và volume để Promtail thu thập.

## Kiến trúc và phân mạng

```text
Browser :8088 -> Nginx :8080 -> Express :3000 -> MySQL :3306
                              | -> Prometheus -> Grafana :3000
                              + -> JSON volume -> Promtail -> Loki -> Grafana
phpMyAdmin :8081 (localhost only) -> MySQL
```

Compose tách `edge-net`, `app-net`, `data-net`, `observability-net` (internal) và `management-net` riêng cho các giao diện quản trị. App/db không được publish tùy tiện ra host. Nginx là điểm vào website. phpMyAdmin, Prometheus, Grafana chỉ bind loopback trên host. Các mạng dữ liệu/ứng dụng/quan sát khai báo `internal: true`.

## Yêu cầu và chạy

Yêu cầu Docker Desktop/Engine với Compose plugin, Git và cổng 8088, 8081, 9090, 3002 còn trống.

```powershell
Copy-Item .env.example .env
```

Sửa `.env`, thay mọi chuỗi `replace-with-...` bằng thông tin riêng. `ADMIN_PASSWORD_HASH` dùng định dạng scrypt gồm salt và hash; không lưu mật khẩu Admin dạng chữ trong cấu hình. Không commit `.env` (đã có trong `.gitignore`). Tài khoản ứng dụng MySQL là user riêng, không dùng root. Sau đó:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

MySQL có health check; app khởi động sau khi DB sẵn sàng, tự tạo ba bảng và hai lớp demo. Có thể đợi lần khởi chạy đầu hoàn thành.

## Truy cập

| Dịch vụ | Địa chỉ | Ghi chú |
|---|---|---|
| Website | http://localhost:8088 | Qua Nginx |
| Đăng nhập Admin | http://localhost:8088/login | `ADMIN_USER` và mật khẩu tương ứng với `ADMIN_PASSWORD_HASH` trong `.env` |
| phpMyAdmin | http://localhost:8081 | Server `db`, user/mật khẩu trong `.env` |
| Prometheus | http://localhost:9090 | Chỉ host localhost; Status → Targets |
| Grafana | http://localhost:3002 | User/password trong `.env`; dashboard QLSV tự provision |
| Health | http://localhost:8088/health | JSON `status: ok` khi DB sẵn sàng |
| Metrics | http://localhost:8088/metrics | Prometheus exposition format |

Grafana tự provision datasource Prometheus và Loki cùng dashboard `QLSV Application` (request rate, p95, số sinh viên, database readiness).

Đăng nhập website bằng `ADMIN_USER` và mật khẩu gốc đã dùng để tạo `ADMIN_PASSWORD_HASH`. Chỉ hash scrypt được giữ trong `.env`; không commit hoặc chia sẻ file cấu hình. Phiên phía máy chủ hết hạn sau 4 giờ, bị thu hồi khi đăng xuất, và các trang quản lý không được trình duyệt lưu cache.

### API chính

Các API dưới đây yêu cầu cookie phiên Admin; đăng nhập qua `POST /login` trước khi gọi bằng trình duyệt.

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/overview` | Thống kê tổng quan |
| GET/POST | `/api/students` | Danh sách/tìm kiếm và tạo sinh viên |
| PATCH/DELETE | `/api/students/:id` | Sửa hoặc xóa sinh viên |
| GET/POST | `/api/classes` | Danh sách hoặc tạo lớp |
| PATCH/DELETE | `/api/classes/:id` | Sửa hoặc xóa lớp |
| GET/POST | `/api/grades` | Lọc theo `?semester=1`, `?semester=2` hoặc `?semester=all` (mặc định kỳ 1), tổng hợp GPA kỳ và tạo điểm |
| PATCH/DELETE | `/api/grades/:id` | Sửa hoặc xóa điểm |
| GET | `/api/reports/grades` | Phân bố kết quả học tập |
| GET | `/api/system` | Trạng thái app/database |

Tìm sinh viên: `GET /api/students?q=An&class_id=1&status=studying`. Điểm có trường `semester` nhận `1` hoặc `2`; dữ liệu cũ được migration về kỳ 1. Tạo/sửa điểm nhận cả `semester` và `score` từ 0 đến 10. Danh sách điểm được lọc tại MySQL qua query string; response có `items` đã lọc và `semesters` tổng hợp trung bình, số đầu điểm và số sinh viên theo kỳ. Các tab/thẻ kỳ gọi lại API, còn thao tác thêm/sửa/xóa tải lại bảng theo kỳ đang chọn.

## Kiểm tra và demo

1. Website: thêm lớp, sinh viên và điểm; thử sửa/xóa từng loại.
2. Thử mã trùng, email sai hoặc điểm ngoài 0–10; dữ liệu sai bị từ chối.
3. `/health` phải trả HTTP 200; `/metrics` có `http_requests_total`, `http_request_duration_seconds`, `qlsv_students_total`, `qlsv_database_ready`.
4. Prometheus Status → Targets phải có `qlsv-app` UP; thử `rate(http_requests_total[5m])`.
5. Tạo request để biểu đồ Grafana có dữ liệu, mở dashboard `QLSV Application`.
6. phpMyAdmin: chọn schema `qlsv`, xem bảng `classes`, `students`, `grades`.
7. Grafana Explore, datasource Loki, chạy truy vấn dưới đây.

```powershell
docker compose ps
docker compose logs --tail 100 nginx app db prometheus grafana loki promtail
docker compose down
```

`docker compose down -v` xóa cả dữ liệu database, Grafana, Prometheus và Loki; chỉ chạy khi chủ động reset.

## Loki và LogQL

Promtail đọc `/var/log/qlsv/*.log`, parse JSON và gán labels `level`/`method`. Không đưa thông tin cá nhân hoặc giá trị có cardinality cao vào labels.

```logql
{job="qlsv"}
{job="qlsv", level="error"}
{job="qlsv", method="POST"}
sum by (level) (count_over_time({job="qlsv"}[5m]))
sum(rate({job="qlsv"}[5m]))
```

Thao tác trên website để sinh log, chờ Promtail gửi rồi refresh Explore. Request logs có method/path/status; lỗi ứng dụng được gắn `level="error"`.

## Hardening

- Network isolation; chỉ Nginx publish website; công cụ quản lý/monitoring chỉ loopback.
- App chạy user `node`, filesystem read-only, `/tmp` tmpfs, drop capabilities, `no-new-privileges`.
- Secret cấu hình qua `.env`, loại khỏi Git; app kết nối bằng MySQL user riêng.
- Nginx ẩn version, giới hạn body/timeouts, security headers và proxy headers.
- Helmet, rate limit, validation, prepared statements, giới hạn form, lỗi trả thông báo chung.
- Grafana tắt đăng ký mở; mật khẩu admin phải cấu hình.

Đây là cấu hình thực hành HTTP. Triển khai public cần thêm TLS, CSRF token, đăng nhập/phân quyền, backup, secret store và firewall. Không dùng dữ liệu cá nhân thật.

## GitHub và ba mốc commit

Rubric yêu cầu lịch sử thể hiện quá trình tích hợp theo từng giai đoạn. Tạo repository GitHub rỗng, khởi tạo Git và triển khai lần lượt theo thứ tự dưới đây; ở mỗi mốc chỉ stage phần vừa hoàn thành rồi commit:

```powershell
git init
git add .gitignore .env.example package.json Dockerfile docker-compose.yml nginx src
git commit -m "feat: student CRUD with MySQL and Nginx reverse proxy"
```

**Commit 1:** ứng dụng CRUD, MySQL/phpMyAdmin và Nginx reverse proxy. Tiếp tục thêm Prometheus scrape config, metrics ứng dụng, Grafana provisioning/dashboard và phần Compose tương ứng, rồi:

```powershell
git add prometheus grafana src docker-compose.yml README.md
git commit -m "feat: add Prometheus and Grafana monitoring"
```

**Commit 2:** Prometheus và Grafana giám sát. Tiếp tục thêm cấu hình Loki/Promtail, volume log, service Compose và truy vấn LogQL trong README, rồi:

```powershell
git add loki docker-compose.yml README.md
git commit -m "feat: add Loki Promtail logging and LogQL examples"
```

**Commit 3:** Loki, Promtail và LogQL. Nếu bắt đầu từ snapshot đã hoàn thiện toàn bộ project này, hãy tạo các commit khi thực hiện lần lượt từng giai đoạn (hoặc dùng `git add -p` để stage các thay đổi theo giai đoạn); không commit toàn bộ snapshot ba lần vì lịch sử sẽ không thể hiện đúng tiến trình. Kiểm tra `git status`, `git log --oneline -3`; xác nhận `.env` không được track. Push:

```powershell
git remote add origin https://github.com/<username>/<repository>.git
git branch -M main
git push -u origin main
```

## Báo cáo nộp bài và ảnh minh chứng

Rubric kèm theo yêu cầu báo cáo ít nhất 10 trang. Dùng README làm nội dung nền và bổ sung tên nhóm, lớp, ngày làm, sơ đồ kiến trúc tự vẽ, ảnh chụp kết quả chạy thật, nhận xét và nguồn tham khảo. Gợi ý bố cục: (1) bìa/mục lục; (2) mục tiêu và yêu cầu; (3) stack/kiến trúc; (4) schema và CRUD; (5) Compose/network/env; (6) Nginx/security headers; (7) Prometheus/Grafana; (8) Loki/Promtail/LogQL; (9) hardening/giới hạn; (10) triển khai, GitHub, kết quả và kết luận.

Project đã có bản thảo báo cáo 10 phần trong [BAO_CAO.md](BAO_CAO.md). Tệp dùng lệnh ngắt trang của Pandoc (`\\newpage`); sau khi bổ sung thông tin nhóm và ảnh chụp thật, có thể chuyển bằng `pandoc BAO_CAO.md --toc -o BAO_CAO.docx` rồi rà lại số trang.

Chụp minh chứng: `docker compose ps`, CRUD có dữ liệu demo, Prometheus target UP, Grafana có biểu đồ, Explore với LogQL, phpMyAdmin thấy schema, GitHub thấy ba commit. Chèn ảnh và chú thích bước tạo ảnh vào DOCX/PDF; không dùng ảnh giả lập.

## Cấu trúc

```text
src/                      Express app, CRUD, EJS view
nginx/nginx.conf           Reverse proxy, security headers
prometheus/prometheus.yml  Scrape config
grafana/                   Provisioning datasource/dashboard
loki/                      Loki và Promtail config
docker-compose.yml         Services, networks, volumes, hardening
Dockerfile                 Image app non-root
.env.example               Mẫu biến môi trường
README.md                  Hướng dẫn chạy, kiểm tra, Git, báo cáo
```
