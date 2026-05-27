# Job Posting Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau khi JD finalize, Jane gợi ý kênh đăng tuyển, generate content riêng cho từng kênh (LinkedIn / Facebook / Threads / TopCV), và post trực tiếp lên LinkedIn + Facebook Page nếu rec đã kết nối tài khoản.

**Architecture:** Card `PostingCard` tự xuất hiện sau khi rec confirm JD (và accessible từ History). Card gọi `/api/post-job/generate` để classify job type + generate 4 content variants bằng Claude. OAuth flow cho LinkedIn (Share API) và Facebook (Pages API) lưu encrypted token vào Supabase. Publish đi qua `/api/post-job/publish` — fetch token, call platform API, update status.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Anthropic Claude, Clerk (auth), LinkedIn OAuth 2.0, Facebook Graph API v19.0, Node.js crypto (AES-256-GCM)

**⚠️ Read before writing any code:** `node_modules/next/dist/docs/` — route params trong Next.js 16 là `Promise<{...}>`, phải `await params`.

---

## File Structure

```
src/
├── lib/
│   ├── supabase.ts              MODIFY — add PostCampaign, ConnectedAccount types + getSupabaseAdmin()
│   └── encryption.ts            CREATE — encrypt/decrypt tokens (AES-256-GCM)
├── app/
│   ├── api/
│   │   ├── post-job/
│   │   │   ├── generate/route.ts    CREATE — classify job + generate 4 channel contents
│   │   │   ├── publish/route.ts     CREATE — post to LinkedIn or Facebook
│   │   │   └── campaigns/route.ts   CREATE — GET campaigns for a jd_history_id
│   │   └── auth/
│   │       └── [platform]/
│   │           ├── connect/route.ts     CREATE — redirect to OAuth URL
│   │           ├── callback/route.ts    CREATE — exchange code → store token
│   │           └── disconnect/route.ts  CREATE — delete token
│   └── app/
│       └── page.tsx             MODIFY — add PostingCard after confirm JD + history button
└── components/
    ├── PostingCard.tsx          CREATE — main container: fetch content, render channels
    └── ChannelPostBlock.tsx     CREATE — per-channel UI: content textarea + action button
```

---

## Task 1: DB Tables + Env Vars

**Files:**
- Supabase dashboard (SQL editor)
- `.env.local`

- [ ] **Step 1: Run SQL in Supabase dashboard**

Open Supabase → SQL Editor → run:

```sql
-- Table: connected_accounts
create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  platform text not null check (platform in ('linkedin', 'facebook', 'threads')),
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  platform_user_id text,
  platform_user_name text,
  facebook_pages jsonb,
  selected_page_id text,
  created_at timestamptz default now(),
  unique (user_id, platform)
);

-- Table: post_campaigns
create table if not exists post_campaigns (
  id uuid primary key default gen_random_uuid(),
  jd_history_id uuid references jd_history(id) on delete cascade,
  channel text not null check (channel in ('linkedin', 'facebook', 'threads', 'topcv')),
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'posted', 'failed')),
  platform_post_id text,
  posted_at timestamptz,
  created_at timestamptz default now()
);
```

- [ ] **Step 2: Add new env vars to `.env.local`**

Thêm vào cuối file `.env.local`:

```bash
# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_linkedin_app_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_app_client_secret

# Facebook OAuth
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Token encryption key — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOKEN_ENCRYPTION_KEY=your_64_char_hex_string

# Supabase service role key (for connected_accounts — không public)
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

- [ ] **Step 3: Generate TOKEN_ENCRYPTION_KEY**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy output vào `.env.local` thay `your_64_char_hex_string`.

- [ ] **Step 4: Verify tables exist**

Trong Supabase → Table Editor → kiểm tra `connected_accounts` và `post_campaigns` đã xuất hiện.

---

## Task 2: Types + Supabase Admin + Encryption

**Files:**
- Modify: `src/lib/supabase.ts`
- Create: `src/lib/encryption.ts`

- [ ] **Step 1: Add types và getSupabaseAdmin() vào supabase.ts**

Append vào cuối `src/lib/supabase.ts`:

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let _adminClient: ReturnType<typeof createSupabaseClient> | null = null

export function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

export type PostCampaign = {
  id: string
  jd_history_id: string
  channel: 'linkedin' | 'facebook' | 'threads' | 'topcv'
  content: string
  status: 'draft' | 'posted' | 'failed'
  platform_post_id: string | null
  posted_at: string | null
  created_at: string
}

export type ConnectedAccount = {
  id: string
  user_id: string
  platform: 'linkedin' | 'facebook' | 'threads'
  platform_user_id: string | null
  platform_user_name: string | null
  facebook_pages: Array<{ id: string; name: string; access_token: string }> | null
  selected_page_id: string | null
  created_at: string
}

export type GeneratedPosts = {
  linkedin: string
  facebook: string
  threads: string
  topcv: string
  job_type: string
  channel_recommendations: Array<{
    channel: string
    stars: number
    reason: string
  }>
}
```

