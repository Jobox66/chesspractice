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
[ BACKEND – Go ]  Render (free web service, Docker)   API + FSRS + WS
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

1. Tạo project ở <https://neon.tech> (chọn region gần Render, ví dụ `AWS Singapore`).
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

> Gói free của Render **ngủ sau 15 phút không có request**, và lần gọi đầu mất khoảng 30–60 giây
> để thức dậy. Nếu muốn backend luôn thức, tạo monitor miễn phí (UptimeRobot / cron-job.org)
> ping `https://<backend>.onrender.com/healthz` mỗi 10 phút. Một service chạy 24/7 vẫn nằm
> trong hạn mức 750 giờ/tháng.

## 4. Vercel (frontend React)

1. Sửa [frontend/vercel.json](frontend/vercel.json): thay `YOUR-BACKEND.onrender.com` bằng domain
   Render thật, rồi commit. (Rewrite của Vercel không đọc được biến môi trường nên phải ghi thẳng vào file.)
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

---

## Chạy local

```bash
# backend (cần Go 1.26+)
cd backend
cp .env.example .env      # điền POSTGRES_URL (có thể dùng một branch Neon riêng cho dev) + FIREBASE_PROJECT_ID
go run ./cmd/server

# frontend
cd frontend
cp .env.example .env      # VITE_API_URL=http://localhost:8080
npm install
npm run dev               # http://localhost:5173
```

## Lưu ý

- **Preview deployment** của Vercel có URL khác nhau mỗi lần. HTTP vẫn chạy (qua rewrite), nhưng
  WebSocket sẽ bị backend từ chối vì Origin không nằm trong `ALLOWED_ORIGINS`. Muốn test WS trên
  preview thì thêm origin đó vào `ALLOWED_ORIGINS`.
- Ticket WS lưu trong RAM của backend: chỉ đúng khi chạy **1 instance**, đúng với gói free.
- Thuật toán FSRS hiện chạy ở frontend (`ts-fsrs`); backend lưu stability/difficulty vào bảng
  `training_cards`.
- `docker-compose.yml` và `.env.example` ở thư mục gốc là cấu hình VPS cũ (Postgres + Caddy tự host),
  không dùng cho cách deploy này.
