# BÁO CÁO BÀI TẬP LỚN

## Đề tài 2 - Hệ thống Quản lý Sinh viên (EduCore Academic Manager)

**Học phần:** Triển khai và Quản trị Hệ thống Phần mềm  
**Sinh viên:** Phạm Thị Bích Ngọc  
**Mã số sinh viên (Lớp):** CNTT K23B  
**Giảng viên:** [Điền họ tên giảng viên]  
**Ngày hoàn thiện:** 

> Báo cáo mô tả mã nguồn và cấu hình trong repository. Trước khi nộp, cập nhật tên giảng viên, tên repository/URL GitHub, thông tin buổi demo và chèn ảnh chụp màn hình do sinh viên tự chụp ở các vị trí “Minh chứng”. Số liệu vận hành cần được đối chiếu với lần chạy thực tế trên máy nộp bài.

\newpage

# Mục lục

1. Mục tiêu, phạm vi và kiến trúc tổng thể  
2. Quản lý mã nguồn trên GitHub và cấu trúc commit  
3. Ứng dụng web, API, MySQL và phpMyAdmin  
4. Nginx Reverse Proxy và bảo vệ truy cập  
5. Prometheus và Grafana  
6. Loki, Promtail và truy vấn LogQL  
7. Hardening, kiểm thử vận hành, đánh giá và hướng dẫn xuất báo cáo

\newpage

# 1. Mục tiêu, phạm vi và kiến trúc tổng thể

## 1.1. Bối cảnh và mục tiêu

Đề tài xây dựng EduCore Academic Manager, một website phục vụ quản lý dữ liệu đào tạo ở quy mô minh họa. Bài tập kết hợp nghiệp vụ CRUD với các nội dung triển khai, vận hành và bảo mật cơ bản. Người quản trị đăng nhập để thao tác hồ sơ sinh viên, lớp học và kết quả học tập; hệ thống lưu dữ liệu trong MySQL. Các thành phần chạy đồng bộ bằng Docker Compose để có thể dựng lại trên máy có Docker mà không cần cài Node.js hay MySQL trực tiếp trên máy chủ.

Mục tiêu thứ nhất là cung cấp giao diện dễ trình bày: dashboard tổng quan, điều hướng nghiệp vụ, bộ lọc, biểu mẫu thêm/sửa và thông báo kết quả. Mục tiêu thứ hai là triển khai ứng dụng qua Nginx thay vì công khai cổng Express. Mục tiêu thứ ba là cung cấp quan sát hệ thống: Prometheus thu thập metric, Grafana trình bày dashboard, Loki nhận log và Promtail chuyển log từ ứng dụng. Cuối cùng, cấu hình Compose thể hiện nguyên tắc phân tách mạng, giảm quyền tiến trình và quản lý secret qua môi trường.

## 1.2. Phạm vi chức năng

Phân hệ sinh viên lưu mã sinh viên, họ tên, email, ngày sinh, trạng thái học tập và lớp. Mã sinh viên là duy nhất; người dùng có thể tìm theo tên, mã hoặc email, lọc theo lớp và trạng thái, sau đó thêm, sửa hoặc xóa. Phân hệ lớp lưu mã lớp, tên lớp và chuyên ngành; giao diện hiển thị số sinh viên liên quan. Phân hệ điểm lưu sinh viên, môn học, học kỳ và điểm trên thang 10. Học kỳ 1 và Học kỳ 2 là giá trị riêng biệt; tab “Tất cả kỳ” trả về dữ liệu của cả hai kỳ.

Điểm trung bình trên thẻ học kỳ được tính từ các đầu điểm trong kỳ bằng trung bình số học, làm tròn hai chữ số. Đây là chỉ số minh họa theo dữ liệu hiện có, không phải GPA có trọng số tín chỉ vì mô hình hiện tại chưa lưu số tín chỉ hoặc trọng số môn học. Báo cáo phân bố điểm chia kết quả thành các nhóm Giỏi, Khá, Trung bình và Cần cải thiện.

