# Change Request: Cert OCR — Review, Verify & Traceability (v2 — chuẩn hệ thống)

| Mục | Nội dung |
|-----|----------|
| **CR ID** | CR-CERT-002 (v2) |
| **Tiêu đề** | Luồng review sau OCR, verify tính xác thực & traceability cho chứng chỉ |
| **Liên quan** | CR-CERT-001 (Upload → OCR → lưu DB), CR-OCR-01, Spec v2 (§11, §13, §39, §49) |
| **Trạng thái** | Draft v2 |
| **Người tạo** | Nhat Duong Hung |
| **Ngày** | 2026-09-08 |
| **Ưu tiên** | High |
| **Loại** | Feature / Data integrity |
| **Đối tượng đọc** | AI agent để code vào repo |

> **Thay đổi so với v1 (bản trước):** Bản v1 mô tả nghiệp vụ đúng nhưng **Data Model bị lệch**
> với hệ thống hiện tại (viết SQL `CREATE TABLE` snake_case, ID INTEGER, thêm cột `status` trùng
> với derived-status). Bản v2 này **giữ nguyên toàn bộ nghiệp vụ**, chỉ **viết lại Data Model
> thành Prisma migration mở rộng model có sẵn**, bỏ nguồn-sự-thật trùng lặp, chuẩn hoá
> naming/role/AuditAction theo repo. Xem [§0 Changelog](#0-changelog-v1--v2).

---

## 0. Changelog v1 → v2

| # | v1 (lệch) | v2 (chuẩn hệ thống) |
|---|---|---|
| C1 | SQL `CREATE TABLE cert_master / user_cert / cert_audit_log` (snake_case, ID INTEGER) | **Prisma migration mở rộng** `Certification` / `MemberCertification` / `CertificateFile` / `AuditLog` đã có (PascalCase model, camelCase field, `String @id @default(cuid())`) |
| C2 | Thêm cột `status = pending/verified/rejected` mới | **Bỏ.** Dùng lại `verificationStatus` (PENDING/VERIFIED/REJECTED) sẵn có; trạng thái tổng thể vẫn **DERIVED** qua `getEffectiveStatus()` — không tạo nguồn sự thật thứ 2 |
| C3 | `raw_ocr_text`, `extracted_fields`, `reject_reason`, `verified_by/at` là cột mới | **Bỏ.** Đã tồn tại: `CertificateExtraction.rawJson`, `MemberCertification.extractionRaw`, `rejectionReason`; bổ sung `verifiedById`/`verifiedAt` (chưa có) |
| C4 | Chỉ thêm mới **3 field thực sự thiếu** | `Certification.verifyUrlPattern`, `MemberCertification.verifyUrl`, `CertificateFile.imageHash` |
| C5 | "Đề xuất cert mới chờ duyệt" chưa có schema | Thêm model **`CertificationSuggestion`** (Prisma) + enum `SuggestionStatus` |
| C6 | Action ghi audit dạng string tự do; role "user/HR" | Dùng enum **`AuditAction`** (thêm giá trị mới); role theo **MEMBER/ADMIN** hiện có |
| C7 | Fuzzy match gợi ý dùng lib Levenshtein mới | Dùng lại logic token-overlap/`_ratio` đã có (giữ tinh thần pip-free / không thêm dependency) |

---

## 1. Bối cảnh & Vấn đề

Ở CR-CERT-001, hệ thống cho phép upload ảnh chứng chỉ, EasyOCR extract thông tin và lưu DB.
Còn 2 vấn đề chưa xử lý:

1. **OCR không đảm bảo tính xác thực.** OCR chỉ *đọc chữ*, không chứng minh cert là thật. User
   có thể upload ảnh giả/chỉnh sửa/khai khống.
2. **Thiếu traceability.** Cần giữ bằng chứng gốc (ảnh + hash + raw OCR) và nhật ký ai nộp/duyệt/sửa.

> **Nguyên tắc nền tảng (khớp Spec v2 §13/§39):** **Extract ≠ Verify.**
> - *Extract*: đọc chữ từ ảnh → EasyOCR + user chỉnh sửa.
> - *Verify*: khẳng định cert có thật → cần **bằng chứng gốc + credential ID/verify link + admin duyệt**.

---

## 2. Mục tiêu

1. Thêm **Extract Review Form** để user tự sửa thông tin trước khi lưu (không auto-save kết quả OCR).
2. Luồng **admin thêm cert mới** vào danh mục (chống trùng bằng fuzzy match).
3. **Lưu bằng chứng gốc** (ảnh + `imageHash` + raw OCR) để đối chiếu, chống sửa.
4. Dùng luồng trạng thái xác minh **`PENDING → VERIFIED/REJECTED`** (đã có `verificationStatus`).
5. **Audit log** toàn vòng đời (submit / edit / approve / reject / suggest) qua `AuditLog` sẵn có.

### Ngoài phạm vi
- API verify tự động với nhà cấp (Credly/Accredible…) — CR sau (Mức 3).
- Chữ ký số / blockchain của cert.
- Role HR/Manager riêng — hiện chỉ MEMBER/ADMIN (Spec §56 out-of-scope).

---

## 3. Data Model — Prisma migration (KHÔNG dùng SQL tay)

> Toàn bộ thay đổi là **additive**, không breaking. Naming theo repo: model PascalCase, field camelCase, ID `String @id @default(cuid())`.

### 3.1 Mở rộng `Certification` (danh mục cert — tương đương "cert_master")
```prisma
model Certification {
  // ...existing fields (Spec v2 §6)...
  verifyUrlPattern String?   // VD "https://www.credly.com/badges/{credentialId}"
}
```

### 3.2 Mở rộng `MemberCertification` (1 lần member đạt cert — tương đương "user_cert")
```prisma
model MemberCertification {
  // ...existing fields (Spec v2 §11 + CR-OCR-01 §5)...
  // ĐÃ CÓ: verificationStatus, rejectionReason, extractionRaw, extractionConfidence,
  //        extractionSource, certificateNumber, issuedDate, expirationDate, files[]
  // BỔ SUNG: verifyUrl, verifiedById, verifiedAt
  verifyUrl String?
  verifiedById String?
  verifiedAt   DateTime?
}
```
> **Không** thêm cột `status` mới. "Chỉ verified mới tính chính thức" do `getEffectiveStatus()`
> quyết định (completion gate hiện tại = CERTIFIED + VERIFIED). Đây là **single source of truth**.

### 3.3 Mở rộng `CertificateFile` (bằng chứng gốc)
```prisma
model CertificateFile {
  // ...existing fields (CR-OCR-01 §37)...
  imageHash String?   // SHA-256 của file gốc, chống chỉnh sửa sau khi nộp
  @@index([imageHash])
}
```

### 3.4 Model MỚI: `CertificationSuggestion` (member đề xuất cert mới chờ duyệt)
```prisma
model CertificationSuggestion {
  id            String   @id @default(cuid())

  suggestedById String
  suggestedBy   User     @relation("CertSuggestedBy", fields: [suggestedById], references: [id])

  code          String?              // mã cert đề xuất (nếu OCR đọc được)
  name          String               // tên cert (bắt buộc)
  provider      String?

  // Liên kết bằng chứng: đề xuất thường đi kèm 1 lần upload
  memberCertificationId String?
  memberCertification   MemberCertification? @relation(fields: [memberCertificationId], references: [id])

  status        SuggestionStatus @default(PENDING)
  reviewedById  String?
  reviewedAt    DateTime?
  rejectReason  String?

  // Nếu admin approve → cert được tạo trong catalog, tham chiếu lại
  approvedCertificationId String?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([suggestedById])
  @@index([status])
}

enum SuggestionStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### 3.5 Bổ sung `AuditAction` (enum sẵn có trong `features/audit/log`)
```
SUBMIT_CERTIFICATE            // member nộp (review form → save PENDING)
EDIT_CERTIFICATE_EXTRACTION   // member sửa field OCR trước khi save
VERIFY_CERTIFICATE            // (đã có ở Spec §49) admin approve
REJECT_CERTIFICATE            // (đã có ở Spec §49) admin reject
SUGGEST_CERTIFICATION         // member đề xuất cert mới
APPROVE_SUGGESTION            // admin duyệt đề xuất → tạo Certification
REJECT_SUGGESTION             // admin từ chối đề xuất
```

> **Bảng ánh xạ v1 → hệ thống (để agent không tạo bảng trùng):**
>
> | Bảng trong CR v1 | Model Prisma dùng | Thêm gì |
> |---|---|---|
> | `cert_master` | `Certification` | `verifyUrlPattern` |
> | `user_cert` | `MemberCertification` | `verifyUrl`, `verifiedById`, `verifiedAt` (còn lại đã có) |
> | `cert_audit_log` | `AuditLog` | thêm `AuditAction` mới |
> | ảnh gốc | `CertificateFile` | `imageHash` |
> | đề xuất cert mới | **`CertificationSuggestion`** (mới) | model + enum |

---

## 4. Phạm vi thay đổi (UI/Logic)

### 4.1 Màn hình 1 — Extract Review Form (MEMBER + ADMIN)
Component trong `src/components/features/` (mẫu từ `ocr-extract-panel` đã có). Sau upload +
OCR: form 2 cột — **ảnh gốc bên trái**, **field extract bên phải** để user sửa.

- Field có confidence **< ngưỡng (mặc định 0.7)** → highlight vàng.
- Tách 2 nhóm field:
  - **Master data** (`code`, `name`, `provider`): nếu đã bind vào `Certification` → **read-only**.
  - **Instance data** (`certificateNumber`, `verifyUrl`, `issuedDate`, `expirationDate`): sửa thoải mái.
- 3 lựa chọn (radio) khi cert chưa khớp danh mục:
  1. **Gán vào cert đã có** — dropdown gợi ý top 3–5 fuzzy match.
  2. **Tạo cert mới vào danh mục** — *chỉ ADMIN*.
  3. **Đề xuất cert mới chờ duyệt** — MEMBER → tạo `CertificationSuggestion` (PENDING).
- Nút **Save** → validate (Zod) → tạo/cập nhật `MemberCertification` với `verificationStatus = PENDING`
  → `logAudit(SUBMIT_CERTIFICATE)`.

### 4.2 Màn hình 2 — Admin Add / Approve (ADMIN)
- Admin chọn "Tạo cert mới" → form bắt buộc `code`, `name`, `provider` (+ tuỳ chọn `verifyUrlPattern`).
- Trước khi insert → **fuzzy match** với catalog. Nếu tương tự cao → cảnh báo.
- Trang **duyệt PENDING**: danh sách `MemberCertification` (verificationStatus = PENDING) + danh sách
  `CertificationSuggestion` (status = PENDING). Xem ảnh gốc cạnh data → **Approve / Reject** (kèm lý do).

---

## 5. Luồng nghiệp vụ

```
Upload ảnh (CertificateFile + imageHash SHA-256)
   │
   ▼
OCR extract (EasyOCR) → lưu CertificateExtraction.rawJson / MemberCertification.extractionRaw
   │
   ▼
Extract Review Form → user sửa field (confidence < 0.7 highlight)
   │
   ├─ Khớp danh mục?  ──► gán certificationId (master read-only)
   ├─ Chưa khớp + ADMIN ──► tạo Certification mới (fuzzy match chống trùng)
   └─ Chưa khớp + MEMBER ──► CertificationSuggestion (PENDING) + logAudit(SUGGEST_CERTIFICATION)
   │
   ▼
Save MemberCertification (verificationStatus = PENDING) + logAudit(SUBMIT_CERTIFICATE)
   │
   ▼
Admin review: ảnh gốc cạnh data + credentialNumber/verifyUrl
   │
   ├─ Approve ──► verificationStatus = VERIFIED + verifiedById/At + logAudit(VERIFY_CERTIFICATE)
   └─ Reject  ──► verificationStatus = REJECTED + rejectionReason  + logAudit(REJECT_CERTIFICATE)
```

Chỉ khi **`verificationStatus = VERIFIED`** thì `getEffectiveStatus()` mới cho ra `COMPLETED`
(và mới kích hoạt gold award). Đây là hành vi **đã có sẵn**, CR này không đổi.

---

## 6. Cơ chế Verify (3 mức, tăng dần)

| Mức | Cách làm | Áp dụng |
|-----|----------|---------|
| **Mức 1 – Manual review** | Admin nhìn ảnh gốc cạnh data → Approve/Reject | **MVP (CR này)** |
| **Mức 2 – Credential ID / verify link** | Bắt buộc `certificateNumber` hoặc `verifyUrl`; admin đối chiếu qua trang tra cứu công khai; `verifyUrlPattern` tự dựng link | CR này (khuyến nghị) |
| **Mức 3 – API verification** | Gọi API nhà cấp (Credly/Accredible) verify tự động | CR sau |

> `verifyUrlPattern` trên `Certification` + `certificateNumber` trên `MemberCertification` cho phép
> dựng sẵn link verify: thay `{credentialId}` bằng `certificateNumber` → admin bấm 1 phát ra trang gốc.

---

## 7. Validation Rules (Zod — `src/features/*/schemas.ts`)

| Field | Rule |
|-------|------|
| `code` (Certification) | Bắt buộc khi tạo master, UNIQUE, theo regex quy định |
| `name` (Certification) | Bắt buộc, không rỗng |
| `certificateNumber` | Khuyến nghị bắt buộc (mở đường verify Mức 2) |
| `issuedDate` / `expirationDate` | Date hợp lệ; **expirationDate > issuedDate** |
| Tạo cert mới | Fuzzy match, cảnh báo nếu similarity cao |
| File ảnh | Bắt buộc; tính & lưu `imageHash` (SHA-256) |
| `CertificationSuggestion.name` | Bắt buộc |

---

## 8. Phân quyền (MEMBER / ADMIN)

| Hành động | MEMBER | ADMIN |
|-----------|:------:|:-----:|
| Upload ảnh + extract + sửa instance data (của mình) | ✅ | ✅ |
| Sửa master data (code/name của catalog) | ❌ read-only | ✅ |
| Tạo cert mới vào catalog | ❌ | ✅ |
| Đề xuất cert mới (CertificationSuggestion) | ✅ | ✅ |
| Approve/Reject MemberCertification | ❌ | ✅ |
| Approve/Reject Suggestion | ❌ | ✅ |

Enforce server-side bằng `requireSession()` / `requireAdmin()` (`lib/authz.ts`). Member chỉ đụng
dữ liệu của mình.

---

## 9. Server Actions (theo pattern `wrapAction` + `logAudit` + `revalidateTracker`)

```
src/features/ocr/          (mở rộng)
  createMemberCertificationFromExtraction()  // save MemberCertification PENDING + audit SUBMIT_CERTIFICATE
src/features/certifications/
  createCertification()     // fuzzy-match trước khi tạo (admin) + cảnh báo trùng
  suggestCertifications()   // fuzzy-search catalog cho dropdown review form
src/features/files/
  verifyCertificate()       // verificationStatus=VERIFIED + verifiedById/At + audit
  rejectCertificate()       // verificationStatus=REJECTED + rejectionReason + audit
src/features/suggestions/   (module mới, nhỏ)
  suggestCertification()    // member tạo CertificationSuggestion + audit
  approveSuggestion()       // admin: tạo Certification + link + audit
  rejectSuggestion()        // admin: reject + reason + audit
```

Mọi mutation: `requireAdmin()`/`requireSession()` → thao tác Prisma (transaction nếu có award) →
`logAudit(...)` → `revalidateTracker()`.

---

## 10. Acceptance Criteria

1. ✅ Kết quả OCR **không** auto-save; luôn qua Extract Review Form.
2. ✅ Field confidence < ngưỡng được highlight.
3. ✅ Master data read-only khi cert đã bind `Certification`.
4. ✅ Admin tạo cert mới bị cảnh báo khi trùng (fuzzy match, không thêm lib mới).
5. ✅ MEMBER không tự thêm catalog, chỉ gửi `CertificationSuggestion` (PENDING).
6. ✅ Mỗi lần nộp lưu đủ: file (`imageHash`), `extractionRaw`, `certificateNumber`, `verifyUrl`.
7. ✅ Luồng `PENDING → VERIFIED/REJECTED` chạy trên `verificationStatus`; **chỉ VERIFIED** cho ra
   `COMPLETED` qua `getEffectiveStatus()` (không thêm cột status mới).
8. ✅ Mọi thao tác ghi `AuditLog` (append-only) với `AuditAction` mới.
9. ✅ Không tạo bảng snake_case trùng; chỉ mở rộng model Prisma + 1 model `CertificationSuggestion`.

---

## 11. Migration Notes

- `prisma migrate dev`: thêm `verifyUrlPattern`, `verifyUrl`, `verifiedById`, `verifiedAt`, `imageHash`,
  model `CertificationSuggestion` + enum `SuggestionStatus`, mở rộng enum `AuditAction`.
- **Không** migrate dữ liệu sang bảng mới (không có bảng mới cho cert). Dữ liệu CR-CERT-001 giữ nguyên.
- Backfill `imageHash` cho `CertificateFile` cũ (nếu còn file gốc): job 1 lần tính SHA-256.
- SQLite MVP: lưu file DB cố định (`file:./dev.db`), **không** in-memory; **không** để
  `prisma migrate reset` trong script `dev` (tránh mất data mỗi lần start).
- Feature-flag `FEATURE_CERT_REVIEW_VERIFY` để bật/tắt.

---

## 12. Rủi ro & Giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|-----------|
| User upload cert giả | Manual review (Mức 1) + bắt buộc credentialNumber/verifyUrl (Mức 2) |
| Catalog phình/trùng | Fuzzy match + chỉ ADMIN tạo `Certification`; MEMBER chỉ suggest |
| Ảnh gốc bị thay sau khi nộp | `imageHash` SHA-256, đối chiếu khi audit |
| Tạo nguồn-sự-thật trùng | **Không** thêm cột `status`; dùng `verificationStatus` + `getEffectiveStatus()` |
| Agent tạo bảng snake_case mới | Bảng ánh xạ §3 + Changelog §0 nêu rõ dùng model có sẵn |

---

## Phụ lục — Vì sao bỏ cột `status` của v1

Hệ thống hiện tại đã chốt nguyên tắc **derived-status** (Spec v2 D1): trạng thái tổng thể
(`NOT_STARTED/IN_PROGRESS/COMPLETED/OVERDUE/EXEMPTED/CERTIFICATE_EXPIRED`) được **tính** bởi
`getEffectiveStatus()`, không lưu. Riêng **trạng thái xác minh** thì đã có cột riêng
`verificationStatus (PENDING/VERIFIED/REJECTED)`. Thêm một cột `status` thứ 3 như v1 sẽ tạo
**nguồn sự thật trùng lặp** → đúng lỗi mà kiến trúc đã cố tránh. Vì vậy v2 ánh xạ hoàn toàn về
`verificationStatus` + completion gate sẵn có.