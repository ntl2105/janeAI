# Feature Design: Đăng Post Khắp Nơi Kiếm CV

**Date:** 2026-05-27
**Status:** Approved
**Approach:** B — Content Generator + OAuth Phased (LinkedIn + Facebook v1, Threads v2)

---

## Mục tiêu

Sau khi JD được finalize, Jane tự động:
1. Gợi ý kênh đăng tuyển phù hợp với loại job
2. Generate nội dung post riêng cho từng kênh (đúng tone, đúng format)
3. Post trực tiếp lên LinkedIn / Facebook Group nếu rec đã kết nối tài khoản

**Cho ai:** Recruiter, headhunter dùng Jane AI
**Insight gốc (Recruitment Academy R101):** "Post job là một kênh passive sourcing nên được làm đầu tiên để khi mình đi ngủ job vẫn được search."

---

## User Flow

### Entry point 1: Sau khi confirm JD
Rec bấm "Xác nhận JD mới" → card **"✦ Đăng tuyển ngay"** tự xuất hiện bên dưới trong cùng trang `/app`.

### Entry point 2: Từ History
Mỗi JD trong danh sách lịch sử có nút **"Đăng tuyển"** — cho phép post JD cũ bất kỳ lúc nào.

### Flow trong card:
1. Card xuất hiện → **tự động gọi `/api/post-job/generate`** (không cần rec bấm thêm) — hiển thị loading spinner ngắn (~10s)
2. Jane phân tích JD → hiển thị kênh gợi ý (ranked) + lý do ngắn
3. Mỗi kênh có content đã generate sẵn, rec có thể edit trước khi post
3. Kênh đã connect account → nút "Post ngay"
4. Kênh chưa connect → nút "Kết nối [platform]" → OAuth flow → quay lại, post
5. Job boards (TopCV, VietnamWorks) → content-only, nút "Copy JD đầy đủ"

---

## Channel Recommendation Logic

Jane dùng Claude để classify job type từ JD text, sau đó map sang priority score cho từng kênh:

| Job Type | LinkedIn | Facebook Group | Threads | TopCV | YBOX |
|---|---|---|---|---|---|
| Tech (Dev/Data/Design) | ★★★ | ★★★ | ★★☆ | ★★☆ | ★☆☆ |
| Business/Sales/BD | ★★★ | ★★☆ | ★★☆ | ★★★ | ★☆☆ |
| Marketing/Creative | ★★☆ | ★★★ | ★★★ | ★★☆ | ★☆☆ |
| Fresher/Intern | ★★☆ | ★★★ | ★★☆ | ★★☆ | ★★★ |

Logic encode vào system prompt — Claude classify + return ranked list kèm 1 câu reasoning.

---

## Content Generation

Một API call nhận JD → trả về 4 content variants, mỗi kênh khác tone và format theo framework từ slide R101 (Recruitment Academy):

### LinkedIn — Formal, 150–250 từ
- Structure: Header (job title + company highlight) → Preview 2 câu hook → Main (bullets: công việc / yêu cầu / quyền lợi) → CTA
- Tone: Chuyên nghiệp, emoji chừng mực
- Post as **status/share** (không phải job listing chính thức — không cần LinkedIn Talent partner)

### Facebook Group — Friendly, 80–150 từ
- Structure: Hook 1–2 câu đầu mạnh (chỉ 125 ký tự hiển thị trước "Xem thêm") → nội dung thân thiện như người thật đang seeding → CTA rõ
- Tone: Informal, emoji nhiều hơn, ít bullet hơn LinkedIn

### Threads — Punchy, max 500 ký tự
- Structure: 1 câu hook + 3 bullet siêu ngắn + CTA
- Không dùng ảnh trong v1
- Threads Publishing API (Meta, released 2024)

### TopCV / VietnamWorks — Full JD format
- Re-export JD đã finalize theo format chuẩn job board
- Content-only, không có direct post (không có public API)
- Nút "Copy JD đầy đủ" → rec tự paste

