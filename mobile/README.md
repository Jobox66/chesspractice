# chesspractice — app Android (React Native / Expo)

App luyện khai cuộc trên điện thoại, dùng chung tài khoản và dữ liệu với bản web.

| Phần | Công nghệ |
|---|---|
| App | Expo SDK 58 (React Native 0.88), Expo Router, TypeScript |
| Bàn cờ | Tự vẽ bằng `react-native-svg` (quân Merida của bản web), chạm hoặc kéo để đi |
| Logic cờ, SRS | `chessops` 0.14, `ts-fsrs` 5.3 (cùng phiên bản với web để card FSRS khớp nhau) |
| Đăng nhập | **Khoá đồng bộ** (`POST /login-key`, khoá = `SYNC_KEY` trên Render, lưu trong `expo-secure-store`, phiên hết hạn thì tự đăng nhập lại), hoặc Firebase Auth REST (email + mật khẩu) → `POST /login`. Cả hai gửi `client: "mobile"` → nhận `sessionToken`, gửi lại dưới dạng `Authorization: Bearer` |
| Đồng bộ | HTTP (`/repertoire`, `/chapter`) + WebSocket như web (`training_updated`, `chapter_renamed`, `chapter_deleted`, ...) |
| Lưu trên máy | Token: `expo-secure-store`. Chương offline: mỗi chương một file JSON trong thư mục app |

## Tính năng bản đầu

- **Offline (không đăng nhập):** dữ liệu chỉ nằm trên máy; lần đầu mở có sẵn 1 chương mẫu.
- **Đăng nhập:** dùng repertoire trên server, mọi lần học/ôn được gửi lên server (khi mất mạng thì xếp hàng chờ, gửi lại khi có mạng, chỉ giữ trong bộ nhớ khi app còn chạy).
- Danh sách chương: số nước cần ôn / chưa học; đổi tên, xoá (nhấn giữ hoặc nút ⋮).
- **Học mới:** mũi tên xanh chỉ nước; hết một biến thì có thể kiểm tra lại cả biến không mũi tên.
- **Ôn tập:** tự nhớ nước; đúng → FSRS "Good", sai → "Again" + phải đi lại nước đúng; nước khác cũng có trong repertoire thì không tính.
- Thêm chương: thư viện khai cuộc có sẵn (như bản web), dán PGN, hoặc mở file `.pgn`.

Chưa có: chế độ sửa cây nước đi, đăng nhập Google, luyện repertoire của người khác (collaborator), âm thanh. Xem câu hỏi ở `docs/w_doc/app.md`.

## Cấu hình

`mobile/.env` (không commit; xem `.env.example`):

```
EXPO_PUBLIC_API_URL=https://chesspractice-backend.onrender.com
EXPO_PUBLIC_FIREBASE_API_KEY=<giống VITE_FIREBASE_API_KEY của web>
```

`.easignore` giống `.gitignore` nhưng **không** bỏ `.env`, nên EAS Build vẫn nhận được 2 biến này.

> Backend phải là bản có hỗ trợ bearer token (commit cùng với thư mục `mobile/`). Bản backend cũ trả lỗi "thiếu sessionToken" khi đăng nhập từ app.

## Build file APK bằng Android Studio (build trên máy)

Làm trên máy nhà (Windows 11) hoặc MacBook, không làm trên máy công ty.