## 1.3. Kiến trúc triển khai

Luồng giao diện là trình duyệt → Nginx → Express → MySQL. Trình duyệt chỉ truy cập cổng Nginx được ánh xạ ra host; Nginx chuyển request tới dịch vụ `app` bằng DNS nội bộ của Docker. phpMyAdmin là công cụ quản trị tùy chọn, kết nối MySQL trên mạng dữ liệu và chỉ bind cổng loopback trên host. Prometheus truy cập `/metrics` của ứng dụng. Grafana truy vấn Prometheus và Loki qua mạng observability. Promtail đọc file log từ volume chỉ đọc và gửi đến Loki.

Các cấu hình được giữ trong thư mục riêng: `src/` chứa server, giao diện và tài nguyên; `nginx/` chứa cấu hình reverse proxy; `prometheus/` chứa scrape config; `grafana/` chứa provisioning datasource/dashboard; `loki/` chứa cấu hình Loki và Promtail. `docker-compose.yml` khai báo dịch vụ, volume, healthcheck, giới hạn cổng và network. `.env.example` là mẫu biến môi trường; `.env` chứa thông tin riêng của lần chạy và không được commit.

**Minh chứng 1:** Chèn ảnh sơ đồ kiến trúc có các luồng Browser–Nginx–App–MySQL, Prometheus–App, Grafana–Prometheus/Loki và Promtail–Loki. Ghi rõ cổng host khác cổng container nếu có.

\newpage

# 2. Quản lý mã nguồn trên GitHub và cấu trúc commit

## 2.1. Repository và quy tắc lưu trữ

Repository là nguồn chuẩn để lưu mã ứng dụng, Dockerfile, Compose, cấu hình Nginx, monitoring, logging và tài liệu. Tên repository nên ngắn gọn, ví dụ `educore-academic-manager`. Nội dung commit cần mô tả một thay đổi có thể review được. Không đưa mật khẩu, cookie, session secret, dữ liệu cá nhân thật, file `.env`, volume database hoặc log vận hành vào Git. `.gitignore` phải loại trừ `.env`, `node_modules`, file log và các file tạm do IDE tạo ra.

Trước khi commit cần xem `git status`, đọc diff và kiểm tra danh sách file staged. Khi nộp, đường dẫn repository phải là repository thật do sinh viên tạo hoặc được cấp quyền; báo cáo này không khẳng định đã push lên GitHub nếu sinh viên chưa thực hiện thao tác đó. Nếu làm việc cá nhân, có thể dùng nhánh `main`; nếu muốn thử nghiệm, tạo nhánh tính năng rồi merge sau khi tự kiểm tra.

## 2.2. Ba mốc commit theo rubric

Ba mốc được tổ chức theo thứ tự tăng dần chức năng. Commit 1 hoàn thành source CRUD, schema MySQL, reverse proxy Nginx, login cơ bản, Dockerfile và Compose nền. Commit 2 bổ sung endpoint metric, cấu hình Prometheus, provisioning Grafana và dashboard. Commit 3 bổ sung ghi log JSON, volume log, cấu hình Loki/Promtail và truy vấn mẫu LogQL trong README. Các mốc nên có nội dung commit rõ nghĩa, không dùng một commit duy nhất cho toàn bộ bài.

Ví dụ thao tác trong PowerShell từ thư mục gốc:

```powershell
git init
git branch -M main
git add src Dockerfile docker-compose.yml nginx .env.example .gitignore README.md
git diff --cached
git commit -m "feat: add student class grade CRUD and nginx proxy"

git add prometheus grafana src
git diff --cached
git commit -m "feat: add prometheus metrics and grafana dashboard"

git add loki src README.md
git diff --cached
git commit -m "feat: centralize application logs with loki and promtail"
```