Tất cả content đều **editable** trong UI trước khi post.

---

## OAuth Integration

### V1 (build ngay)

**LinkedIn OAuth 2.0**
- App scope: `w_member_social`
- Post dưới dạng share/status trên personal feed của rec
- Access token lưu Supabase (encrypted), refresh tự động khi hết hạn

**Facebook Graph API**
- App scope: `pages_manage_posts` + `groups_access_member_info`
- Rec chọn Page hoặc Group muốn post sau khi connect
- Token long-lived (60 ngày), auto-refresh

### V2 (sau v1)
**Threads Publishing API**
- Cùng Facebook app — chỉ cần add scope: `threads_basic` + `threads_content_publish`
- Không cần tạo app mới

---

## Data Model

### Bảng mới: `post_campaigns`
Lưu từng lần đăng của một JD lên một kênh.

| Column | Type | Ghi chú |
|---|---|---|
| id | uuid PK | |
| jd_history_id | uuid FK | → jd_history.id |
| channel | text | 'linkedin' \| 'facebook' \| 'threads' \| 'topcv' |
| content | text | Nội dung sau khi rec edit (nếu có) |
| status | text | 'draft' \| 'posted' \| 'failed' |
| platform_post_id | text | ID trả về từ platform sau khi post thành công |
| posted_at | timestamptz | |
| created_at | timestamptz | |

### Bảng mới: `connected_accounts`
Lưu OAuth token theo user.

| Column | Type | Ghi chú |
|---|---|---|
| id | uuid PK | |
| user_id | text | Clerk user ID |
| platform | text | 'linkedin' \| 'facebook' \| 'threads' |
| access_token | text | Encrypted |
| refresh_token | text | Encrypted |
| token_expires_at | timestamptz | |
| platform_user_id | text | |
| platform_user_name | text | Hiển thị "Đang post với @..." trong UI |
| created_at | timestamptz | |

---

## API Routes mới

| Method | Route | Mô tả |
|---|---|---|
| POST | `/api/post-job/generate` | Nhận `jd_history_id` → classify job type → generate content cho 4 kênh → lưu drafts vào `post_campaigns` |
| POST | `/api/post-job/publish` | Nhận `campaign_id` → post lên platform → update status + `platform_post_id` |
| GET | `/api/auth/[platform]/connect` | Redirect sang OAuth authorization URL |
| GET | `/api/auth/[platform]/callback` | Nhận auth code → exchange token → lưu `connected_accounts` |
| GET | `/api/post-job/campaigns` | Query param `?jd_id=` → trả về lịch sử đăng của JD đó |
| DELETE | `/api/auth/[platform]/disconnect` | Xóa token, ngắt kết nối account |

---

## UI Components mới

- `PostingCard` — card chính hiển thị sau confirm JD, chứa toàn bộ flow đăng tuyển
- `ChannelPostBlock` — component cho từng kênh: header (tên + status connect) + content textarea + action button
- `ConnectAccountButton` — nút kết nối OAuth, hiển thị tên account sau khi connect
- `PostStatusBadge` — badge trạng thái: draft / đang đăng... / đã đăng lúc XX:XX / thất bại

---

## Phạm vi V1

**Trong scope:**
- LinkedIn OAuth + post as status
- Facebook Page/Group OAuth + post
- Content generation cho 4 kênh (LinkedIn, Facebook, Threads, TopCV)
- Channel recommendation dựa trên job type
- Tracking status (draft → posted/failed)
- Entry point từ confirm JD + từ history

**Ngoài scope V1 (để V2):**
- Threads direct post
- Scheduling (đặt lịch đăng)
- Analytics (bao nhiêu view, click từ post)
- Multi-group Facebook (v1 chỉ 1 page/group)
- Browser automation cho TopCV/VietnamWorks
