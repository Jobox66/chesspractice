# Deploy chesspractice (miễn phí)

```
Trình duyệt ──► Vercel (React)  ── /api/* ──►  Render (Go)  ──►  Neon (Postgres 16)
                     └──── WebSocket (wss://…onrender.com) ───┘
```

Làm theo thứ tự từ bước 0 đến bước 7. Ghi lại 3 địa chỉ sẽ dùng nhiều lần:

| Tên         | Ví dụ                                                                               | Lấy ở đâu                                      |
| ------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `NEON_URL` | `postgresql://USER:PASS@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` | Bước 1                                           |
| `BACKEND`  | `https://chesspractice-backend.onrender.com`                                        | Bước 3                                           |
| `FRONTEND` | `https://chesspractice.vercel.app`                                                  | Bước 5 (= tên project Vercel + `.vercel.app`) |

---

## Bước 0. Đưa code vào `main`

GitHub repo → **Pull requests → New pull request** → base `main` ← compare `deploy/neon-render-vercel`
→ **Create** → **Merge**. Sau đó cập nhật máy:

```bash
git checkout main
git pull
```

## Bước 1. Neon (database)

1. [https://neon.tech](https://neon.tech) → **New project**: region **AWS Singapore**, Postgres **16**.
   Phải là 16 để `pg_restore` 16 trên máy đọc được file backup.
2. **Connect** → copy connection string (bản thường, không chọn *pooled*). Đây là `NEON_URL`.
3. **SQL Editor** → dán toàn bộ nội dung [backend/schema.sql](backend/schema.sql) → **Run** (chỉ chạy 1 lần).

## Bước 2. Firebase (đăng nhập)

1. [https://console.firebase.google.com](https://console.firebase.google.com) → **Create a project** → tên `chesspractice`.
   Google Analytics: **tắt** (không cần). Gói mặc định là **Spark** (free), giữ nguyên.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**
   → chọn *Project support email* → **Save**. (Email/Password: bật thêm nếu muốn.)
3. **⚙ Project settings → General → Your apps → Web (`</>`)** → nickname `chesspractice-web`,
   **không** tick Firebase Hosting → **Register app** → giữ lại `apiKey`, `authDomain`, `projectId` cho bước 3 và bước 5.
4. **Không bật Storage.** Từ 02/2026, Storage bắt buộc gói Blaze (phải gắn thẻ thanh toán). Storage chỉ dùng để upload
   ảnh đại diện lúc đăng ký: thiếu nó, nút upload báo lỗi nhưng đăng ký và đăng nhập vẫn chạy (Google dùng ảnh Google).
   Vì vậy để trống `VITE_FIREBASE_STORAGE_BUCKET` ở bước 5.

## Bước 3. Render (backend)

1. [https://render.com](https://render.com) → **Sign in with GitHub** → cho phép truy cập **Only select repositories → `chesspractice`**.
2. **New → Blueprint** → chọn repo `Jobox66/chesspractice`.

   - **Blueprint Name**: `chesspractice`
   - **Branch**: `main`
   - **Blueprint Path**: để trống (mặc định `render.yaml`)

   Render đọc [render.yaml](render.yaml) và hiện sẵn service `chesspractice-backend` (Docker, Free, Singapore).
3. Điền 3 biến được hỏi (chỉ hỏi lần đầu; về sau sửa ở service → **Environment**) rồi bấm **Deploy Blueprint**:

   | Biến                   | Giá trị                                                                              |
   | ----------------------- | -------------------------------------------------------------------------------------- |
   | `POSTGRES_URL`        | `NEON_URL` + `&pool_max_conn_idle_time=4m`                                         |
   | `FIREBASE_PROJECT_ID` | `projectId` ở bước 2                                                              |
   | `ALLOWED_ORIGINS`     | `FRONTEND`, ví dụ `https://chesspractice.vercel.app` (không có `/` ở cuối) |

   `ALLOWED_ORIGINS` có thể điền theo tên project Vercel bạn định đặt; nếu sai thì sửa lại ở bước 6.

   Tuỳ chọn, thêm sau ở service → **Environment**: khoá đồng bộ cho riêng chủ app. Ai nhập đúng khoá này trên web
   (Log in → **Use sync key**) hoặc trên app (Tài khoản → **Khoá đồng bộ**) sẽ vào thẳng tài khoản `SYNC_USERNAME`,
   không cần email/Google. Phải đặt cả 2 biến, hoặc không đặt biến nào.

   | Biến            | Giá trị                                                                                        |
   | --------------- | ---------------------------------------------------------------------------------------------- |
   | `SYNC_KEY`      | Chuỗi ngẫu nhiên từ 24 ký tự trở lên, ví dụ chạy `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |
   | `SYNC_USERNAME` | username của tài khoản đã có (tạo trước bằng Google/email trên web)                         |
4. Mở service `chesspractice-backend` → tab **Logs**, chờ build xong (khoảng 3–5 phút), tới khi thấy
   `server ready on :10000` (cổng do Render tự cấp; số cổng có thể khác).
5. Copy địa chỉ ở đầu trang service (dạng `https://chesspractice-backend.onrender.com`; nếu tên đã có người dùng,
   Render thêm hậu tố như `-ab12`). Đây là `BACKEND`.
6. Kiểm tra: mở `BACKEND/healthz` → trang trắng, không báo lỗi là OK.

> Nếu Render không cho tạo Blueprint (ví dụ đòi thẻ), tạo tay: **New → Web Service** → repo `chesspractice` →
> Language **Docker**, Branch `main`, Region **Singapore**, Root Directory `backend`, Instance Type **Free**,
> thêm 4 biến môi trường (3 biến ở trên + `COOKIE_SECURE=true`), Advanced → Health Check Path `/healthz`.

## Bước 4. Trỏ frontend về backend

Sửa [frontend/vercel.json](frontend/vercel.json): thay `YOUR-BACKEND.onrender.com` bằng host của `BACKEND`
(không kèm `https://`). Rồi:

```bash
git add frontend/vercel.json
git commit -m "Point Vercel rewrite to Render backend"
git push
```

## Bước 5. Vercel (frontend)

1. [https://vercel.com](https://vercel.com) → **Add New → Project** → import repo `chesspractice`.
2. **Project Name**: `chesspractice` (quyết định `FRONTEND`). **Root Directory**: chọn đúng thư mục `frontend`
   (không chọn thư mục con) → Continue. **Framework Preset**: Vite. **Build and Output Settings**: để mặc định.
3. **Environment Variables**:

   | Biến                         | Giá trị      |
   | ----------------------------- | -------------- |
   | `VITE_API_URL`              | `/api`       |
   | `VITE_WS_URL`               | `BACKEND`    |
   | `VITE_FIREBASE_API_KEY`     | `apiKey`     |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID`  | `projectId`  |

   Không thêm `VITE_FIREBASE_STORAGE_BUCKET` (không dùng Storage, xem bước 2.4).
   Biến `VITE_*` được ghi cố định vào code lúc build: sửa biến xong phải **Deployments → … → Redeploy**.
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

| Secret                | Giá trị                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `NEON_BACKUP_URL`   | `NEON_URL` (**không** thêm `&pool_max_conn_idle_time`)                                |
| `BACKUP_PASSPHRASE` | mật khẩu dài, ngẫu nhiên. **Lưu lại cẩn thận**, mất là không mở được backup |

Rồi vào **Actions → backup → Run workflow** để chạy thử. Từ đó workflow tự chạy lúc 02:00 hằng đêm và giữ 30 ngày.

Khôi phục (Git Bash): tải artifact ở tab Actions, giải nén, rồi chạy

```bash
gpg -d -o backup.dump chesspractice-YYYY-MM-DD.dump.gpg
"/c/Program Files/PostgreSQL/16/bin/pg_restore.exe" --clean --if-exists --no-owner -d "NEON_URL" backup.dump
```

---

## Lỗi thường gặp

| Triệu chứng                                                    | Nguyên nhân                                               | Cách sửa                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Bấm đăng nhập báo `auth/unauthorized-domain`              | Chưa thêm domain Vercel vào Firebase                     | Bước 6.1                                      |
| Mở app, gọi `/api/...` trả 404                              | `vercel.json` vẫn là `YOUR-BACKEND` hoặc sai host    | Bước 4                                        |
| Đăng nhập được nhưng không đồng bộ giữa 2 thiết bị | WebSocket bị chặn vì `ALLOWED_ORIGINS` sai             | Bước 6.2, kiểm tra không có `/` ở cuối |
| Render deploy lỗi `FIREBASE_PROJECT_ID is required`           | Thiếu biến                                                | Service → **Environment**                |
| Render log báo lỗi kết nối Postgres                          | `POSTGRES_URL` sai hoặc thiếu `sslmode=require`       | Copy lại từ Neon                              |
| Workflow backup lỗi `invalid URI query parameter`             | `NEON_BACKUP_URL` có `pool_max_conn_idle_time`         | Bỏ tham số đó (bước 7)                    |
| Workflow backup không tự chạy nữa                            | GitHub tắt lịch sau 60 ngày repo không có hoạt động | Actions → backup → **Enable workflow**  |

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