1. Cài [Android Studio](https://developer.android.com/studio). Lần mở đầu tiên chọn **Standard**, để nó tự tải Android SDK.
2. Cài Node 22 trở lên, clone repo, rồi copy `mobile/.env` từ máy công ty sang. File này không có trong git, thiếu thì app không có URL backend và Firebase key.
3. Tạo thư mục native `android/` (đã gitignore, sinh lại được bất cứ lúc nào):
   ```powershell
   cd mobile
   npm install
   npm run prebuild          # = expo prebuild -p android --clean
   ```
4. Android Studio → **Open** → chọn `mobile/android` → đợi Gradle sync xong (lần đầu khá lâu).
5. **Build → Generate Bundles / APKs → Build APK(s)**. Chọn biến thể **release**: menu **Build → Select Build Variant** → `app` = `release`. Bản `debug` cần máy tính chạy Metro mới mở được.

   Hoặc chạy bằng dòng lệnh, không cần mở giao diện:
   ```powershell
   cd android
   .\gradlew assembleRelease      # macOS: ./gradlew assembleRelease
   ```
6. File APK nằm ở `mobile/android/app/build/outputs/apk/release/app-release.apk`. Copy sang điện thoại rồi cài.

Ghi chú:
- **Chữ ký:** bản release ký bằng `debug.keystore` có sẵn trong template của Expo. Mỗi lần `prebuild` sinh ra đúng file đó, nên APK build ở máy nhà và trên Mac cài đè lên nhau được. Khoá này công khai; với app cá nhân không phát hành lên Play Store thì chấp nhận được.
- **Lỗi JDK khi Gradle sync:** vào Settings → Build Tools → Gradle → **Gradle JDK**, chọn JDK đi kèm Android Studio (JetBrains Runtime) hoặc JDK 17.
- **Sau khi sửa `app.json`** (tên, icon, plugin, `versionCode`): chạy lại `npm run prebuild`. Chỉ sửa code trong `src/` thì không cần, build lại là đủ.
- `.env` được đọc lúc đóng gói JS. Sửa `.env` xong phải build lại.

## Build file APK bằng GitHub Actions (không cần cài gì)

Workflow `.github/workflows/android.yml` chạy đúng các bước ở trên (`expo prebuild` + `gradlew assembleRelease`) trên máy của GitHub. APK ký cùng khoá với bản build bằng Android Studio, nên cài đè lên nhau được.

1. Một lần duy nhất: tạo secret `EXPO_PUBLIC_FIREBASE_API_KEY` trong **Settings → Secrets and variables → Actions**. Có thể tạo thêm `EXPO_PUBLIC_API_URL`, không có thì dùng URL Render mặc định.
2. Push code có sửa trong `mobile/` là workflow tự chạy. Hoặc vào **Actions → android → Run workflow**.
3. Build xong, vào trang của lần chạy đó → **Artifacts** → tải `chesspractice-apk`. Artifact giữ 30 ngày.

Workflow chỉ build cho điện thoại thật (`arm64-v8a`, `armeabi-v7a`), không build cho emulator x86.

## Build file APK bằng EAS (cloud, không cần Android Studio)

Dùng Expo Build (EAS) miễn phí, build trên cloud:

```powershell
cd mobile
npm install
npx eas-cli@latest login                                   # tạo tài khoản expo.dev miễn phí nếu chưa có
npx eas-cli@latest build -p android --profile preview      # profile "preview" ra file .apk
```

- Lần đầu: trả lời **Yes** khi được hỏi tạo project EAS (lệnh sẽ ghi `extra.eas.projectId` vào `app.json`, commit thay đổi đó) và **Yes** khi hỏi tạo Android keystore (Expo giữ keystore, các bản sau ký cùng khoá nên cài đè được).
- Build xong (khoảng 10–20 phút, gói free phải xếp hàng), terminal in link tải `.apk`. Mở link trên điện thoại → tải → cài (cho phép "Cài ứng dụng không rõ nguồn gốc").
- Bản sau: tăng `android.versionCode` trong `app.json` (và `version` nếu muốn), rồi chạy lại lệnh build.

## Chạy khi phát triển

```powershell
cd mobile
npm install
npx tsc --noEmit                 # kiểm tra kiểu
npx expo start                   # quét QR bằng app Expo Go (bản hỗ trợ SDK 58) trên điện thoại cùng mạng Wi-Fi
```

App chỉ dùng các module có sẵn trong Expo Go, nên chạy thử bằng Expo Go được mà không cần build APK.
