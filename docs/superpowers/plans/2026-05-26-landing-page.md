# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Jane AI landing page at `/`, move the existing app to `/app`, add Clerk Google login, protect `/app` with auth.

**Architecture:** Landing page at `/` (new). Existing `page.tsx` app moves to `/app/page.tsx`. Clerk wraps the layout for auth. Unauthenticated users hitting `/app` get redirected to `/` via middleware.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4, Clerk (Google OAuth), Supabase (already configured), `next/font` (Playfair Display + Inter), `next/image`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/page.tsx` (replace) | Landing page |
| Create | `src/app/app/page.tsx` | Existing app (moved) |
| Modify | `src/app/layout.tsx` | Add ClerkProvider + fonts |
| Create | `src/middleware.ts` | Protect `/app` route |
| Create | `public/jane.jpg` | Jane's photo |
| Modify | `.env.local` | Clerk env vars |

---

## Task 1: Copy photo + install Clerk

**Files:**
- Modify: `.env.local`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Copy Jane's photo**

```bash
cp "/Users/Macbook/Downloads/IMG_7124.jpg" "/Users/Macbook/Claude Code/jane-ai/public/jane.jpg"
```

- [ ] **Step 2: Install Clerk**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npm install @clerk/nextjs
```

Expected: `added X packages` with no errors.

- [ ] **Step 3: Create Clerk app + get keys**

Go to https://dashboard.clerk.com → Create application → enable Google → copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

- [ ] **Step 4: Add env vars to `.env.local`**

Create or append to `/Users/Macbook/Claude Code/jane-ai/.env.local`:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app
```

- [ ] **Step 5: Commit**

```bash
git add public/jane.jpg package.json package-lock.json
git commit -m "feat: add jane photo and install clerk"
```

---

## Task 2: Add Clerk to layout + middleware

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/middleware.ts`