Dòng `git add` có thể được điều chỉnh theo các file đã thay đổi tại từng mốc. Trước mỗi commit cần bỏ khoảng trắng thừa ở đầu lệnh nếu copy nguyên khối. Sau khi tạo repository GitHub, thêm remote và push:

```powershell
git remote add origin https://github.com/<tai-khoan>/<ten-repository>.git
git push -u origin main
git log --oneline --decorate -5
```

Nếu repository đã có sẵn thì không chạy `git init` lần nữa; kiểm tra `git status` và `git remote -v`, sau đó commit/push theo quy trình của repository hiện hữu. Không tạo commit giả với ngày hoặc nội dung không phản ánh thay đổi thực.

## 2.3. Bằng chứng quản lý mã nguồn

Báo cáo nộp nên có ảnh trang GitHub hiển thị README và cây thư mục, ảnh lịch sử commit có đủ ba mốc, và kết quả `git log --oneline`. Ảnh không nên để lộ secret hoặc URL chứa token. README cần ghi yêu cầu môi trường, cách tạo `.env`, cách chạy Compose, địa chỉ dịch vụ, API chính, lệnh xem log và cảnh báo khi xóa volume.

**Minh chứng 2:** Chèn ảnh repository thật và ảnh lịch sử commit sau khi đã push. Nếu bài chưa push, ghi trạng thái “chưa push” thay vì dùng ảnh minh họa giả.

\newpage

# 3. Ứng dụng web, API, MySQL và phpMyAdmin

## 3.1. Backend và xử lý dữ liệu

Backend sử dụng Node.js, Express và thư viện MySQL. Các route API trả JSON; route quản trị yêu cầu phiên đăng nhập. Trước khi truy vấn, server kiểm tra ID số nguyên dương, trường bắt buộc, chiều dài chuỗi, định dạng email, kỳ học thuộc 1 hoặc 2 và điểm nằm trong khoảng 0–10. Truy vấn dùng placeholder `?`, không nối chuỗi đầu vào của người dùng vào SQL. Mã lớp và mã sinh viên có ràng buộc duy nhất để tránh dữ liệu trùng.

Các endpoint chính gồm `GET/POST /api/students`, `PATCH/DELETE /api/students/:id`, `GET/POST /api/classes`, `PATCH/DELETE /api/classes/:id`, `GET/POST /api/grades` và `PATCH/DELETE /api/grades/:id`. Endpoint tổng quan `/api/overview` phục vụ các thẻ thống kê; `/api/reports/grades` trả phân bố điểm theo học kỳ; `/api/system` cung cấp trạng thái database cho trang cài đặt. `/health` phục vụ healthcheck còn `/metrics` dành cho Prometheus.

## 3.2. Lọc điểm theo học kỳ và cập nhật GPA

Giao diện điểm gọi `GET /api/grades?semester=1`, `GET /api/grades?semester=2` hoặc `GET /api/grades?semester=all`. Server xác nhận giá trị bộ lọc, sau đó truy vấn trực tiếp bảng `grades`; khi lọc một kỳ, câu SQL có điều kiện `WHERE g.semester=?`. Endpoint đồng thời truy vấn tổng hợp theo học kỳ gồm số đầu điểm, trung bình điểm và số sinh viên có điểm. Vì vậy hai thẻ tổng quan không phụ thuộc vào tập dòng đang hiển thị mà phản ánh dữ liệu tổng hợp từ MySQL.

Các tab và thẻ Học kỳ 1/Học kỳ 2 gọi cùng thao tác tải lại dữ liệu. Khi tạo, cập nhật hoặc xóa điểm, giao diện gọi API tương ứng rồi nạp lại danh sách theo kỳ đang chọn. Kỳ được lưu ở trường `semester` dưới dạng 1 hoặc 2. Bản ghi cũ được migration gán mặc định kỳ 1, tránh làm mất điểm khi cập nhật schema. Nếu API nhận giá trị học kỳ sai, server trả lỗi 400 thay vì truy vấn không xác định.

## 3.3. Mô hình cơ sở dữ liệu

