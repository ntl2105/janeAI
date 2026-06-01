# Threads Viral Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize Threads post generation for algorithm virality — new conversation-first styles, reply starters, and matching UI.

**Architecture:** 3 changes in sequence: (1) extend `ContentStyle` type, (2) rewrite Threads prompt logic in the generate API route, (3) update `ChannelPostBlock` to surface new styles + reply starters.

**Tech Stack:** Next.js App Router, TypeScript, Anthropic SDK (`claude-haiku-4-5-20251001` for reply starters), Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `src/lib/supabase.ts` | Add 3 new `ContentStyle` values |
| `src/app/api/post-job/generate/route.ts` | Rewrite Threads channel rule, style descriptions, add reply starter gen |
| `src/components/ChannelPostBlock.tsx` | Update style labels/defaults, add reply starter UI section |

---

### Task 1: Extend ContentStyle type

**Files:**
- Modify: `src/lib/supabase.ts:82`

- [ ] **Step 1: Update the ContentStyle union type**

In `src/lib/supabase.ts`, line 82, change:

```typescript
export type ContentStyle = 'announcement' | 'story_telling' | 'benefit_focus' | 'seeding' | 'trending_funny'
```

to:

```typescript
export type ContentStyle = 'announcement' | 'story_telling' | 'benefit_focus' | 'seeding' | 'trending_funny' | 'opinion_hook' | 'relatable_scenario' | 'insider_drop'
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors (there may be pre-existing ones — only fail if NEW errors appear related to ContentStyle).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add opinion_hook, relatable_scenario, insider_drop to ContentStyle"
```

---

### Task 2: Rewrite Threads prompt logic in generate route

**Files:**
- Modify: `src/app/api/post-job/generate/route.ts`

- [ ] **Step 1: Replace CHANNEL_RULES for threads**

In `src/app/api/post-job/generate/route.ts`, find:

```typescript
const CHANNEL_RULES: Record<string, string> = {
  linkedin: 'Dài 150-250 từ. Emoji chừng mực (tối đa 3). Tone chuyên nghiệp. 125 ký tự đầu phải hook.',
  facebook: 'Dài 80-150 từ. 3 dòng đầu (125 ký tự) phải hook mạnh vì đây là phần hiển thị trước "Xem thêm". Emoji thoải mái hơn. Casual.',
  threads: 'Tối đa 450 ký tự. 1 câu hook + 3 bullet siêu ngắn + 1 dòng CTA.',
  topcv: 'Full JD format chuẩn: Mô tả vị trí → Trách nhiệm → Yêu cầu (must have / nice to have rõ ràng) → Quyền lợi → Liên hệ. Formal, đầy đủ.',
}
```

Replace with:

```typescript
const CHANNEL_RULES: Record<string, string> = {
  linkedin: 'Dài 150-250 từ. Emoji chừng mực (tối đa 3). Tone chuyên nghiệp. 125 ký tự đầu phải hook.',
  facebook: 'Dài 80-150 từ. 3 dòng đầu (125 ký tự) phải hook mạnh vì đây là phần hiển thị trước "Xem thêm". Emoji thoải mái hơn. Casual.',
  threads: 'Tối đa 480 ký tự. KHÔNG dùng bullet. Viết thành đoạn ngắn tự nhiên như người thật đang nói chuyện. Câu cuối PHẢI là câu hỏi mở để kéo reply. Không nhắc tên công ty/vị trí trong 3 câu đầu. Tone: casual, opinionated, như Threads creator — không phải HR đăng job.',
  topcv: 'Full JD format chuẩn: Mô tả vị trí → Trách nhiệm → Yêu cầu (must have / nice to have rõ ràng) → Quyền lợi → Liên hệ. Formal, đầy đủ.',
}
```

- [ ] **Step 2: Add 3 new style descriptions to STYLE_DESCRIPTIONS**

Find the `STYLE_DESCRIPTIONS` object:

```typescript
const STYLE_DESCRIPTIONS: Record<ContentStyle, string> = {
  announcement: 'Thông báo tuyển dụng chuyên nghiệp. Header rõ ràng → 2 câu hook → bullets (công việc/yêu cầu/quyền lợi) → CTA.',
  story_telling: 'HR kể chuyện cá nhân về team/công ty. Bắt đầu bằng câu chuyện thật, dẫn dắt tự nhiên vào JD. Cảm xúc, gần gũi.',
  benefit_focus: 'Hook bằng con số/quyền lợi cụ thể ngay đầu (lương, thưởng, cơ hội). Liệt kê đặc quyền trước yêu cầu.',
  seeding: 'Viết như đang chia sẻ tự nhiên, KHÔNG dùng từ "tuyển dụng"/"apply"/"ứng tuyển" trong 2 câu đầu. Casual, như bạn bè nhắn tin.',
  trending_funny: 'Hook bất ngờ, bắt trend hoặc dùng góc nhìn hài hước để phá rào cản. Phù hợp khi job có điểm bất lợi cần giảm nhẹ.',
}
```

