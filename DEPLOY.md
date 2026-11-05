# Deploy (miễn phí): Neon + Render + Vercel

## Kiến trúc

```
[ NGƯỜI DÙNG ]  (PC / điện thoại)
      │
      ▼
[ FRONTEND – React/Vite ]  Vercel     https://<app>.vercel.app
      │  ├─ HTTP:  /api/*  ──(Vercel rewrite, cùng origin)──┐
      │  └─ WebSocket: wss://<backend>.onrender.com ─────────┤  (?ticket=…)
      ▼                                                      ▼
[ BACKEND – Go ]  Render (free web service, Docker)   API + WS (FSRS tính ở frontend)
      │
      ▼
[ DATABASE – PostgreSQL ]  Neon (free)
```

Vì sao lại có `/api` rewrite và ticket WebSocket? `*.vercel.app` và `*.onrender.com`
là **2 site khác nhau**: cookie phiên đăng nhập sẽ bị coi là cookie bên thứ ba và bị
chặn (Safari/iPhone chặn hẳn). Vì thế:

- **HTTP** đi qua rewrite của Vercel nên với trình duyệt là cùng origin, cookie chạy bình thường.
- **WebSocket** không qua được rewrite, nên client gọi `POST /api/ws-ticket` để lấy vé dùng
  1 lần (sống 30 giây), rồi mở `wss://<backend>.onrender.com/subscribe/<user>?ticket=…`.

Đăng nhập vẫn dùng **Firebase Auth** (miễn phí). Dịch vụ `explorer` (thống kê khai cuộc)
**không** deploy trên gói free vì cần ổ đĩa bền vững; để trống `EXPLORER_URL` thì tính năng này tắt.

---

## 1. Neon (database)

1. Tạo project ở <https://neon.tech>: region `AWS Asia Pacific (Singapore)`, **Postgres version 16**.
   Chọn 16 để khớp với `pg_dump`/`pg_restore` 16 có sẵn trên máy, phục vụ việc khôi phục backup
   (công cụ bản 16 không đọc được file dump của bản 17).
2. **Dashboard → Connect** → copy connection string (bản *direct*, không cần `-pooler`).
3. Tạo bảng: mở **SQL Editor**, dán toàn bộ [backend/schema.sql](backend/schema.sql) rồi Run.
   Hoặc dùng psql: `psql "<connection string>" -f backend/schema.sql`
4. Thêm `&pool_max_conn_idle_time=4m` vào cuối connection string, để kết nối rảnh tự đóng
   và Neon được ngủ (tiết kiệm giờ compute của gói free):

   ```
   postgresql://USER:PASS@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pool_max_conn_idle_time=4m
   ```

## 2. Firebase (đăng nhập)

1. Firebase console → **Authentication → Sign-in method**: bật Google và/hoặc Email/Password.
2. **Project settings → Your apps**: lấy config web (`apiKey`, `authDomain`, …) cho bước 4.
3. Sau khi có domain Vercel: **Authentication → Settings → Authorized domains** → thêm
   `<app>.vercel.app`.

## 3. Render (backend Go)

1. Push repo lên GitHub.
2. Render → **New → Blueprint** → chọn repo. Render đọc [render.yaml](render.yaml).
   (Hoặc tạo tay: **New → Web Service**, Runtime Docker, Root Directory `backend`,
   Health check `/healthz`, plan Free.)
3. Điền biến môi trường:

   | Biến | Giá trị |
   |---|---|
   | `POSTGRES_URL` | connection string Neon ở bước 1 |
   | `FIREBASE_PROJECT_ID` | project id của Firebase |
   | `ALLOWED_ORIGINS` | `https://<app>.vercel.app` (nhiều origin thì ngăn cách bằng dấu phẩy) |
   | `COOKIE_SECURE` | `true` (blueprint đã đặt sẵn) |

   Không cần đặt `PORT`/`LISTEN_ADDR`: Render tự cấp `PORT`, backend đọc biến này.
4. Deploy xong, kiểm tra: `https://<backend>.onrender.com/healthz` trả về 200.

> Gói free của Render **ngủ sau 15 phút không có request**, lần gọi đầu mất khoảng 1 phút để thức dậy.
> Frontend tự xử lý: khi mở app, nó gọi `/api/healthz` để đánh thức server. Nếu đang đăng nhập (hoặc
> vừa bấm đăng nhập) mà server chưa dậy, app hiện banner "Đang khởi động server…" và chờ tới khi
> server trả lời (tối đa khoảng 2,5 phút, sau đó hiện nút "Thử lại").

## 4. Vercel (frontend React)

1. Sửa [frontend/vercel.json](frontend/vercel.json): thay `YOUR-BACKEND.onrender.com` bằng domain
   Render thật, rồi commit. (Rewrite của Vercel không đọc được biến môi trường nên phải ghi thẳng vào file.)
   File này cũng tắt cache của Vercel cho `/api/*` (`x-vercel-enable-rewrite-caching: 0`): project
   Vercel tạo sau 06/04/2026 mặc định cache phản hồi của rewrite, mà API trả dữ liệu riêng từng người.