Schema `qlsv` gồm ba bảng chính. `classes` lưu mã, tên và chuyên ngành. `students` lưu hồ sơ và khóa ngoại `class_id`; khi xóa lớp, liên kết có thể trở về rỗng để bảo toàn hồ sơ sinh viên. `grades` lưu `student_id`, môn, kỳ và điểm; khóa ngoại liên kết đến sinh viên. Mọi bảng dùng InnoDB và charset `utf8mb4` để hỗ trợ tiếng Việt. Cấu trúc là dạng quan hệ cơ bản, phù hợp bài tập và dễ kiểm tra bằng phpMyAdmin.

Ứng dụng dùng tài khoản MySQL riêng, không kết nối bằng root. Cấu hình `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `DB_HOST` được lấy từ environment. Named volume `mysql_data` lưu dữ liệu qua các lần thay container. `docker compose down` giữ volume; `docker compose down -v` xóa dữ liệu nên chỉ chạy khi chủ động reset môi trường demo.

## 3.4. Triển khai và kiểm tra phpMyAdmin

phpMyAdmin là giao diện quản trị, không phải database riêng. Service này kết nối tới host nội bộ `db:3306`, chọn schema `qlsv`, rồi xem cấu trúc và dữ liệu bảng. Cổng host được bind vào `127.0.0.1:8081`; do đó chỉ truy cập được từ máy Docker host, không công khai trực tiếp ra mạng. Đăng nhập bằng user database riêng trong `.env`. Không dùng tài khoản phpMyAdmin để thay thế giao diện nghiệp vụ của ứng dụng.

Quy trình kiểm tra: chờ `db` healthy, vào địa chỉ phpMyAdmin trong README, nhập server `db`, user/password trong `.env`, chọn `qlsv`, xác nhận có bảng `classes`, `students`, `grades`. Thêm một bản ghi qua website rồi refresh bảng tương ứng trong phpMyAdmin để chứng minh dữ liệu đã được ghi xuống database. Không chụp ảnh có mật khẩu hoặc dữ liệu cá nhân thật.

**Minh chứng 3:** Ảnh màn hình danh sách sinh viên, form nhập điểm có lựa chọn học kỳ, kết quả lọc kỳ 1/kỳ 2, card điểm trung bình, và schema `qlsv` trong phpMyAdmin.

\newpage

# 4. Nginx Reverse Proxy và bảo vệ truy cập

## 4.1. Vai trò của Nginx

Nginx là cổng vào duy nhất của website. Người dùng truy cập địa chỉ host; Nginx chuyển tiếp request đến `app:3000` trên network nội bộ. App không cần publish cổng ra host, giúp giảm bề mặt truy cập. Reverse proxy đặt các tham số chuyển tiếp `Host`, địa chỉ client, giao thức và hỗ trợ kết nối keep-alive/timeout hợp lý. Healthcheck `/health` giúp phân biệt lỗi ứng dụng với lỗi proxy.

Cấu hình giới hạn body request để tránh payload quá lớn, đặt timeout, tắt hiển thị phiên bản server nếu cấu hình hỗ trợ, và dùng `X-Forwarded-For`/`X-Forwarded-Proto` để ứng dụng ghi nhận thông tin request phù hợp. Trong môi trường demo local, website chạy HTTP. Khi triển khai ra Internet cần TLS bằng chứng thư hợp lệ và thiết lập cookie secure; security headers không thay thế mã hóa HTTPS.

## 4.2. Security headers

Nginx bổ sung `X-Content-Type-Options: nosniff` để trình duyệt không tự suy đoán loại nội dung, `X-Frame-Options: DENY` để hạn chế nhúng trang trong iframe, `Referrer-Policy` để giảm dữ liệu referrer và `Permissions-Policy` để vô hiệu hóa các API trình duyệt không dùng. Content Security Policy có thể giới hạn nguồn script/style/image; cần kiểm tra tương thích với CSS, JavaScript và font đang dùng trước khi áp chính sách chặt trên môi trường thực.

Header `Strict-Transport-Security` chỉ nên bật khi toàn bộ hostname được phục vụ qua HTTPS ổn định. Không bật HSTS trên địa chỉ HTTP local vì trình duyệt có thể ghi nhớ chính sách và gây khó kiểm thử. Header proxy truyền tới Express không được xem là bằng chứng TLS nếu chưa cấu hình TLS thật ở edge.

## 4.3. Kiểm tra cấu hình

Dùng `docker compose exec nginx nginx -t` để kiểm tra cú pháp bên trong container; dùng `curl -I http://localhost:8088/` để xem status và response headers; dùng `docker compose logs --tail 100 nginx` để kiểm tra request và lỗi upstream. Khi sửa file cấu hình, khởi động lại hoặc reload Nginx rồi kiểm tra lại trang đăng nhập và trang chính. Nếu nhận 502, kiểm tra DNS service `app`, healthcheck ứng dụng và log Nginx.

