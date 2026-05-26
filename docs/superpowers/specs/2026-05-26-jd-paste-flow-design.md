# Design Spec: JD Paste Flow Redesign

**Date:** 2026-05-26  
**Status:** Approved  
**Scope:** Đổi flow chính từ "generate JD từ title + yêu cầu thô" sang "paste JD sẵn có → tạo bảng hỏi". Giữ generate JD như option phụ (accordion ẩn).

---

## 1. Problem

Flow hiện tại yêu cầu recruiter nhập title + yêu cầu thô → AI generate JD. Vấn đề: AI không có context về công ty nên bịa phần giới thiệu, quyền lợi — JD ra không on point. Recruiter (đặc biệt headhunter) thường đã có JD draft từ client, không cần generate lại từ đầu.

Output thực sự có giá trị là **JD đã tinh chỉnh sau khi sếp điền bảng hỏi** — không phải JD generate ban đầu.

---

## 2. Solution

**Flow chính mới:**  
Paste JD → Tạo bảng hỏi → Sếp điền → Refined JD

**Flow phụ (accordion ẩn):**  
"Chưa có JD? Để Jane gợi ý draft" → điền title + yêu cầu thô → AI generate draft → draft tự điền vào ô paste → đi tiếp flow chính

---

## 3. User Flow

```
[Recruiter] Mở Jane AI
    → Thấy 1 ô lớn "Paste JD vào đây"
    → Paste JD từ client
    → Nhấn "Tạo bảng hỏi cho sếp"
    → AI đọc JD, extract title, generate questions + pre-fill
    → Lưu vào jd_history + questionnaires, sinh token
    → Thấy link /q/[token] để copy gửi sếp

[Recruiter — chưa có JD]
    → Mở accordion "Chưa có JD? Để Jane gợi ý draft"
    → Điền title + yêu cầu thô
    → AI generate JD draft (labeled rõ "chưa chính xác")
    → Nhấn "Dùng draft này" → draft điền vào ô paste
    → Đi tiếp flow chính

[Sếp] Mở link, điền wizard 7 bước → Submit (giữ nguyên)

[Recruiter] Kiểm tra → Tinh chỉnh JD → Xác nhận (giữ nguyên)
```

---

## 4. UI Changes

**Layout mới:** Single column, max-width 2xl, căn giữa — thay cho 2 cột hiện tại.

**Màn hình chính:**
- Card "Paste JD vào đây": textarea lớn (10 rows) + button "✦ Tạo bảng hỏi cho sếp"
- Accordion "Chưa có JD? Để Jane gợi ý draft": collapsible, chứa form title + yêu cầu thô + button "Gợi ý JD draft →"
- Draft result: hiện bên dưới accordion, có label "✦ Jane gợi ý — chưa chính xác" + button "Dùng draft này →"

**Sau khi tạo bảng hỏi** (giữ nguyên logic, chỉ thay layout):
- Link panel: hiện token link + "Copy link"
- Waiting state: "Chờ sếp điền..." + "Kiểm tra lại"
- Answered state: badge "Sếp đã điền xong" + tóm tắt answers + button "Tinh chỉnh JD"
- Refined state: list changes + preview JD mới + "Xác nhận JD mới"

---

## 5. Technical Changes

### `src/app/page.tsx`
- Bỏ 2-column layout, chuyển sang single column max-w-2xl
- State mới: `pastedJd` (string) — ô paste chính
- State cũ giữ: `jobTitle` (extract từ JD bằng AI), `rawInput` (dùng trong accordion)
- `handleCreateQuestionnaire`: nhận `pastedJd` thay vì `generatedJd` từ generate API
- `handleGenerateDraft`: gọi `/api/generate`, kết quả điền vào `pastedJd`
- Accordion toggle state: `showDraftPanel` (boolean)

### `src/app/api/questionnaire/generate/route.ts`
- Thêm field `jdText` (raw JD paste) thay cho `generatedJd` làm input chính
- Extract job title từ JD bằng AI (thêm vào prompt hoặc call riêng)
- Lưu JD paste vào `jd_history` trước khi tạo questionnaire (để FK hoạt động)
- Input: `{ jdText: string }` (không cần `jdHistoryId` hay `jobTitle` nữa)
- Output: `{ id, token }` (giữ nguyên)

### `src/app/api/generate/route.ts`
- Giữ nguyên — vẫn dùng cho flow gợi ý draft
- Response: `{ generatedJd, jdHistoryId }` — nhưng `jdHistoryId` không cần dùng nữa (draft chỉ để paste)

---

## 6. Out of Scope (v1)

- Scrape website URL (headhunter flow)
- Form thông tin công ty cho recruiter nội bộ
- Extract title tự động bằng AI call riêng (extract trong prompt generate questionnaire luôn)
- Notification email/Zalo

---

## 7. Self-Review

**Spec coverage:** ✅ Flow chính, flow phụ, UI layout, technical changes đều đủ.  
**Placeholders:** Không có TBD.  
**Consistency:** `pastedJd` dùng nhất quán. `jdText` là tên field trong API request.  
**Scope:** Đủ nhỏ để implement trong 1 plan.
