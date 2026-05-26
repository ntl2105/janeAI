# Jane AI — Landing Page Design Spec
Date: 2026-05-26

## Overview

A marketing landing page for Jane AI — an AI recruitment tool built by Jane Nguyen, a headhunter with 10+ years of real experience. The page targets recruiters discovering Jane AI via LinkedIn outreach. Goal: get them to sign up with Google and start using the product.

---

## Target Audience

Recruiters (in-house or agency) who are hearing about Jane AI for the first time, typically arriving via a LinkedIn outreach message.

---

## Tech Stack

- **Framework:** Next.js (existing `jane-ai/` project)
- **Styling:** Tailwind CSS
- **Auth:** Clerk (Google login / magic link)
- **Database:** Supabase (Postgres) — logs chat messages and user sessions for analytics
- **Fonts:** Playfair Display (display/headlines) + Inter (body)

---

## Design Direction

**Style:** Editorial / Typographic — large bold serif headlines, lots of whitespace, minimal decoration. Artistic through typography, not graphics. Color palette: white background, dark gray text, indigo (#4F46E5) accent.

**Mockup:** `/mockup/landing.html` (approved)

---

## Page Structure

### 1. Navigation (fixed)
- Logo: "J" icon (indigo) + "Jane AI" wordmark
- CTA: "Dùng thử miễn phí" → Google login (Clerk)

### 2. Hero + Founder Section (merged, split layout)
- **Left column:**
  - Eyebrow: "ĐƯỢC XÂY BỞI JANE NGUYEN · HEADHUNTER 10 NĂM"
  - H1: "Welcome to Jane AI — *tuyển dụng như headhunter lành nghề.*"
  - Body: "Jane AI được xây bởi Jane, một headhunter với hơn 10 năm kinh nghiệm tuyển dụng từ mass recruitment đến C-level, từ Finance, IT đến FMCG, Retail ở Việt Nam và cả SEA. Cộng với hơn 4 năm vận hành Recruitment Academy và 100GB tài liệu thật được đưa vào làm nền tảng, để Jane AI trở thành chuyên gia tuyển dụng trong tay bạn."
  - CTA: "Đăng nhập với Google" + "Miễn phí"
- **Right column:**
  - Professional photo of Jane Nguyen
  - Floating badge: "10+" / "năm trong nghề"

### 3. Training Section
- Headline: "Jane AI không học từ internet — *Jane AI học từ 10 năm làm nghề của Jane.*"
- 3 stats:
  - **100+ GB** — tài liệu thật (JD thật, brief thật, feedback thật từ hiring manager)
  - **10** — năm đào tạo team (video, slide, case study từ hàng chục khóa training nội bộ)
  - **4** — năm Recruitment Academy (chương trình đào tạo recruiter từ cơ bản đến nâng cao)

### 4. Features Section
4 features in a 2×2 grid:
1. **AI Chatbot tuyển dụng** — Hỏi bất cứ điều gì về recruitment, Jane trả lời như senior headhunter
2. **Job Spec** — Paste JD → bảng hỏi cho hiring manager → JD tinh chỉnh từ câu trả lời thật
3. **CV Matching** — So sánh CV với tiêu chí thật từ sếp, không phải JD gốc
4. **Qualifying Questions** — Checklist phone screening dựa trên đúng yêu cầu của hiring manager

### 5. CTA Section
- Headline: "Làm việc với *10 năm kinh nghiệm* trong túi."
- Sub: "Miễn phí. Không cần setup. Đăng nhập và thử ngay."
- CTA: "Đăng nhập với Google"

### 6. Footer
- Logo + tagline: "Built by a headhunter, for recruiters."

---

## Auth & Data Collection

- **Login:** Clerk — Google OAuth (primary), magic link fallback
- **On login:** Clerk captures user identity (email, name, profile photo)
- **Chat logging:** All interactions stored in Supabase (`messages` table) linked to Clerk user ID
- **Goal:** Track engagement, see what users ask, understand feature usage — no separate analytics tool needed at this stage

---

## Routing

| Route | Description |
|-------|-------------|
| `/` | Landing page (this spec) |
| `/app` | Main Jane AI app (post-login redirect) |

---

## Constraints & Notes

- Language: Vietnamese (primary), some English terms kept (headhunter, recruiter, C-level, etc.)
- No waitlist — direct sign up
- No question form before sign up — data collected via app usage post-login
- Mobile responsive — single column on mobile, split layout on desktop
- Jane's photo stored at `public/jane.jpg` in the Next.js project
