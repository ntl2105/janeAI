# Threads Viral Optimization

**Date:** 2026-06-01  
**Status:** Approved

## Problem

Threads hiện generate theo format `1 hook + 3 bullets + CTA` — đây là announcement format, ngược với cách thuật toán Threads hoạt động. Thuật toán Threads ưu tiên engagement velocity (reply trong 30 phút đầu) và replies quan trọng hơn likes. Content viral trên Threads là opinionated, conversational, kết bằng câu hỏi mở — không phải job post truyền thống.

## Algorithm Research Summary

- **Engagement velocity**: post nhận 20 replies trong 30 phút > post nhận 50 replies sau 24 giờ
- **Replies > Likes**: Threads là conversation-first platform
- **Không dùng bullet format**: đọc như người thật đang nói chuyện
- **Kết bằng câu hỏi mở**: cơ chế kéo reply hiệu quả nhất
- **Self-reply sớm**: creator tự reply vào post trong 30 phút đầu để boost reach

## Changes

### 1. `CHANNEL_RULES['threads']` — rewrite

**Trước:**
```
Tối đa 450 ký tự. 1 câu hook + 3 bullet siêu ngắn + 1 dòng CTA.
```

**Sau:**
```
Tối đa 480 ký tự. Không dùng bullet. Viết thành đoạn ngắn tự nhiên như người thật đang nói chuyện. Câu cuối PHẢI là câu hỏi mở để kéo reply. Không nhắc tên công ty/vị trí trong 3 câu đầu. Tone: casual, opinionated, như Threads creator — không phải HR đăng job.
```

### 2. Threads styles mới (thay 3 style cũ)

Xoá `benefit_focus`, `seeding`, `trending_funny` khỏi `CHANNEL_STYLES['threads']` và `CHANNEL_RECOMMENDED_STYLE['threads']`.

Thêm 3 style mới chỉ dùng cho Threads:

| Style key | Label UI | Cơ chế | Câu mở ví dụ |
|---|---|---|---|
| `opinion_hook` | Opinion Hook | Take gây tranh cãi về ngành/nghề → người đọc reply đồng ý hoặc phản bác | *"Tôi nghĩ 80% JD Senior đang tuyển sai người."* |
| `relatable_scenario` | Scenario | Scenario cụ thể ứng viên đang sống right now → tự thấy mình trong đó | *"Sáng thứ 2 mà bạn đã check LinkedIn trước khi ra khỏi giường."* |
| `insider_drop` | Insider Drop | 1 chi tiết nội bộ thật/bất ngờ về team → vibe được nghe bí mật | *"Team này không có sprint planning — không phải vì lazy."* |

Recommended style mặc định: `relatable_scenario`.

Tất cả 3 style đều kết thúc bằng câu hỏi mở (enforced trong `CHANNEL_RULES` và `STYLE_DESCRIPTIONS`).

### 3. Reply starter generation

**File:** `src/app/api/post-job/generate/route.ts`

Khi `mode === 'generate'` và `channel === 'threads'`, sau khi gen post chính, gọi thêm 1 Claude call nhỏ để gen reply starters:

- Model: `claude-haiku-4-5-20251001` (nhanh, rẻ, đủ dùng)
- Max tokens: 200
- Output: `reply_starters: string[]` (2 items)
- Nội dung: 2 câu ngắn recruiter tự reply vào post trong 30 phút đầu sau khi đăng, mục đích boost engagement velocity. Không giải thích, không sales — tự nhiên như đang tiếp tục conversation.
- Thêm `reply_starters` vào response JSON cùng với `campaign`

**Reply starter prompt:**
```
Bạn là recruiter vừa đăng post sau lên Threads:

[POST_CONTENT]

Viết 2 câu reply ngắn mà recruiter sẽ tự reply vào post trong 30 phút đầu để boost conversation.
Mỗi reply: 1-2 câu, tự nhiên, thêm 1 chi tiết nhỏ về role/team chưa có trong post, hoặc invite người đọc hỏi thêm.
Không dùng "apply ngay", "DM mình", không sales.

Trả về JSON: ["reply 1", "reply 2"]
```

### 4. UI — `ChannelPostBlock.tsx`

- Cập nhật style labels: hiển thị `Opinion Hook`, `Scenario`, `Insider Drop`
- Khi channel là Threads và response có `reply_starters`: hiển thị section nhỏ bên dưới post content với label **"Reply ngay sau khi đăng 👇"** + 2 reply items, mỗi item có nút copy
- Section này chỉ xuất hiện cho Threads, không ảnh hưởng channel khác

### 5. `ContentStyle` type — `src/lib/supabase.ts`

Thêm 3 values mới: `'opinion_hook' | 'relatable_scenario' | 'insider_drop'`

## Data Flow

```
User clicks Generate (Threads)
  → POST /api/post-job/generate { mode: 'generate', channel: 'threads', style }
  → Gen post (claude-opus-4-7, max 1500 tokens)
  → Gen reply starters (claude-haiku, max 200 tokens) [parallel hoặc sequential sau post]
  → Upsert post_campaigns (content only, không store reply_starters)
  → Return { campaign, reply_starters }
UI hiển thị post + reply starter section
```

`reply_starters` không cần persist — chỉ dùng trong session, recruiter copy rồi thôi.

## Files Affected

- `src/app/api/post-job/generate/route.ts` — core logic changes
- `src/lib/supabase.ts` — ContentStyle type
- `src/components/ChannelPostBlock.tsx` — UI styles + reply starter section
