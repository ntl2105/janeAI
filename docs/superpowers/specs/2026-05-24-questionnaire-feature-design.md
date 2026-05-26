# Design Spec: Questionnaire Feature for Jane AI

**Date:** 2026-05-24  
**Status:** Approved  
**Scope:** Thêm tính năng tạo bảng hỏi từ JD, gửi cho sếp (hiring manager) xác nhận, dùng câu trả lời để tinh chỉnh JD.

---

## 1. Problem

Recruiter generate JD xong nhưng thiếu thông tin thực tế từ hiring manager — dẫn đến tuyển sai người hoặc mất thời gian phỏng vấn UV không phù hợp. JD hiện tại chỉ dựa trên yêu cầu thô, chưa capture được context sâu hơn mà chỉ sếp mới biết.

---

## 2. Solution

Sau khi generate JD, recruiter có thể tạo một bảng hỏi 7 nhóm câu hỏi gửi cho sếp qua link (không cần login). Jane AI pre-fill câu trả lời từ JD, sếp chỉ cần xem lại và sửa. Sau khi sếp submit, recruiter dùng câu trả lời để AI tinh chỉnh lại JD.

---

## 3. User Flow

```
[Recruiter] Generate JD xong
    → Nhấn "Tạo bảng hỏi cho sếp"
    → Jane generate questions từ JD (AI pre-fill answers)
    → Lưu vào Supabase, sinh unique token
    → Recruiter copy link /q/[token] → gửi Zalo/email cho sếp

[Sếp] Mở link (không cần login)
    → Thấy wizard 7 bước, mỗi bước 1 nhóm câu hỏi
    → Câu trả lời đã được Jane pre-fill, sếp chỉ confirm/sửa
    → Submit → lưu answers vào Supabase

[Recruiter] Vào lại Jane AI, thấy badge "Sếp đã điền xong"
    → Xem tổng hợp câu trả lời
    → Nhấn "Tinh chỉnh JD" → AI đọc JD gốc + answers → gợi ý JD mới
    → Recruiter review, confirm → JD mới lưu vào history
```

---

## 4. Questionnaire Structure (7 Nhóm)

Tất cả câu hỏi được thiết kế để **sếp (hiring manager) trả lời**, không phải HR hay recruiter.

### #1 Outcome of the job
- Vị trí này được tạo ra để giải quyết vấn đề gì? *(open — AI pre-fill)*
- Mức độ urgent? *(Yes/No — AI pre-fill)*
- Vị trí cần bảo mật không? *(Yes/No — AI pre-fill)*

### #2 History of the job
- Đã tuyển bao lâu? *(multiple choice)*
- Anh/chị đã gặp ứng viên nào chưa? Lý do chưa chốt là gì? *(open)*

### #3 Requirement of the job
- Số năm kinh nghiệm tối thiểu, có linh hoạt không? *(multiple choice + checkbox — AI pre-fill)*
- Tech stack Must vs Nice-to-have *(toggle per skill — AI pre-fill từ JD)*
- Tiếng Anh tối thiểu *(radio — AI pre-fill)*

### #4 Culture fit
- Phong cách làm việc phù hợp với team *(checkbox, multi-select)*
- Thêm về văn hoá team *(open, không bắt buộc)*

### #5 Package
- Lương có thể flex không? *(Yes/No — AI pre-fill)*
- Làm trong team anh/chị có gì đặc biệt mà nơi khác không có? *(open)*

### #6 Interview process
- Quy trình mấy vòng? *(multiple choice)*
- Có bài test kỹ thuật không? *(multiple choice)*
- Lịch available để phỏng vấn? *(open)*

### #7 Unique Selling Point
- Tại sao ứng viên giỏi nên về team mình? *(open)*
- Anh/chị hình dung người này sẽ grow thế nào trong 1-2 năm? *(open)*
- Challenge / pain point thực tế của vị trí? *(open)*

---

## 5. UX Design Decisions

**Wizard từng bước:** Hiển thị 1 nhóm tại một thời điểm với progress "1/7". Sếp không thấy toàn bộ độ dài ngay từ đầu.

**AI pre-fill:** Jane đọc JD và pre-fill những câu có thể suy ra được. Câu pre-fill có viền vàng + label "✦ Jane gợi ý". Giảm effort của sếp từ "điền từ đầu" thành "confirm/sửa".

**Không cần login:** Sếp truy cập qua link `/q/[token]`, submit xong là xong. Token hết hạn sau 30 ngày.

**Framing câu hỏi:** Tất cả câu hỏi phải ở góc nhìn của hiring manager — những gì sếp biết và quyết định được, không phải HR (lương thang bảng, gói bảo hiểm công ty).

---

## 6. Data Schema (Supabase)

```sql
-- Bảng questionnaire
questionnaires (
  id uuid PRIMARY KEY,
  jd_history_id uuid REFERENCES jd_history(id),
  token text UNIQUE NOT NULL,          -- random token cho public link
  questions jsonb NOT NULL,            -- array of question objects
  prefilled_answers jsonb,             -- AI pre-filled answers
  status text DEFAULT 'pending',       -- pending | answered
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
)

-- Bảng answers
questionnaire_answers (
  id uuid PRIMARY KEY,
  questionnaire_id uuid REFERENCES questionnaires(id),
  answers jsonb NOT NULL,              -- map question_id → answer
  submitted_at timestamptz DEFAULT now()
)
```

`jd_history_id` làm FK vào bảng hiện có — cấu trúc này dễ extend lên ATS sau (thêm `jobs`, `candidates` link vào cùng).

---

## 7. API Routes (Next.js)

| Method | Route | Mô tả |
|--------|-------|-------|
| POST | `/api/questionnaire/generate` | Generate questions + pre-fill từ JD, trả về token |
| GET | `/api/q/[token]` | Lấy questionnaire (public, no auth) |
| POST | `/api/q/[token]/submit` | Sếp submit answers |
| GET | `/api/questionnaire/[id]/answers` | Recruiter xem answers |
| POST | `/api/questionnaire/[id]/refine-jd` | AI tinh chỉnh JD từ answers |

---

## 8. AI Prompts (2 calls)

**Call 1 — Generate questions + pre-fill:**  
Input: JD text  
Output: Array 7 nhóm câu hỏi + pre-filled answers cho những câu có thể suy ra từ JD

**Call 2 — Refine JD:**  
Input: JD gốc + answers từ sếp  
Output: JD mới với highlight những chỗ thay đổi, kèm giải thích ngắn tại sao thay đổi

---

## 9. Out of Scope (v1)

- Notification email/Zalo khi sếp submit
- Multiple reviewers trên cùng một bảng hỏi
- Quản lý/chỉnh sửa question bank
- Auth cho sếp
- Expiry reminder

---

## 10. Future (ATS Extension)

Schema đã chuẩn bị sẵn FK vào `jd_history`. Khi extend lên ATS chỉ cần thêm:
- Bảng `jobs` (nhiều JD version → 1 job)
- Bảng `candidates` (link với job)
- Bảng `interviews` (link với questionnaire answers)