**Minh chứng 4:** Chèn ảnh `nginx -t` báo cú pháp thành công và output `curl -I` có các header đã cấu hình. Đảm bảo ảnh ghi rõ môi trường local HTTP, không tuyên bố đã có HTTPS nếu chưa cấu hình TLS.

\newpage

# 5. Prometheus và Grafana

## 5.1. Thu thập metric

Express xuất metric theo định dạng Prometheus tại `/metrics`. Bộ metric ứng dụng có thể gồm tổng request theo phương thức/route/status, histogram độ trễ, gauge số sinh viên và gauge trạng thái kết nối database. Route nhạy cảm không cần được thu thập thông tin người dùng; label cần giới hạn cardinality, tránh dùng email, tên sinh viên, ID tùy ý hoặc URL chứa ID làm label.

File `prometheus/prometheus.yml` khai báo scrape job cho ứng dụng qua DNS nội bộ, thường với target `app:3000` và path `/metrics`. Chu kỳ scrape phù hợp demo là khoảng 15 giây. Prometheus có volume riêng để giữ TSDB qua lần restart. Cổng giao diện Prometheus chỉ bind loopback theo cấu hình Compose.

## 5.2. Dashboard Grafana

Grafana được cấu hình datasource Prometheus và Loki tự động qua provisioning. Dashboard ứng dụng hiển thị request rate, độ trễ p95, số sinh viên hiện có và trạng thái database. Các panel phải có tiêu đề, đơn vị và khoảng thời gian rõ. Dashboard được provision từ file JSON trong repository để người chấm có thể dựng lại thay vì tạo thủ công trên một máy duy nhất.

Một số truy vấn PromQL phù hợp gồm:

```promql
rate(http_requests_total[5m])
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
qlsv_students_total
qlsv_database_ready
```

Tên metric cần đối chiếu với kết quả thực tế tại `/metrics`, vì thay đổi instrumentation có thể làm tên metric khác đi. `up{job="qlsv-app"}` bằng 1 cho biết Prometheus scrape được target; 0 hoặc series vắng mặt cần kiểm tra mạng, cấu hình target và trạng thái ứng dụng.

## 5.3. Quy trình xác nhận

Mở Prometheus Status → Targets, xác nhận job ứng dụng là UP. Tab Graph chạy `up` hoặc request rate. Mở Grafana bằng thông tin admin trong `.env`, vào dashboard đã provision, chọn khoảng thời gian gần đây và tạo traffic bằng thao tác web. Nếu panel trống, kiểm tra datasource, thời gian scrape, tên metric và thời điểm có request. Lần chạy mới có thể cần chờ một đến hai chu kỳ scrape trước khi biểu đồ có dữ liệu.

**Minh chứng 5:** Chèn ảnh Prometheus Targets có job app UP, ảnh Prometheus query, và ảnh dashboard Grafana hiển thị các panel sau khi tạo request. Không chụp lộ mật khẩu Grafana.

