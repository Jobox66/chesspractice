# Deploy chesspractice (miễn phí)

```
Trình duyệt ──► Vercel (React)  ── /api/* ──►  Render (Go)  ──►  Neon (Postgres 16)
                     └──── WebSocket (wss://…onrender.com) ───┘
```

Làm theo thứ tự từ bước 0 đến bước 7. Ghi lại 3 địa chỉ sẽ dùng nhiều lần:

| Tên | Ví dụ | Lấy ở đâu |
|---|---|---|
| `NEON_URL` | `postgresql://USER:PASS@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` | Bước 1 |
| `BACKEND` | `https://chesspractice-backend.onrender.com` | Bước 3 |
| `FRONTEND` | `https://chesspractice.vercel.app` | Bước 5 (= tên project Vercel + `.vercel.app`) |

---

## Bước 0. Đưa code vào `main`

GitHub repo → **Pull requests → New pull request** → base `main` ← compare `deploy/neon-render-vercel`
→ **Create** → **Merge**. Sau đó cập nhật máy:

```bash
git checkout main
git pull
```

## Bước 1. Neon (database)

1. <https://neon.tech> → **New project**: region **AWS Singapore**, Postgres **16**.
   Phải là 16 để `pg_restore` 16 trên máy đọc được file backup.
2. **Connect** → copy connection string (bản thường, không chọn *pooled*). Đây là `NEON_URL`.
3. **SQL Editor** → dán toàn bộ nội dung [backend/schema.sql](backend/schema.sql) → **Run** (chỉ chạy 1 lần).

## Bước 2. Firebase (đăng nhập)

1. <https://console.firebase.google.com> → tạo project (gói Spark, free).
2. **Authentication → Sign-in method** → bật **Google** (và Email/Password nếu muốn).
3. **Project settings → Your apps → Web (`</>`)** → đăng ký app → giữ lại các giá trị
   `apiKey`, `authDomain`, `projectId`, `storageBucket` cho bước 5.

> Upload ảnh đại diện lúc đăng ký cần Firebase Storage. Nếu Firebase đòi nâng gói (Blaze) để bật Storage thì bỏ qua:
> đăng nhập Google vẫn dùng ảnh Google, chỉ là không upload được ảnh riêng.

## Bước 3. Render (backend)

1. <https://render.com> → **New → Blueprint** → chọn repo `chesspractice` → Render đọc [render.yaml](render.yaml).
2. Điền biến môi trường được hỏi:

   | Biến | Giá trị |
   |---|---|
   | `POSTGRES_URL` | `NEON_URL` + `&pool_max_conn_idle_time=4m` |
   | `FIREBASE_PROJECT_ID` | `projectId` ở bước 2 |
   | `ALLOWED_ORIGINS` | `FRONTEND`, ví dụ `https://chesspractice.vercel.app` (không có `/` ở cuối) |

   `ALLOWED_ORIGINS` có thể điền theo tên project Vercel bạn định đặt; nếu sai thì sửa lại ở bước 6.
3. Chờ deploy xong (khoảng 3–5 phút). Copy địa chỉ service, đây là `BACKEND`.
4. Kiểm tra: mở `BACKEND/healthz` → trang trắng, không báo lỗi là OK.

## Bước 4. Trỏ frontend về backend

Sửa [frontend/vercel.json](frontend/vercel.json): thay `YOUR-BACKEND.onrender.com` bằng host của `BACKEND`
(không kèm `https://`). Rồi:

```bash
git add frontend/vercel.json
git commit -m "Point Vercel rewrite to Render backend"
git push
```

## Bước 5. Vercel (frontend)

1. <https://vercel.com> → **Add New → Project** → import repo `chesspractice`.
2. **Project Name**: `chesspractice` (quyết định `FRONTEND`). **Root Directory**: `frontend`.
3. **Environment Variables**:

   | Biến | Giá trị |
   |---|---|
   | `VITE_API_URL` | `/api` |
   | `VITE_WS_URL` | `BACKEND` |
   | `VITE_FIREBASE_API_KEY` | `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |

4. **Deploy**. Domain hiển thị ở mục **Domains** chính là `FRONTEND`.

## Bước 6. Nối các phần lại

1. Firebase → **Authentication → Settings → Authorized domains → Add** → host của `FRONTEND`
   (ví dụ `chesspractice.vercel.app`).
2. Nếu `FRONTEND` khác giá trị đã điền ở bước 3: Render → service → **Environment** → sửa `ALLOWED_ORIGINS` → Save
   (Render tự deploy lại).
3. Kiểm tra trên PC và điện thoại:
   - Mở `FRONTEND`. Nếu server đang ngủ, banner "Đang khởi động server…" hiện khoảng 1 phút, đó là bình thường.
   - Đăng nhập → thêm một chapter → ôn vài nước.
   - Mở cùng tài khoản trên thiết bị thứ hai: dữ liệu phải giống nhau.

## Bước 7. Backup hằng đêm

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Giá trị |
|---|---|
| `NEON_BACKUP_URL` | `NEON_URL` (**không** thêm `&pool_max_conn_idle_time`) |
| `BACKUP_PASSPHRASE` | mật khẩu dài, ngẫu nhiên. **Lưu lại cẩn thận**, mất là không mở được backup |

Rồi vào **Actions → backup → Run workflow** để chạy thử. Từ đó workflow tự chạy lúc 02:00 hằng đêm và giữ 30 ngày.

Khôi phục (Git Bash): tải artifact ở tab Actions, giải nén, rồi chạy

```bash
gpg -d -o backup.dump chesspractice-YYYY-MM-DD.dump.gpg
"/c/Program Files/PostgreSQL/16/bin/pg_restore.exe" --clean --if-exists --no-owner -d "NEON_URL" backup.dump
```

---

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Bấm đăng nhập báo `auth/unauthorized-domain` | Chưa thêm domain Vercel vào Firebase | Bước 6.1 |
| Mở app, gọi `/api/...` trả 404 | `vercel.json` vẫn là `YOUR-BACKEND` hoặc sai host | Bước 4 |
| Đăng nhập được nhưng không đồng bộ giữa 2 thiết bị | WebSocket bị chặn vì `ALLOWED_ORIGINS` sai | Bước 6.2, kiểm tra không có `/` ở cuối |
| Render deploy lỗi `FIREBASE_PROJECT_ID is required` | Thiếu biến | Bước 3.2 |
| Render log báo lỗi kết nối Postgres | `POSTGRES_URL` sai hoặc thiếu `sslmode=require` | Copy lại từ Neon |
| Workflow backup lỗi `invalid URI query parameter` | `NEON_BACKUP_URL` có `pool_max_conn_idle_time` | Bỏ tham số đó (bước 7) |
| Workflow backup không tự chạy nữa | GitHub tắt lịch sau 60 ngày repo không có hoạt động | Actions → backup → **Enable workflow** |

---

## Chạy trên máy (dev)

```bash
# DB dev: dùng Postgres 16 trên máy (cần mật khẩu user postgres)
"/c/Program Files/PostgreSQL/16/bin/createdb.exe" -U postgres chesspractice_dev
"/c/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -d chesspractice_dev -f backend/schema.sql

# backend: copy backend/.env.example → backend/.env, điền
#   POSTGRES_URL=postgres://postgres:<mật khẩu>@localhost:5432/chesspractice_dev?sslmode=disable
#   FIREBASE_PROJECT_ID=<projectId>
cd backend && go run ./cmd/server

# frontend: copy frontend/.env.example → frontend/.env (VITE_API_URL=http://localhost:8080 + biến Firebase)
cd frontend && npm install && npm run dev      # http://localhost:5173
```