Replace with (adding 3 new entries):

```typescript
const STYLE_DESCRIPTIONS: Record<ContentStyle, string> = {
  announcement: 'Thông báo tuyển dụng chuyên nghiệp. Header rõ ràng → 2 câu hook → bullets (công việc/yêu cầu/quyền lợi) → CTA.',
  story_telling: 'HR kể chuyện cá nhân về team/công ty. Bắt đầu bằng câu chuyện thật, dẫn dắt tự nhiên vào JD. Cảm xúc, gần gũi.',
  benefit_focus: 'Hook bằng con số/quyền lợi cụ thể ngay đầu (lương, thưởng, cơ hội). Liệt kê đặc quyền trước yêu cầu.',
  seeding: 'Viết như đang chia sẻ tự nhiên, KHÔNG dùng từ "tuyển dụng"/"apply"/"ứng tuyển" trong 2 câu đầu. Casual, như bạn bè nhắn tin.',
  trending_funny: 'Hook bất ngờ, bắt trend hoặc dùng góc nhìn hài hước để phá rào cản. Phù hợp khi job có điểm bất lợi cần giảm nhẹ.',
  opinion_hook: '[CHỈ DÙNG TRÊN THREADS] Mở đầu bằng take gây tranh cãi về ngành/nghề liên quan đến role này — một nhận định mà người trong ngành sẽ muốn đồng ý hoặc phản bác. Không nhắc tên công ty/role 3 câu đầu. Kết bằng câu hỏi mở mời người đọc chia sẻ quan điểm.',
  relatable_scenario: '[CHỈ DÙNG TRÊN THREADS] Mở đầu bằng scenario cụ thể mà ứng viên mục tiêu đang sống right now — một khoảnh khắc, cảm giác, hoặc tình huống họ tự thấy mình trong đó ngay lập tức. Không nhắc tên công ty/role 3 câu đầu. Dẫn dắt tự nhiên vào role. Kết bằng câu hỏi mở.',
  insider_drop: '[CHỈ DÙNG TRÊN THREADS] Mở đầu bằng 1 chi tiết nhỏ, thật, bất ngờ về team hoặc cách làm việc (lấy từ thông tin hiring manager đã cung cấp). Tạo cảm giác người đọc đang được nghe "bí mật nội bộ" — không giải thích ngay, để chi tiết đó tự nói lên. Kết bằng câu hỏi mở.',
}
```

- [ ] **Step 3: Add reply starter builder function**

After the `buildAntiPatternBlock` function definition, add:

```typescript
function buildReplyStarterPrompt(postContent: string): string {
  return `Bạn là recruiter vừa đăng post sau lên Threads:

${postContent}

Viết 2 câu reply ngắn mà recruiter sẽ tự reply vào post trong 30 phút đầu để boost conversation.
Mỗi reply: 1-2 câu, tự nhiên, thêm 1 chi tiết nhỏ về role/team chưa có trong post, hoặc invite người đọc hỏi thêm.
KHÔNG dùng "apply ngay", "DM mình", KHÔNG sales.

Trả về JSON duy nhất, không text thêm: ["reply 1", "reply 2"]`
}
```

- [ ] **Step 4: Call reply starter gen in generate mode**

In the `generate` mode block, find the section that returns `{ campaign }`:

```typescript
      return NextResponse.json({ campaign })
```

Replace with:

```typescript
      // Gen reply starters for Threads in parallel with upsert — already have content
      let replyStarters: string[] = []
      if (channel === 'threads') {
        try {
          const replyMsg = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{ role: 'user', content: buildReplyStarterPrompt(content) }],
          })
          const raw = replyMsg.content[0]?.type === 'text' ? replyMsg.content[0].text.trim() : '[]'
          const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
          replyStarters = JSON.parse(clean)
        } catch {
          // reply starters are non-critical — fail silently
        }
      }

      return NextResponse.json({ campaign, replyStarters })
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to the changed file.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/post-job/generate/route.ts
git commit -m "feat: rewrite Threads prompt — viral styles + reply starter generation"
```

---

### Task 3: Update ChannelPostBlock UI

**Files:**
- Modify: `src/components/ChannelPostBlock.tsx`

- [ ] **Step 1: Replace Threads styles and add new labels**

Find:

```typescript
// Styles available per channel
const CHANNEL_STYLES: Record<Channel, ContentStyle[]> = {
  linkedin:  ['announcement', 'story_telling', 'benefit_focus'],
  facebook:  ['announcement', 'story_telling', 'benefit_focus', 'seeding', 'trending_funny'],
  threads:   ['benefit_focus', 'seeding', 'trending_funny'],
  topcv:     [], // content-only, no style picker
}

const STYLE_LABELS: Record<ContentStyle, string> = {
  announcement:   'Thông báo',
  story_telling:  'Story Telling',
  benefit_focus:  'Benefit Focus',
  seeding:        'Seeding',
  trending_funny: 'Trending / Funny',
}

// Recommended style per channel
const CHANNEL_RECOMMENDED_STYLE: Partial<Record<Channel, ContentStyle>> = {
  linkedin:  'announcement',
  facebook:  'seeding',
  threads:   'benefit_focus',
}
```

Replace with:

```typescript
// Styles available per channel
const CHANNEL_STYLES: Record<Channel, ContentStyle[]> = {
  linkedin:  ['announcement', 'story_telling', 'benefit_focus'],
  facebook:  ['announcement', 'story_telling', 'benefit_focus', 'seeding', 'trending_funny'],
  threads:   ['relatable_scenario', 'opinion_hook', 'insider_drop'],
  topcv:     [], // content-only, no style picker
}

const STYLE_LABELS: Record<ContentStyle, string> = {
  announcement:       'Thông báo',
  story_telling:      'Story Telling',
  benefit_focus:      'Benefit Focus',
  seeding:            'Seeding',
  trending_funny:     'Trending / Funny',
  opinion_hook:       'Opinion Hook',
  relatable_scenario: 'Scenario',
  insider_drop:       'Insider Drop',
}

// Recommended style per channel
const CHANNEL_RECOMMENDED_STYLE: Partial<Record<Channel, ContentStyle>> = {
  linkedin:  'announcement',
  facebook:  'seeding',
  threads:   'relatable_scenario',
}
```

- [ ] **Step 2: Add replyStarters state**

Find the state declarations block (around the `useState` lines at the top of the component function):

```typescript
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
```

Add after `generateError`:

```typescript
  const [replyStarters, setReplyStarters] = useState<string[]>([])
  const [copiedReply, setCopiedReply] = useState<number | null>(null)
```

- [ ] **Step 3: Capture replyStarters in handleGenerate**

Find in `handleGenerate`:

```typescript
      const data = await res.json() as { campaign?: PostCampaign; error?: string }
      if (data.error || !data.campaign) throw new Error(data.error ?? 'Lỗi generate')
      onCampaignGenerated(data.campaign)
      setContentExpanded(true)
```

Replace with:

```typescript
      const data = await res.json() as { campaign?: PostCampaign; error?: string; replyStarters?: string[] }
      if (data.error || !data.campaign) throw new Error(data.error ?? 'Lỗi generate')
      onCampaignGenerated(data.campaign)
      setContentExpanded(true)
      if (data.replyStarters?.length) setReplyStarters(data.replyStarters)
```

- [ ] **Step 4: Add copy handler for reply starters**

After `handleCopy`, add:

```typescript
  function handleCopyReply(index: number) {
    const text = replyStarters[index]
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopiedReply(index)
      setTimeout(() => setCopiedReply(null), 2000)
    }).catch(() => {})
  }
```

- [ ] **Step 5: Render reply starters section**

Find the closing of the content area (right before the closing `</div>` of the `{hasContent && campaign && (` block):

```typescript
          )}
        </div>
      )}
    </div>
  )
}
```

The structure ends with the content area div closing. Find this exact pattern inside `{hasContent && campaign && (`:

```typescript
            </div>
          )}
        </div>
      )}
    </div>
  )
```

Add the reply starters section just before `</div>` that closes the `space-y-2` content div. The full end of the hasContent block should look like:

```typescript
            </div>
          )}

          {/* Reply starters — Threads only */}
          {channel === 'threads' && replyStarters.length > 0 && (
            <div className="mt-3 border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-2">
              <p className="text-xs font-semibold text-gray-500">Reply ngay sau khi đăng 👇</p>
              {replyStarters.map((reply, i) => (
                <div key={i} className="flex items-start gap-2">
                  <p className="text-xs text-gray-700 flex-1 leading-relaxed">{reply}</p>
                  <button
                    onClick={() => handleCopyReply(i)}
                    className="shrink-0 text-xs px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {copiedReply === i ? '✓' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/ChannelPostBlock.tsx
git commit -m "feat: Threads UI — new styles, reply starter section"
```

---

### Task 4: Smoke test end-to-end

- [ ] **Step 1: Start dev server**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npm run dev
```

- [ ] **Step 2: Open app and go through flow**

1. Open `http://localhost:3000`
2. Pick any existing JD from history (or create one)
3. Go to "Đăng tuyển ngay" → expand Threads
4. Verify 3 new style chips appear: `Scenario`, `Opinion Hook`, `Insider Drop`
5. `Scenario` should have the `✦` recommended indicator
6. Click Generate
7. Verify post content appears and has no bullet format
8. Verify last line is a question
9. Verify reply starters section appears with 2 items and Copy buttons

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix: <describe any fix>"
```