\newpage

# 6. Loki, Promtail và truy vấn LogQL

## 6.1. Luồng log tập trung

Ứng dụng ghi sự kiện dạng JSON ra stdout và file log trong named volume dùng chung. File log có thể gồm timestamp, mức độ, phương thức, route hoặc mã lỗi phù hợp. Promtail mount volume ứng dụng ở chế độ chỉ đọc, theo dõi file mới, parse JSON và gắn một số label ổn định như `job` hoặc `level`. Promtail gửi batch tới Loki qua network observability nội bộ. Grafana cung cấp Explore để truy vấn Loki cùng giao diện với dashboard metric.

Không đưa password, session cookie, token, nội dung biểu mẫu nhạy cảm hoặc dữ liệu định danh cá nhân vào log. Không gắn các trường có vô số giá trị như student ID làm label Loki vì sẽ tạo cardinality cao; nếu cần tra cứu chúng thì giữ trong nội dung log đã được cân nhắc, hoặc dùng request ID. Volume log cần có chính sách dung lượng/rotation khi sử dụng lâu dài; demo Compose hiện hướng tới minh họa, chưa thay thế nền tảng logging có HA.

## 6.2. Truy vấn LogQL mẫu

Trong Grafana Explore, chọn datasource Loki rồi chạy các truy vấn sau (điều chỉnh label selector theo `promtail-config.yaml` thực tế):

```logql
{job="qlsv", service="app"}
```

Truy vấn trên xem log ứng dụng trong khoảng thời gian đã chọn. Lọc log mức lỗi nếu trường JSON được parse thành label `level`:

```logql
{job="qlsv", service="app", level="error"}
```

Đếm lỗi theo cửa sổ 5 phút:

```logql
sum(count_over_time({job="qlsv", service="app", level="error"}[5m]))
```

Tìm thông báo liên quan đến đăng nhập thất bại trong nội dung log (nếu ứng dụng ghi sự kiện đó):

```logql
{job="qlsv", service="app", level="warn"} |= "login_failed"
```

Pipeline Promtail hiện chuyển `level` và `method` thành label; sự kiện đăng nhập thất bại được ghi mức `warn` với `event="login_failed"`. Selector và parser cần khớp cấu hình Promtail; không tuyên bố kết quả truy vấn nếu chưa chạy trên datasource thực.

## 6.3. Xử lý khi không thấy log

Kiểm tra container `promtail` và `loki` đang chạy, quyền đọc volume, đường dẫn file target và endpoint push. Kiểm tra `docker compose logs promtail loki` để phát hiện lỗi kết nối. Tạo request mới trên website, chọn đúng time range ở Explore, chạy selector rộng trước rồi mới thêm filter. Nếu không có file log, xác nhận `LOG_FILE` trong service app cùng mount point `/var/log/qlsv`.

**Minh chứng 6:** Chèn ảnh Grafana Explore với truy vấn selector toàn bộ, truy vấn lọc error và kết quả trả về. Che các nội dung log có thể chứa thông tin nhạy cảm.

\newpage

# 7. Hardening, kiểm thử vận hành, đánh giá và hướng dẫn xuất báo cáo

## 7.1. Hardening hệ thống

**Quản lý secret:** mật khẩu root MySQL, mật khẩu user ứng dụng, mật khẩu Admin, mật khẩu Grafana và session secret nằm trong `.env` cục bộ. `.env` không được đưa vào Git; chỉ commit `.env.example` với giá trị hướng dẫn không bí mật. Sinh secret ngẫu nhiên riêng cho mỗi lần triển khai. Không dùng mật khẩu minh họa trên máy có thể truy cập từ Internet. Khi đổi mật khẩu MySQL sau khi volume đã khởi tạo, cần cập nhật user bên trong DB một cách đồng bộ; sửa riêng `.env` không đổi credential đã lưu trong MySQL.

