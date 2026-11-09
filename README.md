# NestJS Tutorial

Dự án thực hành NestJS bao gồm API Hello World, Swagger OpenAPI documentation, quản lý cấu hình môi trường và tích hợp đa ngôn ngữ (i18n).

## Yêu cầu môi trường

- **Node.js**: >= 20.x (khuyến nghị Node 22 LTS)
- **Package Manager**: npm

## Cài đặt và Khởi chạy

1. **Cài đặt dependencies:**
   ```bash
   npm install
   ```

2. **Cấu hình biến môi trường:**
   Tạo file `.env` từ file mẫu `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Các biến môi trường cơ bản:
   - `PORT`: Cổng chạy ứng dụng (mặc định: `3000`)
   - `NODE_ENV`: Môi trường (`development` / `production`)

3. **Khởi chạy ứng dụng:**
   ```bash
   # Development (Watch mode)
   npm run start:dev

   # Production build & start
   npm run build
   npm run start:prod
   ```
   Ứng dụng sẽ lắng nghe tại: `http://localhost:3000`

## Tài liệu API (Swagger)

Sau khi khởi động ứng dụng, truy cập Swagger UI để xem và thử nghiệm các API:
- **Đường dẫn Swagger:** `http://localhost:3000/api`

## Đa ngôn ngữ (i18n)

Hệ thống hỗ trợ các ngôn ngữ:
- `en`: Tiếng Anh (mặc định / fallback)
- `vi`: Tiếng Việt

Thứ tự ưu tiên phân giải ngôn ngữ:
1. **Query Parameter (`?lang=vi` hoặc `?l=vi`):**
   ```bash
   curl http://localhost:3000/?lang=vi
   ```
2. **Custom Header (`x-custom-lang` hoặc `x-lang`):**
   ```bash
   curl -H "x-lang: vi" http://localhost:3000/
   ```
3. **Standard Header (`Accept-Language`):**
   ```bash
   curl -H "Accept-Language: vi" http://localhost:3000/
   ```

## Kiểm thử và Kiểm tra chất lượng Code

```bash
# Format code theo chuẩn Prettier
npm run format

# Kiểm tra linting với Oxlint
npm run lint

# Kiểm tra chuẩn SunLint (Sun* Coding Standards)
npx sunlint --all --input=src

# Chạy Unit Test
npm run test

# Chạy E2E Test
npm run test:e2e
```