2. Vercel → **Add New → Project** → import repo → **Root Directory: `frontend`**
   (Framework tự nhận là Vite).
3. Environment Variables:

   | Biến | Giá trị |
   |---|---|
   | `VITE_API_URL` | `/api` |
   | `VITE_WS_URL` | `https://<backend>.onrender.com` |
   | `VITE_FIREBASE_API_KEY` | từ Firebase |
   | `VITE_FIREBASE_AUTH_DOMAIN` | từ Firebase |
   | `VITE_FIREBASE_PROJECT_ID` | từ Firebase |
   | `VITE_FIREBASE_STORAGE_BUCKET` | từ Firebase |

4. Deploy. Sau đó quay lại Render để cập nhật `ALLOWED_ORIGINS` theo domain Vercel cuối cùng,
   và thêm domain đó vào Firebase Authorized domains.

Mỗi lần push lên `main`: Render và Vercel tự deploy; GitHub Actions ([ci.yml](.github/workflows/ci.yml))
chạy test backend và build frontend.

## 5. Backup & restore

[backup.yml](.github/workflows/backup.yml) chạy `pg_dump` lúc 02:00 (giờ VN) mỗi đêm, mã hoá bằng GPG
(repo public) rồi lưu thành artifact của GitHub Actions, giữ 30 ngày.

**Cài đặt** (GitHub repo → Settings → Secrets and variables → Actions):

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `NEON_BACKUP_URL` | connection string Neon **không** kèm `&pool_max_conn_idle_time=…` (`pg_dump` không hiểu tham số này) |
| Secret | `BACKUP_PASSPHRASE` | chuỗi ngẫu nhiên dài; **lưu vào trình quản lý mật khẩu**, mất là không khôi phục được |
| Variable (tuỳ chọn) | `PG_MAJOR` | phiên bản Postgres của Neon nếu khác 16 |

Sau đó vào tab **Actions → backup → Run workflow** để chạy thử một lần.

**Khôi phục** (Git Bash; `gpg` có sẵn trong Git for Windows):

```bash
# 1. Tải artifact từ tab Actions, giải nén ra file .dump.gpg
gpg -d -o backup.dump chesspractice-YYYY-MM-DD.dump.gpg      # nhập BACKUP_PASSPHRASE
# 2. Đổ vào database đích (Neon hoặc Postgres local)
"/c/Program Files/PostgreSQL/16/bin/pg_restore.exe" --clean --if-exists --no-owner \
  -d "postgresql://USER:PASS@HOST/DB?sslmode=require" backup.dump
```

> GitHub tự tắt workflow theo lịch nếu repo public không có hoạt động nào trong 60 ngày.
> Khi đó vào tab Actions bật lại.

---

## Chạy local

```bash
# backend (cần Go 1.26+)
cd backend
cp .env.example .env      # điền POSTGRES_URL + FIREBASE_PROJECT_ID (xem "DB cho dev" bên dưới)
go run ./cmd/server

# frontend
cd frontend
cp .env.example .env      # VITE_API_URL=http://localhost:8080
npm install
npm run dev               # http://localhost:5173
```

**DB cho dev**, chọn một trong hai:

- **Postgres 16 có sẵn trên máy** (nhanh, không tốn hạn mức Neon). Cần biết mật khẩu user `postgres`:

  ```bash
  PG="/c/Program Files/PostgreSQL/16/bin"
  "$PG/createdb.exe" -U postgres chesspractice_dev
  "$PG/psql.exe" -U postgres -d chesspractice_dev -f backend/schema.sql
  # backend/.env:
  # POSTGRES_URL=postgres://postgres:<password>@localhost:5432/chesspractice_dev?sslmode=disable
  ```

- **Branch Neon riêng cho dev** (Neon → Branches → New branch): không cần cài gì, dữ liệu tách khỏi bản chính.

## Lưu ý

- **Preview deployment** của Vercel có URL khác nhau mỗi lần. HTTP vẫn chạy (qua rewrite), nhưng
  WebSocket sẽ bị backend từ chối vì Origin không nằm trong `ALLOWED_ORIGINS`. Muốn test WS trên
  preview thì thêm origin đó vào `ALLOWED_ORIGINS`.
- Ticket WS lưu trong RAM của backend: chỉ đúng khi chạy **1 instance**, đúng với gói free.
- Thuật toán FSRS hiện chạy ở frontend (`ts-fsrs`); backend lưu stability/difficulty vào bảng
  `training_cards`.
- `docker-compose.yml` và `.env.example` ở thư mục gốc là cấu hình VPS (Postgres + Caddy tự host),
  giữ lại để dùng sau nếu cần; không dùng cho cách deploy này.