**Network isolation:** Compose chia network theo mục đích. Nginx kết nối phía edge và app; app kết nối database và mạng quan sát; MySQL không publish cổng host; Grafana, Prometheus và phpMyAdmin chỉ bind loopback cho demo. Mạng nội bộ `internal: true` giảm kết nối ra ngoài đối với thành phần dữ liệu/quan sát. Chỉ publish những cổng thực sự cần để người vận hành truy cập.

**Least privilege:** tiến trình Node chạy bằng user `node` không phải root. Container app có filesystem read-only, `/tmp` riêng, `no-new-privileges` và bỏ Linux capabilities. Nginx cũng chạy với filesystem hạn chế và chỉ giữ các capability cần thiết để bind cổng nội bộ. Không chạy lệnh quản trị trong container bằng root nếu không cần.

**Phiên đăng nhập và HTTP:** cookie phiên có HttpOnly và SameSite; hạn sử dụng được giới hạn. Có giới hạn thử đăng nhập và logout xóa phiên. Khi cấu hình HTTPS ở môi trường thật, bật cookie Secure, dùng TLS hợp lệ và xem xét CSRF protection, backup, cập nhật image, quét lỗ hổng và chính sách phân quyền nhiều người dùng. Bài tập hiện chỉ có tài khoản Admin đơn và chưa phải hệ thống sẵn sàng cho dữ liệu đào tạo thực.

**Dữ liệu và vận hành:** dùng truy vấn tham số hóa, xác thực đầu vào, ràng buộc unique/foreign key, healthcheck, giới hạn cổng quản trị. Sao lưu MySQL volume định kỳ; kiểm tra khôi phục backup thay vì chỉ giả định backup hoạt động. Không dùng `docker compose down -v` trong khi cần giữ dữ liệu.

## 7.2. Kịch bản demo và kiểm tra

1. Kiểm tra `.env` cục bộ không bị stage, sau đó chạy `docker compose config` để xác nhận cấu hình Compose hợp lệ.
2. Chạy `docker compose up -d --build`, đợi MySQL healthy và app khởi động; kiểm tra `docker compose ps`.
3. Truy cập trang login, đăng nhập bằng `ADMIN_USER` và mật khẩu tương ứng với `ADMIN_PASSWORD_HASH` trong `.env`; mở dashboard và kiểm tra sidebar.
4. Tạo lớp demo, tạo sinh viên gắn lớp, nhập điểm cho học kỳ 1 và học kỳ 2. Sửa một điểm, xóa một điểm thử nghiệm, quan sát thông báo và bảng được tải lại.
5. Chọn tab học kỳ 1, học kỳ 2, tất cả kỳ; xác nhận request `/api/grades?semester=...` trả đúng tập dữ liệu và các card trung bình hiển thị số liệu tương ứng từ database.
6. Mở Báo cáo, đối chiếu phân bố theo kỳ; mở phpMyAdmin trên loopback và xác nhận bản ghi tồn tại trong schema `qlsv`.
7. Mở Prometheus Targets, xác nhận app UP; mở dashboard Grafana sau khi tạo request; mở Explore Loki và chạy các truy vấn ở phần 6.
8. Kiểm tra security headers bằng `curl -I`, xác nhận cổng dịch vụ quản trị chỉ bind localhost và kiểm tra log khi có request.
9. Chụp ảnh màn hình của từng tiêu chí, không để lộ `.env`, password, token hoặc thông tin cá nhân. Ghi nhận phiên bản Docker và thời điểm chạy nếu giảng viên yêu cầu.

Một số lệnh vận hành:

```powershell
docker compose ps
docker compose logs --tail 100 app nginx db prometheus grafana loki promtail
docker compose exec nginx nginx -t
curl.exe -I http://localhost:8088/
docker compose down
```

Khi cần dựng lại image sau thay đổi mã nguồn, dùng `docker compose up -d --build`. Lệnh `docker compose down` dừng và xóa container/network của project nhưng giữ named volumes. Chỉ dùng `docker compose down -v` khi chủ động xóa database và toàn bộ dữ liệu metric/log đã lưu.