- [ ] **Step 2: Tạo src/lib/encryption.ts**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decrypt(encoded: string): string {
  const key = getKey()
  const data = Buffer.from(encoded, 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 3: Verify encryption works**

```bash
cd "/Users/Macbook/Claude Code/jane-ai"
node -e "
process.env.TOKEN_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
const { encrypt, decrypt } = require('./src/lib/encryption.ts');
" 2>&1 | head -5
```

Nếu TypeScript error thì bình thường — sẽ verify qua app sau. Không cần fix ở bước này.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts src/lib/encryption.ts
git commit -m "feat: add PostCampaign/ConnectedAccount types, getSupabaseAdmin, encryption util"
```

---

## Task 3: Content Generation API

**Files:**
- Create: `src/app/api/post-job/generate/route.ts`

- [ ] **Step 1: Tạo route file**

Tạo `src/app/api/post-job/generate/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase, getSupabaseAdmin, GeneratedPosts } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildPrompt(jobTitle: string, jdText: string): string {
  return `Bạn là chuyên gia marketing tuyển dụng. Dựa trên JD sau, hãy:
1. Xác định loại job (job_type): một trong 'tech', 'business', 'marketing', 'fresher'
2. Gợi ý kênh đăng tuyển (channel_recommendations): xếp hạng LinkedIn, Facebook Group, Threads, TopCV theo mức độ phù hợp (stars: 1-3) kèm lý do ngắn 1 câu
3. Viết nội dung post cho 4 kênh theo hướng dẫn bên dưới

**Vị trí:** ${jobTitle}
**JD:**
${jdText}

---

**Hướng dẫn viết content từng kênh:**

**LinkedIn (150-250 từ, formal):**
- Header: tên vị trí + 1 điểm highlight của công ty/role
- Preview: 2 câu ấn tượng về cơ hội
- Main: bullet points (công việc, yêu cầu, quyền lợi — không cần full JD)
- CTA: kêu gọi DM hoặc apply
- Tone: chuyên nghiệp, emoji chừng mực

**Facebook Group (80-150 từ, friendly):**
- 3 dòng đầu phải hook ngay (chỉ 125 ký tự được show trước "Xem thêm")
- Tone như người thật đang seeding, thân thiện
- Emoji nhiều hơn LinkedIn, ít bullet hơn
- CTA ngắn gọn

**Threads (tối đa 400 ký tự, punchy):**
- 1 câu hook
- 3 bullet siêu ngắn
- 1 dòng CTA
- Không có hashtag dài

**TopCV/Job Board (format JD chuẩn):**
- Full structured JD: Mô tả vị trí, Trách nhiệm, Yêu cầu, Quyền lợi, Liên hệ
- Formal, đầy đủ thông tin

---

Trả về JSON duy nhất, không thêm bất kỳ text nào khác:

{
  "job_type": "tech",
  "channel_recommendations": [
    {"channel": "linkedin", "stars": 3, "reason": "Tech role, senior level — LinkedIn reach tốt nhất"},
    {"channel": "facebook", "stars": 3, "reason": "Cộng đồng dev VN rất active trên Facebook"},
    {"channel": "threads", "stars": 2, "reason": "Đang lên, nhưng pool ứng viên còn nhỏ"},
    {"channel": "topcv", "stars": 2, "reason": "Volume cao, phù hợp đăng thêm"}
  ],
  "linkedin": "nội dung post LinkedIn...",
  "facebook": "nội dung post Facebook...",
  "threads": "nội dung Threads...",
  "topcv": "nội dung full JD format..."
}`
}

export async function POST(req: NextRequest) {
  try {
    const { jd_history_id } = await req.json() as { jd_history_id: string }

    if (!jd_history_id) {
      return NextResponse.json({ error: 'Thiếu jd_history_id' }, { status: 400 })
    }

    // Fetch JD
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jd, error: jdError } = await (getSupabase() as any)
      .from('jd_history')
      .select('job_title, generated_jd')
      .eq('id', jd_history_id)
      .single()

    if (jdError || !jd) {
      return NextResponse.json({ error: 'Không tìm thấy JD' }, { status: 404 })
    }

    // Generate content with Claude
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      messages: [{ role: 'user', content: buildPrompt(jd.job_title, jd.generated_jd) }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const cleanRaw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const generated = JSON.parse(cleanRaw) as GeneratedPosts

    // Save draft campaigns for each channel
    const channels = ['linkedin', 'facebook', 'threads', 'topcv'] as const
    const inserts = channels.map(channel => ({
      jd_history_id,
      channel,
      content: generated[channel],
      status: 'draft',
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (getSupabaseAdmin() as any)
      .from('post_campaigns')
      .upsert(inserts, { onConflict: 'jd_history_id,channel' })

    if (insertError) {
      console.error('Insert campaigns error:', insertError)
      // Non-fatal — still return generated content
    }

    return NextResponse.json({ generated })
  } catch (error) {
    console.error('Generate posts error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Thêm unique constraint vào DB**

Để `upsert` hoạt động, chạy trong Supabase SQL editor:

```sql
alter table post_campaigns
  add constraint post_campaigns_jd_channel_unique
  unique (jd_history_id, channel);
```

- [ ] **Step 3: Test thủ công**

Start dev server:
```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npm run dev
```

Mở app, tạo 1 JD, lấy `id` từ history, rồi test:
```bash
curl -X POST http://localhost:3000/api/post-job/generate \
  -H "Content-Type: application/json" \
  -d '{"jd_history_id":"<id-from-history>"}' \
  | python3 -m json.tool
```

Expected: JSON với `generated.linkedin`, `generated.facebook`, `generated.threads`, `generated.topcv`, `generated.channel_recommendations`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/post-job/generate/route.ts
git commit -m "feat: add /api/post-job/generate — classify job type + generate 4-channel content"
```

---

## Task 4: Campaigns Read API

**Files:**
- Create: `src/app/api/post-job/campaigns/route.ts`

- [ ] **Step 1: Tạo campaigns route**

Tạo `src/app/api/post-job/campaigns/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const jd_history_id = req.nextUrl.searchParams.get('jd_id')

  if (!jd_history_id) {
    return NextResponse.json({ error: 'Thiếu jd_id' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('post_campaigns')
    .select('id, channel, content, status, posted_at, platform_post_id')
    .eq('jd_history_id', jd_history_id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ campaigns: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  // Update content of a draft campaign (user edited the text)
  const { campaign_id, content } = await req.json() as { campaign_id: string; content: string }

  if (!campaign_id || !content) {
    return NextResponse.json({ error: 'Thiếu campaign_id hoặc content' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (getSupabaseAdmin() as any)
    .from('post_campaigns')
    .update({ content })
    .eq('id', campaign_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Test**

```bash
curl "http://localhost:3000/api/post-job/campaigns?jd_id=<jd-id-that-has-campaigns>"
```

Expected: `{ campaigns: [...] }` với 4 items (linkedin, facebook, threads, topcv).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/post-job/campaigns/route.ts
git commit -m "feat: add /api/post-job/campaigns — read and update draft campaigns"
```

---

## Task 5: LinkedIn OAuth (Connect + Callback)

**Files:**
- Create: `src/app/api/auth/[platform]/connect/route.ts`
- Create: `src/app/api/auth/[platform]/callback/route.ts`

**Prerequisite:** Tạo LinkedIn app tại https://developer.linkedin.com → Products → Share on LinkedIn. Thêm redirect URI: `http://localhost:3000/api/auth/linkedin/callback` (và production URL sau). Lấy Client ID + Secret → điền vào `.env.local`.

- [ ] **Step 1: Tạo connect route**

Tạo `src/app/api/auth/[platform]/connect/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = Buffer.from(JSON.stringify({ userId, platform })).toString('base64url')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  let authUrl: string

  if (platform === 'linkedin') {
    const redirectUri = `${appUrl}/api/auth/linkedin/callback`
    authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
      `response_type=code` +
      `&client_id=${process.env.LINKEDIN_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=openid%20profile%20w_member_social` +
      `&state=${state}`
  } else if (platform === 'facebook') {
    const redirectUri = `${appUrl}/api/auth/facebook/callback`
    authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
      `client_id=${process.env.FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=pages_show_list,pages_manage_posts` +
      `&state=${state}`
  } else {
    return NextResponse.json({ error: 'Platform không hỗ trợ' }, { status: 400 })
  }

  return NextResponse.redirect(authUrl)
}
```

- [ ] **Step 2: Tạo callback route**

Tạo `src/app/api/auth/[platform]/callback/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { encrypt } from '@/lib/encryption'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!code || !stateRaw) {
    return NextResponse.redirect(`${appUrl}/app?oauth_error=missing_code`)
  }

  let userId: string
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw, 'base64url').toString())
    userId = decoded.userId
  } catch {
    return NextResponse.redirect(`${appUrl}/app?oauth_error=invalid_state`)
  }

  try {
    if (platform === 'linkedin') {
      await handleLinkedIn(code, userId, appUrl)
    } else if (platform === 'facebook') {
      await handleFacebook(code, userId, appUrl)
    } else {
      return NextResponse.redirect(`${appUrl}/app?oauth_error=unknown_platform`)
    }
  } catch (err) {
    console.error(`${platform} OAuth callback error:`, err)
    return NextResponse.redirect(`${appUrl}/app?oauth_error=token_exchange_failed`)
  }

  return NextResponse.redirect(`${appUrl}/app?oauth_success=${platform}`)
}

async function handleLinkedIn(code: string, userId: string, appUrl: string) {
  const redirectUri = `${appUrl}/api/auth/linkedin/callback`

  // Exchange code for token
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  })

  const tokenData = await tokenRes.json() as {
    access_token: string
    expires_in: number
    scope: string
  }

  if (!tokenData.access_token) throw new Error('No access_token from LinkedIn')

  // Get profile info (name + sub)
  const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const profile = await profileRes.json() as { sub: string; name: string }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .upsert({
      user_id: userId,
      platform: 'linkedin',
      access_token: encrypt(tokenData.access_token),
      token_expires_at: expiresAt,
      platform_user_id: profile.sub,
      platform_user_name: profile.name,
    }, { onConflict: 'user_id,platform' })
}

async function handleFacebook(code: string, userId: string, appUrl: string) {
  const redirectUri = `${appUrl}/api/auth/facebook/callback`

  // Exchange code for short-lived token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
    `client_id=${process.env.FACEBOOK_APP_ID}` +
    `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${code}`
  )
  const tokenData = await tokenRes.json() as { access_token: string }

  if (!tokenData.access_token) throw new Error('No access_token from Facebook')

  // Exchange for long-lived token (60 days)
  const longRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
    `grant_type=fb_exchange_token` +
    `&client_id=${process.env.FACEBOOK_APP_ID}` +
    `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
    `&fb_exchange_token=${tokenData.access_token}`
  )
  const longData = await longRes.json() as { access_token: string; expires_in: number }

  // Get user info
  const meRes = await fetch(
    `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${longData.access_token}`
  )
  const me = await meRes.json() as { id: string; name: string }

  // Get pages the user manages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${longData.access_token}`
  )
  const pagesData = await pagesRes.json() as {
    data: Array<{ id: string; name: string; access_token: string }>
  }
  const pages = pagesData.data ?? []

  const expiresAt = new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .upsert({
      user_id: userId,
      platform: 'facebook',
      access_token: encrypt(longData.access_token),
      token_expires_at: expiresAt,
      platform_user_id: me.id,
      platform_user_name: me.name,
      facebook_pages: pages.map(p => ({
        id: p.id,
        name: p.name,
        access_token: encrypt(p.access_token),
      })),
      selected_page_id: pages[0]?.id ?? null,
    }, { onConflict: 'user_id,platform' })
}
```

- [ ] **Step 3: Tạo disconnect route**

Tạo `src/app/api/auth/[platform]/disconnect/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .delete()
    .eq('user_id', userId)
    .eq('platform', platform)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Test LinkedIn connect flow**

Start dev server. Mở browser:
```
http://localhost:3000/api/auth/linkedin/connect
```

Expected: redirect sang LinkedIn login page. Sau khi approve → redirect về `/app?oauth_success=linkedin`. Kiểm tra Supabase → `connected_accounts` table có record mới.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/
git commit -m "feat: LinkedIn + Facebook OAuth connect/callback/disconnect routes"
```

---

## Task 6: Connected Accounts Read API + Publish API

**Files:**
- Create: `src/app/api/auth/[platform]/status/route.ts`
- Create: `src/app/api/post-job/publish/route.ts`

- [ ] **Step 1: Tạo status route (get connected account info)**

Tạo `src/app/api/auth/[platform]/status/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin, ConnectedAccount } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .select('id, platform, platform_user_id, platform_user_name, facebook_pages, selected_page_id, token_expires_at')
    .eq('user_id', userId)
    .eq('platform', platform)
    .maybeSingle()

  return NextResponse.json({
    connected: !!data,
    account: data as ConnectedAccount | null,
  })
}
```

- [ ] **Step 2: Tạo publish route**

Tạo `src/app/api/post-job/publish/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { decrypt } from '@/lib/encryption'

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json() as { campaign_id: string }
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!campaign_id) {
    return NextResponse.json({ error: 'Thiếu campaign_id' }, { status: 400 })
  }

  // Fetch campaign
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign, error: cErr } = await (getSupabaseAdmin() as any)
    .from('post_campaigns')
    .select('id, channel, content, status')
    .eq('id', campaign_id)
    .single()

  if (cErr || !campaign) {
    return NextResponse.json({ error: 'Không tìm thấy campaign' }, { status: 404 })
  }

  if (campaign.status === 'posted') {
    return NextResponse.json({ error: 'Đã đăng rồi' }, { status: 400 })
  }

  // Fetch connected account
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (getSupabaseAdmin() as any)
    .from('connected_accounts')
    .select('access_token, platform_user_id, facebook_pages, selected_page_id')
    .eq('user_id', userId)
    .eq('platform', campaign.channel)
    .maybeSingle()

  if (!account) {
    return NextResponse.json({ error: 'Chưa kết nối tài khoản' }, { status: 400 })
  }

  const token = decrypt(account.access_token)
  let platformPostId: string

  try {
    if (campaign.channel === 'linkedin') {
      platformPostId = await postToLinkedIn(token, account.platform_user_id, campaign.content)
    } else if (campaign.channel === 'facebook') {
      const pageToken = getPageToken(account, campaign.channel)
      const pageId = account.selected_page_id
      if (!pageId || !pageToken) {
        return NextResponse.json({ error: 'Chưa chọn Facebook Page' }, { status: 400 })
      }
      platformPostId = await postToFacebook(pageToken, pageId, campaign.content)
    } else {
      return NextResponse.json({ error: 'Kênh này không hỗ trợ direct post' }, { status: 400 })
    }
  } catch (err) {
    console.error('Publish error:', err)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabaseAdmin() as any)
      .from('post_campaigns')
      .update({ status: 'failed' })
      .eq('id', campaign_id)
    return NextResponse.json({ error: 'Lỗi khi đăng lên platform' }, { status: 502 })
  }

  // Update status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabaseAdmin() as any)
    .from('post_campaigns')
    .update({
      status: 'posted',
      platform_post_id: platformPostId,
      posted_at: new Date().toISOString(),
    })
    .eq('id', campaign_id)

  return NextResponse.json({ ok: true, platform_post_id: platformPostId })
}

function getPageToken(
  account: { facebook_pages: Array<{ id: string; access_token: string }> | null; selected_page_id: string | null },
  _channel: string
): string | null {
  if (!account.facebook_pages || !account.selected_page_id) return null
  const page = account.facebook_pages.find(p => p.id === account.selected_page_id)
  if (!page) return null
  return decrypt(page.access_token)
}

async function postToLinkedIn(token: string, personSub: string, content: string): Promise<string> {
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${personSub}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LinkedIn API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}

async function postToFacebook(pageToken: string, pageId: string, content: string): Promise<string> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        access_token: pageToken,
      }),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Facebook API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}
```

- [ ] **Step 3: Test status endpoint**

Sau khi connect LinkedIn:
```bash
curl http://localhost:3000/api/auth/linkedin/status
```
Expected: `{ connected: true, account: { platform_user_name: "..." } }`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/ src/app/api/post-job/
git commit -m "feat: add auth status route + publish API for LinkedIn and Facebook"
```

---

## Task 7: ChannelPostBlock Component

**Files:**
- Create: `src/components/ChannelPostBlock.tsx`

- [ ] **Step 1: Tạo component**

Tạo `src/components/ChannelPostBlock.tsx`:

```typescript
'use client'

import { useState } from 'react'

type Channel = 'linkedin' | 'facebook' | 'threads' | 'topcv'

const CHANNEL_META: Record<Channel, { icon: string; label: string; color: string; borderColor: string; bgColor: string; textColor: string }> = {
  linkedin: { icon: '💼', label: 'LinkedIn', color: '#6366f1', borderColor: 'border-indigo-400', bgColor: 'bg-indigo-50', textColor: 'text-indigo-700' },
  facebook: { icon: '📘', label: 'Facebook Page', color: '#1877f2', borderColor: 'border-blue-400', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  threads: { icon: '🧵', label: 'Threads', color: '#111', borderColor: 'border-gray-400', bgColor: 'bg-gray-50', textColor: 'text-gray-700' },
  topcv: { icon: '📄', label: 'TopCV / Job Board', color: '#6b7280', borderColor: 'border-gray-300', bgColor: 'bg-gray-50', textColor: 'text-gray-600' },
}

type ConnectedAccount = {
  platform_user_name: string | null
  facebook_pages: Array<{ id: string; name: string }> | null
  selected_page_id: string | null
} | null

type Campaign = {
  id: string
  content: string
  status: 'draft' | 'posted' | 'failed'
  posted_at: string | null
}

type Props = {
  channel: Channel
  campaign: Campaign | null
  stars: number
  reason: string
  account: ConnectedAccount
  onPublish: (campaignId: string) => Promise<void>
  onContentChange: (campaignId: string, content: string) => void
}

export default function ChannelPostBlock({
  channel,
  campaign,
  stars,
  reason,
  account,
  onPublish,
  onContentChange,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const meta = CHANNEL_META[channel]
  const isContentOnly = channel === 'threads' || channel === 'topcv'
  const canDirectPost = !isContentOnly && account !== null

  const starsStr = '★'.repeat(stars) + '☆'.repeat(3 - stars)

  async function handlePublish() {
    if (!campaign) return
    setPublishing(true)
    try {
      await onPublish(campaign.id)
    } finally {
      setPublishing(false)
    }
  }

  function handleCopy() {
    if (!campaign) return
    navigator.clipboard.writeText(campaign.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const posted = campaign?.status === 'posted'
  const failed = campaign?.status === 'failed'

  return (
    <div className={`border rounded-xl overflow-hidden ${posted ? 'border-green-300' : meta.borderColor.replace('border-', 'border-')}`}
      style={{ borderColor: posted ? '#86efac' : undefined }}>

      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${meta.bgColor}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.icon}</span>
          <strong className="text-sm" style={{ color: meta.color }}>{meta.label}</strong>
          {posted && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              ✓ Đã đăng
            </span>
          )}
          {failed && (
            <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              Lỗi
            </span>
          )}
          {!posted && !failed && isContentOnly && (
            <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
              Content only
            </span>
          )}
          {!posted && !failed && !isContentOnly && account && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              ✓ Đã kết nối
            </span>
          )}
          {!posted && !failed && !isContentOnly && !account && (
            <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
              Chưa kết nối
            </span>
          )}
        </div>
        <span className={`text-xs font-medium ${meta.textColor}`}>{starsStr}</span>
      </div>

      {/* Reason */}
      <div className="px-4 pt-2 pb-1">
        <p className="text-xs text-gray-400">{reason}</p>
      </div>

      {/* Content */}
      {campaign && (
        <div className="px-4 pb-3 space-y-2">
          {!expanded ? (
            <>
              <p className="text-xs text-gray-600 line-clamp-3 bg-gray-50 rounded-lg p-3 leading-relaxed">
                {campaign.content}
              </p>
              <button
                onClick={() => setExpanded(true)}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                Xem đầy đủ & chỉnh sửa ↓
              </button>
            </>
          ) : (
            <>
              <textarea
                value={campaign.content}
                onChange={(e) => onContentChange(campaign.id, e.target.value)}
                rows={8}
                className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Thu gọn ↑
              </button>
            </>
          )}

          {/* Actions */}
          {posted ? (
            <p className="text-xs text-green-600 text-center py-1">
              ✓ Đã đăng lúc {campaign.posted_at ? new Date(campaign.posted_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}
            </p>
          ) : isContentOnly ? (
            <button
              onClick={handleCopy}
              className="w-full py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {copied ? '✓ Đã copy!' : 'Copy nội dung →'}
            </button>
          ) : canDirectPost ? (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: meta.color }}
            >
              {publishing ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang đăng...
                </>
              ) : (
                `Post lên ${meta.label} →`
              )}
            </button>
          ) : (
            <a
              href={`/api/auth/${channel}/connect`}
              className="block w-full py-2.5 text-sm font-semibold text-center rounded-lg border-2 transition-colors hover:bg-gray-50"
              style={{ color: meta.color, borderColor: meta.color }}
            >
              Kết nối {meta.label} →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ChannelPostBlock.tsx
git commit -m "feat: add ChannelPostBlock component — per-channel content + post/connect action"
```

---

## Task 8: PostingCard Component

**Files:**
- Create: `src/components/PostingCard.tsx`

- [ ] **Step 1: Tạo PostingCard component**

Tạo `src/components/PostingCard.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import ChannelPostBlock from './ChannelPostBlock'
import type { GeneratedPosts, ConnectedAccount, PostCampaign } from '@/lib/supabase'

type Channel = 'linkedin' | 'facebook' | 'threads' | 'topcv'
const CHANNELS: Channel[] = ['linkedin', 'facebook', 'threads', 'topcv']

type Props = {
  jdHistoryId: string
}

type CampaignMap = Partial<Record<Channel, PostCampaign>>
type AccountMap = Partial<Record<Channel, ConnectedAccount>>

export default function PostingCard({ jdHistoryId }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<GeneratedPosts | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignMap>({})
  const [accounts, setAccounts] = useState<AccountMap>({})

  // Fetch generated content + campaigns on mount
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Check if campaigns already exist
      const campRes = await fetch(`/api/post-job/campaigns?jd_id=${jdHistoryId}`)
      const campData = await campRes.json() as { campaigns: PostCampaign[] }

      if (campData.campaigns?.length > 0) {
        // Already generated — use existing
        const map: CampaignMap = {}
        campData.campaigns.forEach(c => { map[c.channel as Channel] = c })
        setCampaigns(map)

        // Still need to set generated for recommendations
        // Re-generate recommendations from first campaign's channel data
        // (We don't store recommendations in DB, so re-generate if needed)
        if (!generated) {
          const genRes = await fetch('/api/post-job/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jd_history_id: jdHistoryId }),
          })
          const genData = await genRes.json() as { generated: GeneratedPosts }
          if (genData.generated) setGenerated(genData.generated)
        }
      } else {
        // First time — generate
        const genRes = await fetch('/api/post-job/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jd_history_id: jdHistoryId }),
        })
        const genData = await genRes.json() as { generated: GeneratedPosts; error?: string }
        if (genData.error) throw new Error(genData.error)
        setGenerated(genData.generated)

        // Re-fetch campaigns after generation
        const newCampRes = await fetch(`/api/post-job/campaigns?jd_id=${jdHistoryId}`)
        const newCampData = await newCampRes.json() as { campaigns: PostCampaign[] }
        const map: CampaignMap = {}
        newCampData.campaigns?.forEach(c => { map[c.channel as Channel] = c })
        setCampaigns(map)
      }
    } catch (err) {
      console.error('PostingCard fetch error:', err)
      setError('Không tải được nội dung, thử lại nhé!')
    } finally {
      setLoading(false)
    }
  }, [jdHistoryId])

  // Fetch connected accounts
  const fetchAccounts = useCallback(async () => {
    const results = await Promise.allSettled(
      ['linkedin', 'facebook'].map(async (p) => {
        const res = await fetch(`/api/auth/${p}/status`)
        const data = await res.json() as { connected: boolean; account: ConnectedAccount }
        return { platform: p as Channel, account: data.connected ? data.account : null }
      })
    )
    const map: AccountMap = {}
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        map[r.value.platform] = r.value.account
      }
    })
    setAccounts(map)
  }, [])

  useEffect(() => {
    fetchData()
    fetchAccounts()
  }, [fetchData, fetchAccounts])

  // Handle content edit (debounced save)
  function handleContentChange(campaignId: string, content: string) {
    setCampaigns(prev => {
      const updated = { ...prev }
      for (const ch of CHANNELS) {
        if (updated[ch]?.id === campaignId) {
          updated[ch] = { ...updated[ch]!, content }
        }
      }
      return updated
    })
    // Fire-and-forget save
    fetch('/api/post-job/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, content }),
    }).catch(console.error)
  }

  // Handle publish
  async function handlePublish(campaignId: string) {
    const res = await fetch('/api/post-job/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (!data.ok) throw new Error(data.error ?? 'Lỗi không rõ')

    // Update local status
    setCampaigns(prev => {
      const updated = { ...prev }
      for (const ch of CHANNELS) {
        if (updated[ch]?.id === campaignId) {
          updated[ch] = { ...updated[ch]!, status: 'posted', posted_at: new Date().toISOString() }
        }
      }
      return updated
    })
  }

  return (
    <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">✦</span>
          </div>
          <h2 className="font-bold text-gray-800 text-base">Đăng tuyển ngay</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">Jane gợi ý kênh + generate content phù hợp cho từng nơi</p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-8">
            <svg className="animate-spin w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-500">Jane đang phân tích JD và viết content... (~15s)</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={fetchData} className="mt-2 text-xs text-red-500 underline">Thử lại</button>
          </div>
        )}

        {!loading && !error && generated && (
          <>
            {/* Channel recommendation summary */}
            <div className="bg-indigo-50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-indigo-700 mb-2">Jane gợi ý cho role này</p>
              <div className="flex flex-wrap gap-2">
                {generated.channel_recommendations
                  .sort((a, b) => b.stars - a.stars)
                  .map(rec => (
                    <span
                      key={rec.channel}
                      className="text-xs px-2 py-1 rounded-full font-medium bg-white border border-indigo-200 text-indigo-600"
                    >
                      {rec.channel} {'★'.repeat(rec.stars)}{'☆'.repeat(3 - rec.stars)}
                    </span>
                  ))}
              </div>
            </div>

            {/* Channel blocks */}
            {CHANNELS.map(channel => {
              const rec = generated.channel_recommendations.find(r => r.channel === channel)
              return (
                <ChannelPostBlock
                  key={channel}
                  channel={channel}
                  campaign={campaigns[channel] ?? null}
                  stars={rec?.stars ?? 1}
                  reason={rec?.reason ?? ''}
                  account={accounts[channel] ?? null}
                  onPublish={handlePublish}
                  onContentChange={handleContentChange}
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PostingCard.tsx
git commit -m "feat: add PostingCard component — auto-generates content + renders channel blocks"
```

---

## Task 9: Wire Up in app/page.tsx

**Files:**
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Add import**

Thêm vào đầu file `src/app/app/page.tsx`, sau các imports hiện có:

```typescript
import PostingCard from '@/components/PostingCard'
```

- [ ] **Step 2: Thêm state cho posting section**

Thêm state mới vào nhóm state ở đầu component (sau `const [refining, setRefining] = useState(false)`):

```typescript
const [postingJdId, setPostingJdId] = useState<string | null>(null)
```

- [ ] **Step 3: Trigger PostingCard khi confirm refined JD**

Tìm hàm `handleConfirmRefinedJd` trong `page.tsx`:

```typescript
function handleConfirmRefinedJd() {
  setPastedJd(refinedJd)
  setRefinedJd('')
  setChanges([])
  fetchHistory()
}
```

Thêm `setPostingJdId` để trigger posting card:

```typescript
function handleConfirmRefinedJd() {
  setPastedJd(refinedJd)
  setRefinedJd('')
  setChanges([])
  fetchHistory()
  // Trigger posting card — cần jdHistoryId của record vừa refined
  // questionnaireId trỏ đến questionnaire, cần jd_history_id của nó
  // Ta lưu jdHistoryId khi tạo questionnaire
}
```

Thêm `jdHistoryId` state (theo dõi JD đang active):

```typescript
const [activeJdHistoryId, setActiveJdHistoryId] = useState<string | null>(null)
```

Cập nhật `handleCreateQuestionnaire` để save `jdHistoryId`. Tìm đoạn sau trong hàm này:

```typescript
if (data.token) {
  setQuestionnaireToken(data.token)
  setQuestionnaireId(data.id)
```

Thay bằng:

```typescript
if (data.token) {
  setQuestionnaireToken(data.token)
  setQuestionnaireId(data.id)
  setActiveJdHistoryId(data.jd_history_id ?? null)
```

Cập nhật `handleConfirmRefinedJd`:

```typescript
function handleConfirmRefinedJd() {
  setPastedJd(refinedJd)
  setRefinedJd('')
  setChanges([])
  fetchHistory()
  if (activeJdHistoryId) setPostingJdId(activeJdHistoryId)
}
```

- [ ] **Step 4: Update questionnaire generate route để return jd_history_id**

Mở `src/app/api/questionnaire/generate/route.ts`. Tìm:

```typescript
return NextResponse.json({ id: data.id, token: data.token })
```

Thay bằng:

```typescript
return NextResponse.json({ id: data.id, token: data.token, jd_history_id: jdRecord.id })
```

- [ ] **Step 5: Update frontend type để accept jd_history_id**

Trong `page.tsx`, tìm đoạn fetch response type ở `handleCreateQuestionnaire`:

```typescript
const data = await res.json()
if (data.token) {
```

Thêm type cast:

```typescript
const data = await res.json() as { token?: string; id?: string; jd_history_id?: string; error?: string }
```

- [ ] **Step 6: Thêm PostingCard vào JSX**

Trong `page.tsx`, tìm đoạn sau `{/* Refined JD */}` block (sau `</div>` đóng của refined JD section) và sau `</div>` đóng của `{questionnaireToken && (` block.

Thêm PostingCard sau toàn bộ questionnaire section:

```tsx
{/* Posting Card */}
{postingJdId && (
  <PostingCard jdHistoryId={postingJdId} />
)}
```

- [ ] **Step 7: Thêm nút "Đăng tuyển" trong History**

Tìm trong JSX phần history item:

```tsx
history.map((item) => (
  <button
    key={item.id}
    onClick={() => handleHistoryClick(item.id)}
    className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
  >
    <p className="font-medium text-sm text-gray-800 truncate">{item.job_title}</p>
    <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
  </button>
))
```

Thay bằng:

```tsx
history.map((item) => (
  <div key={item.id} className="flex items-center border-b border-gray-50 last:border-0">
    <button
      onClick={() => handleHistoryClick(item.id)}
      className="flex-1 text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
    >
      <p className="font-medium text-sm text-gray-800 truncate">{item.job_title}</p>
      <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
    </button>
    <button
      onClick={() => { setPostingJdId(item.id); setShowHistory(false) }}
      className="px-3 py-1 mr-3 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 whitespace-nowrap"
    >
      Đăng tuyển
    </button>
  </div>
))
```

- [ ] **Step 8: Handle oauth_success redirect**

Thêm `useEffect` để detect khi user quay lại sau OAuth:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const success = params.get('oauth_success')
  if (success) {
    // Clean URL
    window.history.replaceState({}, '', '/app')
  }
}, [])
```

- [ ] **Step 9: Test end-to-end**

1. Tạo JD mới → paste vào → tạo bảng hỏi → điền → confirm refined JD
2. Card "Đăng tuyển" phải xuất hiện bên dưới
3. Content loading ~15s → 4 channel blocks xuất hiện
4. Click "Kết nối LinkedIn" → OAuth flow → quay về app
5. Channel LinkedIn giờ show "✓ Đã kết nối" + nút "Post lên LinkedIn"
6. Click post → verify post xuất hiện trên LinkedIn
7. Vào history → click "Đăng tuyển" trên JD cũ → PostingCard xuất hiện

- [ ] **Step 10: Commit**

```bash
git add src/app/app/page.tsx src/app/api/questionnaire/generate/route.ts
git commit -m "feat: wire up PostingCard in app — shows after confirm JD + accessible from history"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** UX flow ✓ · Channel recommendation ✓ · Content generation ✓ · LinkedIn OAuth ✓ · Facebook OAuth ✓ · Publish API ✓ · Campaign tracking ✓ · History entry point ✓ · Content-only for TopCV ✓
- [x] **No placeholders:** All steps have actual code
- [x] **Type consistency:** `PostCampaign`, `ConnectedAccount`, `GeneratedPosts` defined in Task 2 and used consistently in Tasks 7, 8
- [x] **Next.js 16 params:** All dynamic routes use `await params`
- [x] **Auth pattern:** Clerk `auth()` used in routes that need userId (connect, disconnect, status, publish)

## Out of Scope (V2)

- Threads direct post
- Scheduling (post later)
- Analytics (view/click tracking)
- Multi-group Facebook selection (v1 chọn page đầu tiên)
- Browser automation cho TopCV