- [ ] **Step 1: Update layout.tsx with ClerkProvider and fonts**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { Playfair_Display, Inter } from 'next/font/google'
import './globals.css'

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  weight: ['700', '900'],
  style: ['normal', 'italic'],
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'Jane AI — Tuyển dụng như headhunter lành nghề',
  description: 'AI tuyển dụng được xây bởi Jane Nguyen, headhunter hơn 10 năm kinh nghiệm.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="vi" className={`${playfair.variable} ${inter.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col bg-white text-gray-900">{children}</body>
      </html>
    </ClerkProvider>
  )
}
```

- [ ] **Step 2: Create middleware to protect /app**

Create `src/middleware.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher(['/app(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
}
```

- [ ] **Step 3: Verify dev server starts without errors**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npm run dev
```

Expected: `Ready in Xs` — no TypeScript or Clerk errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/middleware.ts
git commit -m "feat: add clerk provider and route protection middleware"
```

---

## Task 3: Move existing app to /app

**Files:**
- Create: `src/app/app/page.tsx` (copy of current `src/app/page.tsx`)
- Note: Keep `src/app/page.tsx` for now — will replace in Task 4

- [ ] **Step 1: Create `/app` directory and copy page**

```bash
mkdir -p "/Users/Macbook/Claude Code/jane-ai/src/app/app"
cp "/Users/Macbook/Claude Code/jane-ai/src/app/page.tsx" "/Users/Macbook/Claude Code/jane-ai/src/app/app/page.tsx"
```

- [ ] **Step 2: Verify `/app` route works**

With dev server running, visit `http://localhost:3000/app` — should show the existing JD questionnaire UI (may redirect to sign-in since Clerk is now protecting it — that's correct).

- [ ] **Step 3: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: move existing app to /app route"
```

---

## Task 4: Build landing page

**Files:**
- Replace: `src/app/page.tsx`

- [ ] **Step 1: Add font CSS variables to globals.css**

Open `src/app/globals.css` and ensure Tailwind v4 can use the font variables. Add at the top if not present:

```css
@import "tailwindcss";

@theme {
  --font-display: var(--font-playfair);
  --font-sans: var(--font-inter);
}
```

- [ ] **Step 2: Replace src/app/page.tsx with landing page**

```tsx
import Image from 'next/image'
import { SignInButton, SignedIn, SignedOut } from '@clerk/nextjs'
import { redirect } from 'next/navigation'

export default function LandingPage() {
  return (
    <>
      {/* Redirect logged-in users straight to /app */}
      <SignedIn>
        {redirect('/app')}
      </SignedIn>

      <SignedOut>
        {/* Nav */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">J</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">Jane AI</span>
          </div>
          <SignInButton mode="modal">
            <button className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-700 transition-colors cursor-pointer">
              Dùng thử miễn phí
            </button>
          </SignInButton>
        </nav>

        {/* Hero + Founder */}
        <section className="pt-32 pb-28 px-8 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <div className="space-y-8">
              <div className="space-y-5">
                <p className="text-xs font-medium text-gray-400 tracking-widest uppercase">
                  Được xây bởi Jane Nguyen · Headhunter 10 năm
                </p>
                <h1 className="font-[family-name:var(--font-playfair)] text-5xl font-black leading-[1.08]">
                  Welcome to Jane AI —{' '}
                  <em className="text-indigo-600">
                    tuyển dụng như<br />headhunter lành nghề.
                  </em>
                </h1>
                <p className="text-gray-500 leading-relaxed">
                  Jane AI được xây bởi Jane, một headhunter với hơn 10 năm kinh nghiệm tuyển dụng từ mass recruitment đến C-level, từ Finance, IT đến FMCG, Retail ở Việt Nam và cả SEA. Cộng với hơn 4 năm vận hành Recruitment Academy và 100GB tài liệu thật được đưa vào làm nền tảng, để Jane AI trở thành chuyên gia tuyển dụng trong tay bạn.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <SignInButton mode="modal">
                  <button className="flex items-center gap-2.5 bg-gray-900 text-white px-7 py-3.5 rounded-full font-medium hover:bg-gray-700 transition-colors cursor-pointer">
                    Đăng nhập với Google
                  </button>
                </SignInButton>
                <span className="text-sm text-gray-400">Miễn phí</span>
              </div>
            </div>

            {/* Right: Photo */}
            <div className="relative">
              <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100">
                <Image
                  src="/jane.jpg"
                  alt="Jane Nguyen"
                  fill
                  className="object-cover object-top"
                  priority
                />
              </div>
              <div className="absolute -bottom-4 -left-4 bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
                <p className="font-[family-name:var(--font-playfair)] text-3xl font-black text-indigo-600">10+</p>
                <p className="text-xs text-gray-500 mt-0.5">năm trong nghề</p>
              </div>
            </div>
          </div>
        </section>

        <hr className="border-gray-100 max-w-5xl mx-auto" />

        {/* Training */}
        <section className="py-28 px-8 max-w-5xl mx-auto">
          <p className="text-xs font-medium text-gray-400 tracking-widest uppercase mb-16">Training</p>
          <h2 className="font-[family-name:var(--font-playfair)] text-5xl font-black leading-tight mb-16 max-w-3xl">
            Jane AI không học<br />
            từ internet —<br />
            <em className="text-indigo-600">Jane AI học từ<br />10 năm làm nghề của Jane.</em>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { stat: '100+', label: 'GB tài liệu thật', desc: 'JD thật, brief thật, feedback thật từ hiring manager sau hàng trăm vòng phỏng vấn.' },
              { stat: '10', label: 'năm đào tạo team', desc: 'Video, slide, case study từ hàng chục khóa training nội bộ — cách đọc CV, cách hỏi sếp, cách qualify ứng viên.' },
              { stat: '4', label: 'năm Recruitment Academy', desc: 'Chương trình đào tạo recruiter từ cơ bản đến nâng cao — toàn bộ được đưa vào làm nền tảng cho Jane AI.' },
            ].map(({ stat, label, desc }) => (
              <div key={label} className="space-y-3">
                <p className="font-[family-name:var(--font-playfair)] text-5xl font-black text-indigo-600 italic">{stat}</p>
                <p className="font-semibold text-gray-800">{label}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100 max-w-5xl mx-auto" />

        {/* Features */}
        <section className="py-28 px-8 max-w-5xl mx-auto">
          <p className="text-xs font-medium text-gray-400 tracking-widest uppercase mb-16">Jane AI làm được gì</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
            {[
              { title: 'AI Chatbot tuyển dụng', desc: 'Hỏi bất cứ điều gì về recruitment — cách viết JD, cách handle offer negotiation, cách shortlist CV. Jane trả lời như một senior headhunter.' },
              { title: 'Job Spec', desc: 'Paste JD hoặc nhập yêu cầu thô — Jane tạo bảng hỏi gửi hiring manager, thu thập đúng yêu cầu, rồi tinh chỉnh JD từ câu trả lời thật.' },
              { title: 'CV Matching', desc: 'Upload CV, Jane so sánh với tiêu chí thật từ sếp — không phải từ JD gốc đã bị đoán mò. Tiết kiệm hàng giờ đọc CV không phù hợp.' },
              { title: 'Qualifying Questions', desc: 'Jane tạo checklist câu hỏi phone screening dựa trên đúng những gì hiring manager cần — không bỏ sót tiêu chí ẩn.' },
            ].map(({ title, desc }) => (
              <div key={title} className="flex gap-5">
                <div className="w-10 h-10 border border-indigo-100 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-100 max-w-5xl mx-auto" />

        {/* CTA */}
        <section className="py-28 px-8 max-w-5xl mx-auto text-center">
          <p className="text-xs font-medium text-gray-400 tracking-widest uppercase mb-8">Bắt đầu</p>
          <h2 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl font-black leading-tight mb-6">
            Làm việc với<br />
            <em className="text-indigo-600">10 năm kinh nghiệm</em><br />
            trong túi.
          </h2>
          <p className="text-gray-500 text-lg font-light mb-12 max-w-md mx-auto">
            Miễn phí. Không cần setup. Đăng nhập và thử ngay.
          </p>
          <SignInButton mode="modal">
            <button className="inline-flex items-center gap-2.5 bg-gray-900 text-white px-9 py-4 rounded-full font-medium text-base hover:bg-gray-700 transition-colors cursor-pointer">
              Đăng nhập với Google
            </button>
          </SignInButton>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-100 px-8 py-8">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-xs">J</span>
              </div>
              <span className="text-sm text-gray-400">Jane AI</span>
            </div>
            <p className="text-xs text-gray-300">© 2025 Jane AI. Built by a headhunter, for recruiters.</p>
          </div>
        </footer>
      </SignedOut>
    </>
  )
}
```

- [ ] **Step 3: Run dev server and verify landing page renders**

```bash
npm run dev
```

Visit `http://localhost:3000` — should show landing page with Jane's photo, headline, features. Clicking "Đăng nhập với Google" should open Clerk modal.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/globals.css
git commit -m "feat: build landing page with clerk auth"
```

---

## Task 5: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Add env vars in Vercel dashboard**

In Vercel project settings → Environment Variables, add:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` = `/`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` = `/app`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` = `/app`
- All existing Supabase + Anthropic env vars

- [ ] **Step 3: Trigger deploy and verify**

Vercel auto-deploys on push. Visit the production URL, verify:
- Landing page loads
- Google login works
- After login, redirects to `/app`
- `/app` redirects to login when not authenticated