## 7.3. Đánh giá kết quả và giới hạn

Hệ thống đáp ứng các nhóm tiêu chí chính của bài: source có thể quản lý qua Git, website CRUD chạy cùng MySQL, phpMyAdmin hỗ trợ kiểm tra schema, Nginx làm reverse proxy, Prometheus/Grafana giám sát, Loki/Promtail tập trung log, và Compose thể hiện các kiểm soát hardening nền tảng. Phân hệ điểm lưu học kỳ trong database, API lọc theo học kỳ, thống kê trung bình theo kỳ và báo cáo phân bố kết quả tách riêng từng kỳ.

Giới hạn hiện tại gồm quy mô một máy/Compose, một tài khoản quản trị cấu hình môi trường, chưa có role-based access, chưa có backup tự động, chưa có TLS local, chưa có HA cho database/monitoring và GPA chưa dùng tín chỉ. Các điểm này phù hợp phạm vi bài tập nhưng phải được xem xét trước khi mở rộng thành hệ thống thực tế. Phần minh chứng phải phản ánh lần chạy của sinh viên; tài liệu không thay thế việc thực hành và chụp ảnh thật.

## 7.4. Hoàn thiện và xuất DOCX/PDF

Trước khi xuất, cập nhật giảng viên, URL GitHub, ngày demo, ảnh chụp và đánh số hình/bảng. Kiểm tra lại trang bìa, mục lục, lỗi chính tả, URL, lệnh và tên file cấu hình. Với Pandoc, cài Pandoc và một bộ máy LaTeX phù hợp để xuất PDF có ngắt trang từ `\newpage`:

```powershell
pandoc BAO_CAO.md -o BAO_CAO.docx
pandoc BAO_CAO.md -o BAO_CAO.pdf --pdf-engine=xelatex -V mainfont="Times New Roman" -V geometry:margin=2.5cm
```

Nếu không cài LaTeX, mở `BAO_CAO.md` trong VS Code, dùng extension Markdown PDF hoặc mở file DOCX tạo bằng Pandoc trong Microsoft Word/LibreOffice rồi Export/Save As PDF. Với Word, cập nhật styles Heading 1/Heading 2 và chèn mục lục tự động, kiểm tra font tiếng Việt, ngắt trang, hình không tràn lề và số trang. Xuất lại cả DOCX và PDF sau lần chỉnh cuối; mở từng file để xác nhận font và trang hiển thị đúng trước khi nộp.

**Minh chứng cuối:** Chèn ảnh dashboard website, trang điểm hai học kỳ, báo cáo, Prometheus, Grafana, Loki, `docker compose ps`, GitHub và security headers. Danh sách ảnh nên đánh số liên tục và ghi chú ngắn gọn nội dung cũng như thời điểm chụp.

\newpage

# Kết luận

EduCore Academic Manager kết hợp nghiệp vụ quản lý sinh viên với thực hành triển khai một hệ thống nhiều dịch vụ. Dữ liệu được lưu bền vững trong MySQL; ứng dụng được cung cấp qua Nginx; phpMyAdmin phục vụ quản trị có giới hạn; Prometheus và Grafana cung cấp khả năng theo dõi; Loki và Promtail hỗ trợ tra cứu log tập trung. Cấu hình mạng riêng, user không root, secret ngoài mã nguồn, healthcheck và các header bảo mật tạo nền tảng vận hành an toàn hơn cho môi trường học tập.

Kết quả cuối cùng cần được xác nhận bằng việc chạy trên máy nộp bài, kiểm tra các API/UI, bổ sung ảnh minh chứng thật, hoàn tất ba commit và push repository GitHub. Báo cáo DOCX/PDF sau khi xuất phải giữ nguyên bìa, mục lục, hình ảnh và ngắt trang; mọi thông tin chưa được cung cấp cần được điền chính xác trước khi nộp.
