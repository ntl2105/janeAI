# Questionnaire Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tính năng tạo bảng hỏi 7 nhóm từ JD, gửi link cho sếp (không cần login), sếp điền wizard từng bước với AI pre-fill, recruiter dùng answers để tinh chỉnh JD.

**Architecture:** Public form tại `/q/[token]` không cần auth. 2 bảng Supabase mới (`questionnaires`, `questionnaire_answers`). 2 AI calls: (1) generate questions + pre-fill từ JD, (2) refine JD từ answers. Recruiter UI cập nhật `page.tsx` thêm button + view answers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Anthropic SDK (`claude-opus-4-7`), Supabase JS v2.

---

## File Map

| File | Action | Mục đích |
|------|--------|----------|
| `src/lib/supabase.ts` | Modify | Thêm types `Questionnaire`, `QuestionnaireAnswer`, `Question` |
| `src/app/api/questionnaire/generate/route.ts` | Create | POST: generate questions + pre-fill từ JD |
| `src/app/api/q/[token]/route.ts` | Create | GET: fetch questionnaire by token (public, no auth) |
| `src/app/api/q/[token]/submit/route.ts` | Create | POST: sếp submit answers |
| `src/app/api/questionnaire/[id]/answers/route.ts` | Create | GET: recruiter xem answers |
| `src/app/api/questionnaire/[id]/refine-jd/route.ts` | Create | POST: AI refine JD từ answers |
| `src/app/q/[token]/page.tsx` | Create | Public wizard page cho sếp |
| `src/components/QuestionnaireWizard.tsx` | Create | Client component wizard 7 bước |
| `src/app/page.tsx` | Modify | Thêm "Tạo bảng hỏi" button + answers view |

---

## Task 1: Supabase Schema + Types

**Files:**
- Run SQL via Supabase Dashboard → SQL Editor
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Tạo 2 bảng trong Supabase Dashboard**

Vào Supabase Dashboard → SQL Editor, chạy:

```sql
create table questionnaires (
  id uuid primary key default gen_random_uuid(),
  jd_history_id uuid references jd_history(id) on delete cascade,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  questions jsonb not null default '[]',
  prefilled_answers jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'answered')),
  expires_at timestamptz default now() + interval '30 days',
  created_at timestamptz default now()
);

create table questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid references questionnaires(id) on delete cascade,
  answers jsonb not null default '{}',
  submitted_at timestamptz default now()
);
```

- [ ] **Step 2: Thêm types vào `src/lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export type JdHistory = {
  id: string
  job_title: string
  raw_input: string
  generated_jd: string
  created_at: string
}

export type Question = {
  id: string
  section: number
  sectionLabel: string
  text: string
  type: 'yes_no' | 'multiple_choice' | 'open' | 'skill_matrix' | 'checkbox_multi'
  options?: string[]
  aiPrefilled?: boolean
}

export type Questionnaire = {
  id: string
  jd_history_id: string
  token: string
  questions: Question[]
  prefilled_answers: Record<string, unknown>
  status: 'pending' | 'answered'
  expires_at: string
  created_at: string
}

export type QuestionnaireAnswer = {
  id: string
  questionnaire_id: string
  answers: Record<string, unknown>
  submitted_at: string
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add questionnaire types and supabase schema"
```

---

## Task 2: Generate Questionnaire API

**Files:**
- Create: `src/app/api/questionnaire/generate/route.ts`

- [ ] **Step 1: Tạo route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'
import { Question } from '@/lib/supabase'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { jdHistoryId, jobTitle, generatedJd } = await req.json()

    if (!jdHistoryId || !jobTitle || !generatedJd) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `Bạn là chuyên gia tuyển dụng. Dựa trên JD sau, hãy tạo bảng hỏi 7 nhóm dành cho HIRING MANAGER (sếp trực tiếp), KHÔNG phải HR.

Câu hỏi phải là những gì sếp biết và quyết định được: lý do mở vị trí, tiêu chí thực sự, văn hoá team, lịch phỏng vấn, điểm đặc biệt của team. KHÔNG hỏi về gói bảo hiểm, training budget (đó là việc HR).

**JD:**
${generatedJd}

Trả về JSON theo đúng format sau, không thêm bất kỳ text nào khác:

{
  "questions": [
    {
      "id": "outcome_1",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "Vị trí này được tạo ra để giải quyết vấn đề gì?",
      "type": "open",
      "aiPrefilled": true
    },
    {
      "id": "outcome_2",
      "section": 1,
      "sectionLabel": "Outcome of the job",
      "text": "Mức độ urgent?",
      "type": "yes_no",
      "options": ["Gấp — cần người trong 1 tháng", "Bình thường — 2-3 tháng"],
      "aiPrefilled": true
    }
  ],
  "prefilled_answers": {
    "outcome_1": "Lý do mở vị trí dựa trên JD...",
    "outcome_2": "Bình thường — 2-3 tháng"
  }
}

Tạo đủ 7 nhóm theo cấu trúc:
- Section 1 (Outcome): 3 câu — vấn đề cần giải quyết (open, aiPrefilled), urgent (yes_no, aiPrefilled), bảo mật (yes_no, aiPrefilled)
- Section 2 (History): 2 câu — tuyển bao lâu (multiple_choice, options: ["Mới mở","1-2 tháng","3+ tháng"]), đã gặp UV chưa lý do chưa chốt (open)
- Section 3 (Requirements): 3 câu — số năm KN (multiple_choice, options: ["1-2 năm","3+ năm","5+ năm"], aiPrefilled), tech stack (skill_matrix, aiPrefilled), tiếng Anh (multiple_choice, options: ["Đọc hiểu tài liệu kỹ thuật","Giao tiếp với khách hàng nước ngoài","Lead meeting bằng tiếng Anh"], aiPrefilled)
- Section 4 (Culture fit): 2 câu — phong cách làm việc (checkbox_multi, options: ["Tự quản lý tốt, autonomous","Thích được mentor, học hỏi","Move fast, chịu được ambiguity","Process-driven, có cấu trúc"]), thêm về văn hoá (open)
- Section 5 (Package): 2 câu — lương flex (yes_no, aiPrefilled), điều đặc biệt trong team (open)
- Section 6 (Interview process): 3 câu — số vòng (multiple_choice, options: ["2 vòng","3 vòng","4+ vòng"]), có test kỹ thuật (multiple_choice, options: ["Có — take-home assignment","Có — live coding","Không test"]), lịch available (open)
- Section 7 (USP): 3 câu — tại sao UV giỏi nên về (open), grow thế nào 1-2 năm (open), challenge pain point (open)

Pre-fill tất cả câu có aiPrefilled: true dựa trên thông tin trong JD.`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const parsed = JSON.parse(raw) as {
      questions: Question[]
      prefilled_answers: Record<string, unknown>
    }

    const { data, error } = await getSupabase()
      .from('questionnaires')
      .insert({
        jd_history_id: jdHistoryId,
        questions: parsed.questions,
        prefilled_answers: parsed.prefilled_answers,
      })
      .select('id, token')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'Lỗi lưu dữ liệu' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, token: data.token })
  } catch (error) {
    console.error('Generate questionnaire error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Kiểm tra route compile**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit
```

Expected: không có lỗi type.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/questionnaire/generate/route.ts
git commit -m "feat: add generate questionnaire API"
```

---

## Task 3: Public Form APIs (GET + Submit)

**Files:**
- Create: `src/app/api/q/[token]/route.ts`
- Create: `src/app/api/q/[token]/submit/route.ts`

- [ ] **Step 1: Tạo GET route để fetch questionnaire by token**

`src/app/api/q/[token]/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const { data, error } = await getSupabase()
    .from('questionnaires')
    .select('id, questions, prefilled_answers, status, expires_at')
    .eq('token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Không tìm thấy bảng hỏi' }, { status: 404 })
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link đã hết hạn' }, { status: 410 })
  }

  if (data.status === 'answered') {
    return NextResponse.json({ error: 'Bảng hỏi đã được điền' }, { status: 409 })
  }

  return NextResponse.json({
    id: data.id,
    questions: data.questions,
    prefilled_answers: data.prefilled_answers,
  })
}
```

- [ ] **Step 2: Tạo POST submit route**

`src/app/api/q/[token]/submit/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { answers } = await req.json()

  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Thiếu câu trả lời' }, { status: 400 })
  }

  const { data: q, error: fetchError } = await getSupabase()
    .from('questionnaires')
    .select('id, status, expires_at')
    .eq('token', token)
    .single()

  if (fetchError || !q) {
    return NextResponse.json({ error: 'Không tìm thấy bảng hỏi' }, { status: 404 })
  }

  if (new Date(q.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link đã hết hạn' }, { status: 410 })
  }

  if (q.status === 'answered') {
    return NextResponse.json({ error: 'Đã submit rồi' }, { status: 409 })
  }

  const supabase = getSupabase()

  const { error: insertError } = await supabase
    .from('questionnaire_answers')
    .insert({ questionnaire_id: q.id, answers })

  if (insertError) {
    return NextResponse.json({ error: 'Lỗi lưu câu trả lời' }, { status: 500 })
  }

  await supabase
    .from('questionnaires')
    .update({ status: 'answered' })
    .eq('id', q.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Kiểm tra compile**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit
```

Expected: không có lỗi.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/q/
git commit -m "feat: add public questionnaire GET and submit APIs"
```

---

## Task 4: Answers + Refine JD APIs

**Files:**
- Create: `src/app/api/questionnaire/[id]/answers/route.ts`
- Create: `src/app/api/questionnaire/[id]/refine-jd/route.ts`

- [ ] **Step 1: Tạo GET answers route**

`src/app/api/questionnaire/[id]/answers/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: q, error: qError } = await getSupabase()
    .from('questionnaires')
    .select('id, questions, prefilled_answers, status, jd_history_id')
    .eq('id', id)
    .single()

  if (qError || !q) {
    return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
  }

  const { data: ans } = await getSupabase()
    .from('questionnaire_answers')
    .select('answers, submitted_at')
    .eq('questionnaire_id', id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    questionnaire: q,
    answers: ans?.answers ?? null,
    submitted_at: ans?.submitted_at ?? null,
  })
}
```

- [ ] **Step 2: Tạo POST refine-jd route**

`src/app/api/questionnaire/[id]/refine-jd/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'

const client = new Anthropic()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: q, error: qError } = await getSupabase()
    .from('questionnaires')
    .select('jd_history_id, questions')
    .eq('id', id)
    .single()

  if (qError || !q) {
    return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
  }

  const { data: jd } = await getSupabase()
    .from('jd_history')
    .select('job_title, generated_jd')
    .eq('id', q.jd_history_id)
    .single()

  const { data: ans } = await getSupabase()
    .from('questionnaire_answers')
    .select('answers')
    .eq('questionnaire_id', id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  if (!jd || !ans) {
    return NextResponse.json({ error: 'Thiếu dữ liệu để tinh chỉnh' }, { status: 400 })
  }

  const questionsText = (q.questions as Array<{ id: string; text: string }>)
    .map((q) => {
      const answer = (ans.answers as Record<string, unknown>)[q.id]
      return `Q: ${q.text}\nA: ${Array.isArray(answer) ? answer.join(', ') : answer ?? '(không trả lời)'}`
    })
    .join('\n\n')

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2500,
    messages: [
      {
        role: 'user',
        content: `Bạn là chuyên gia viết JD. Dựa trên JD gốc và câu trả lời của hiring manager, hãy tinh chỉnh lại JD cho chính xác hơn.

**JD gốc (${jd.job_title}):**
${jd.generated_jd}

**Câu trả lời của hiring manager:**
${questionsText}

Hãy:
1. Cập nhật JD dựa trên thông tin mới từ hiring manager
2. Giữ nguyên cấu trúc và phong cách JD gốc
3. Chỉ thay đổi những gì có thông tin mới từ hiring manager

Trả về JSON:
{
  "refinedJd": "nội dung JD đã tinh chỉnh",
  "changes": [
    "Cập nhật yêu cầu kinh nghiệm từ X thành Y vì...",
    "Thêm thông tin về tech stack..."
  ]
}`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
  const result = JSON.parse(raw) as { refinedJd: string; changes: string[] }

  return NextResponse.json(result)
}
```

- [ ] **Step 3: Kiểm tra compile**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit
```

Expected: không có lỗi.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/questionnaire/
git commit -m "feat: add answers and refine-jd APIs"
```

---

## Task 5: Wizard Component + Public Form Page

**Files:**
- Create: `src/components/QuestionnaireWizard.tsx`
- Create: `src/app/q/[token]/page.tsx`

- [ ] **Step 1: Tạo QuestionnaireWizard client component**

`src/components/QuestionnaireWizard.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Question } from '@/lib/supabase'

type Props = {
  questionnaireId: string
  token: string
  questions: Question[]
  prefilledAnswers: Record<string, unknown>
}

const SECTION_LABELS: Record<number, string> = {
  1: 'Outcome of the job',
  2: 'History of the job',
  3: 'Requirement of the job',
  4: 'Culture fit',
  5: 'Package',
  6: 'Interview process',
  7: 'Unique Selling Point',
}

export default function QuestionnaireWizard({
  token,
  questions,
  prefilledAnswers,
}: Props) {
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState<Record<string, unknown>>(prefilledAnswers)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const sections = Array.from({ length: 7 }, (_, i) => i + 1)
  const currentQuestions = questions.filter((q) => q.section === step)
  const totalSections = 7

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  function toggleMulti(questionId: string, option: string) {
    const current = (answers[questionId] as string[]) ?? []
    const next = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option]
    setAnswer(questionId, next)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/q/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (res.ok) setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Đã gửi xác nhận!</h2>
          <p className="text-gray-500 text-sm">Recruiter sẽ nhận được câu trả lời của anh/chị và tinh chỉnh lại JD.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {/* Header */}
          <div className="bg-indigo-600 px-6 py-5 text-white">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <span className="font-bold text-sm">J</span>
              </div>
              <span className="font-semibold text-sm">Jane AI</span>
            </div>
            <h1 className="text-xl font-bold mt-1">Xác nhận yêu cầu tuyển dụng</h1>
          </div>

          {/* Progress */}
          <div className="px-6 pt-5 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-indigo-600">
                #{step} · {SECTION_LABELS[step]}
              </span>
              <span className="text-xs text-gray-400">{step} / {totalSections}</span>
            </div>
            <div className="flex gap-1">
              {sections.map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-indigo-600' : 'bg-indigo-100'}`}
                />
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <span className="text-amber-500 font-bold text-sm leading-none mt-0.5">✦</span>
              <p className="text-xs text-amber-700">
                Jane đã đọc JD và <span className="font-semibold">điền trước</span> một số ô. Anh/chị chỉ cần xem lại và sửa nếu sai.
              </p>
            </div>
          </div>

          {/* Questions */}
          <div className="px-6 pb-6 pt-4 space-y-4">
            {currentQuestions.map((q) => (
              <div key={q.id} className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-gray-800">{q.text}</p>
                {q.aiPrefilled && (
                  <p className="text-xs text-amber-600">✦ Jane gợi ý — nhấn để sửa</p>
                )}

                {q.type === 'open' && (
                  <textarea
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
                    value={(answers[q.id] as string) ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                  />
                )}

                {q.type === 'yes_no' && q.options && (
                  <div className="flex gap-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setAnswer(q.id, opt)}
                        className={`flex-1 rounded-lg py-2.5 text-sm border-2 transition-colors ${
                          answers[q.id] === opt
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-medium'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'multiple_choice' && q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer border-2 transition-colors ${
                          answers[q.id] === opt
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswer(q.id, opt)}
                          className="text-indigo-600"
                        />
                        <span className="text-sm text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'checkbox_multi' && q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const selected = ((answers[q.id] as string[]) ?? []).includes(opt)
                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer border-2 transition-colors ${
                            selected ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleMulti(q.id, opt)}
                            className="text-indigo-600"
                          />
                          <span className="text-sm text-gray-700">{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'skill_matrix' && (
                  <div className="space-y-2">
                    {((answers[q.id] as Array<{ skill: string; level: string }>) ?? []).map(
                      (item, i) => (
                        <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                          <span className="text-sm text-gray-700">{item.skill}</span>
                          <div className="flex gap-1">
                            {['MUST', 'NICE'].map((level) => (
                              <button
                                key={level}
                                onClick={() => {
                                  const updated = [...((answers[q.id] as Array<{ skill: string; level: string }>) ?? [])]
                                  updated[i] = { ...updated[i], level }
                                  setAnswer(q.id, updated)
                                }}
                                className={`text-xs font-bold px-2 py-0.5 rounded border transition-colors ${
                                  item.level === level
                                    ? level === 'MUST'
                                      ? 'text-red-600 bg-red-50 border-red-200'
                                      : 'text-amber-600 bg-amber-50 border-amber-200'
                                    : 'text-gray-400 bg-gray-50 border-gray-200'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Nav */}
            <div className="flex gap-3 pt-2">
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="px-5 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium"
                >
                  ← Quay lại
                </button>
              )}
              {step < totalSections ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Tiếp theo →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 bg-green-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Đang gửi...' : 'Gửi xác nhận →'}
                </button>
              )}
            </div>
            <p className="text-center text-xs text-gray-400">
              Không cần tài khoản · Câu trả lời gửi thẳng cho recruiter
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tạo public page `/q/[token]`**

`src/app/q/[token]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import QuestionnaireWizard from '@/components/QuestionnaireWizard'
import { Question } from '@/lib/supabase'

export default async function QuestionnairePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/q/${token}`,
    { cache: 'no-store' }
  )

  if (!res.ok) {
    if (res.status === 409) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Bảng hỏi đã được điền</h2>
            <p className="text-gray-500 text-sm">Anh/chị đã submit rồi. Cảm ơn!</p>
          </div>
        </div>
      )
    }
    if (res.status === 410) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link đã hết hạn</h2>
            <p className="text-gray-500 text-sm">Vui lòng liên hệ recruiter để nhận link mới.</p>
          </div>
        </div>
      )
    }
    notFound()
  }

  const data = await res.json() as {
    id: string
    questions: Question[]
    prefilled_answers: Record<string, unknown>
  }

  return (
    <QuestionnaireWizard
      questionnaireId={data.id}
      token={token}
      questions={data.questions}
      prefilledAnswers={data.prefilled_answers}
    />
  )
}
```

- [ ] **Step 3: Thêm `NEXT_PUBLIC_APP_URL` vào `.env.local`**

Mở `.env.local`, thêm dòng:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

(Khi deploy Vercel thì set biến này thành URL production)

- [ ] **Step 4: Kiểm tra compile**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit
```

Expected: không có lỗi.

- [ ] **Step 5: Test thủ công**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npm run dev
```

Mở browser, gọi API generate thủ công qua curl để lấy token:
```bash
# Lấy một jd_history_id từ Supabase dashboard trước
curl -X POST http://localhost:3000/api/questionnaire/generate \
  -H "Content-Type: application/json" \
  -d '{"jdHistoryId":"<id>","jobTitle":"Senior Frontend Developer","generatedJd":"<nội dung JD>"}'
```

Copy token từ response, mở `http://localhost:3000/q/<token>`. Expected: thấy wizard bước 1.

- [ ] **Step 6: Commit**

```bash
git add src/components/QuestionnaireWizard.tsx src/app/q/ .env.local
git commit -m "feat: add public questionnaire wizard page"
```

---

## Task 6: Recruiter UI — Nút "Tạo bảng hỏi" + View Answers

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Thêm state và handlers vào `page.tsx`**

Thêm vào phần imports và state (sau các state hiện có):

```typescript
// Thêm vào imports
// (không cần import thêm, đã có useState, fetch)

// Thêm state sau const [showHistory, setShowHistory] = useState(false)
const [questionnaireToken, setQuestionnaireToken] = useState<string | null>(null)
const [questionnaireId, setQuestionnaireId] = useState<string | null>(null)
const [answers, setAnswers] = useState<Record<string, unknown> | null>(null)
const [refinedJd, setRefinedJd] = useState('')
const [changes, setChanges] = useState<string[]>([])
const [generatingQ, setGeneratingQ] = useState(false)
const [refining, setRefining] = useState(false)
const [currentJdHistoryId, setCurrentJdHistoryId] = useState<string | null>(null)
```

- [ ] **Step 2: Cập nhật `handleGenerate` để lưu `jdHistoryId`**

Thay `handleGenerate` thành:

```typescript
async function handleGenerate() {
  if (!jobTitle.trim() || !rawInput.trim()) return
  setLoading(true)
  setGeneratedJd('')
  setQuestionnaireToken(null)
  setQuestionnaireId(null)
  setAnswers(null)
  setRefinedJd('')
  setChanges([])
  setCurrentJdHistoryId(null)

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobTitle, rawInput }),
    })
    const data = await res.json()
    if (data.generatedJd) {
      setGeneratedJd(data.generatedJd)
      setCurrentJdHistoryId(data.jdHistoryId ?? null)
      fetchHistory()
    } else {
      setGeneratedJd('Có lỗi xảy ra: ' + data.error)
    }
  } catch {
    setGeneratedJd('Không kết nối được, thử lại nhé!')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 3: Cập nhật `/api/generate/route.ts` để trả về `jdHistoryId`**

Trong `src/app/api/generate/route.ts`, thay dòng `return NextResponse.json({ generatedJd })` thành:

```typescript
const { data: inserted, error } = await getSupabase()
  .from('jd_history')
  .insert({
    job_title: jobTitle,
    raw_input: rawInput,
    generated_jd: generatedJd,
  } as any)
  .select('id')
  .single()

if (error) {
  console.error('Supabase error:', error)
}

return NextResponse.json({ generatedJd, jdHistoryId: inserted?.id ?? null })
```

- [ ] **Step 4: Thêm handlers `handleCreateQuestionnaire`, `handleCheckAnswers`, `handleRefineJd`**

Thêm vào sau `handleCopy`:

```typescript
async function handleCreateQuestionnaire() {
  if (!currentJdHistoryId || !generatedJd) return
  setGeneratingQ(true)
  try {
    const res = await fetch('/api/questionnaire/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdHistoryId: currentJdHistoryId, jobTitle, generatedJd }),
    })
    const data = await res.json()
    if (data.token) {
      setQuestionnaireToken(data.token)
      setQuestionnaireId(data.id)
    }
  } catch {
    alert('Có lỗi khi tạo bảng hỏi')
  } finally {
    setGeneratingQ(false)
  }
}

async function handleCheckAnswers() {
  if (!questionnaireId) return
  const res = await fetch(`/api/questionnaire/${questionnaireId}/answers`)
  const data = await res.json()
  if (data.answers) setAnswers(data.answers)
}

async function handleRefineJd() {
  if (!questionnaireId) return
  setRefining(true)
  try {
    const res = await fetch(`/api/questionnaire/${questionnaireId}/refine-jd`, { method: 'POST' })
    const data = await res.json()
    if (data.refinedJd) {
      setRefinedJd(data.refinedJd)
      setChanges(data.changes ?? [])
    }
  } catch {
    alert('Có lỗi khi tinh chỉnh JD')
  } finally {
    setRefining(false)
  }
}

function handleConfirmRefinedJd() {
  setGeneratedJd(refinedJd)
  setRefinedJd('')
  setChanges([])
  fetchHistory()
}
```

- [ ] **Step 5: Thêm UI vào output panel**

Trong phần output panel (sau `</pre>` của `generatedJd`), thêm:

```tsx
{/* Bảng hỏi section */}
{generatedJd && !refinedJd && (
  <div className="mt-4 pt-4 border-t border-gray-100">
    {!questionnaireToken ? (
      <button
        onClick={handleCreateQuestionnaire}
        disabled={generatingQ || !currentJdHistoryId}
        className="w-full border-2 border-dashed border-indigo-300 text-indigo-600 rounded-xl py-3 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
      >
        {generatingQ ? 'Đang tạo bảng hỏi...' : '+ Tạo bảng hỏi cho sếp'}
      </button>
    ) : (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
          <span className="text-xs text-indigo-700 flex-1 truncate">
            Link: /q/{questionnaireToken}
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/q/${questionnaireToken}`)}
            className="text-xs text-indigo-600 font-medium whitespace-nowrap"
          >
            Copy link
          </button>
        </div>
        {!answers ? (
          <button
            onClick={handleCheckAnswers}
            className="w-full border border-indigo-200 text-indigo-600 rounded-xl py-2 text-sm hover:bg-indigo-50 transition-colors"
          >
            Kiểm tra sếp đã điền chưa
          </button>
        ) : (
          <button
            onClick={handleRefineJd}
            disabled={refining}
            className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {refining ? 'Đang tinh chỉnh...' : '✦ Tinh chỉnh JD từ câu trả lời'}
          </button>
        )}
      </div>
    )}
  </div>
)}

{/* Refined JD review */}
{refinedJd && (
  <div className="mt-4 pt-4 border-t border-gray-100">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm font-medium text-gray-700">JD đề xuất sau tinh chỉnh</p>
      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Chờ confirm</span>
    </div>
    {changes.length > 0 && (
      <ul className="mb-3 space-y-1">
        {changes.map((c, i) => (
          <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
            <span className="text-green-500 mt-0.5">↑</span>{c}
          </li>
        ))}
      </ul>
    )}
    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-4 max-h-60 overflow-y-auto">
      {refinedJd}
    </pre>
    <div className="flex gap-2 mt-3">
      <button
        onClick={() => { setRefinedJd(''); setChanges([]) }}
        className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm"
      >
        Bỏ qua
      </button>
      <button
        onClick={handleConfirmRefinedJd}
        className="flex-1 bg-green-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-green-700"
      >
        Xác nhận JD mới
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Kiểm tra compile**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit
```

Expected: không có lỗi.

- [ ] **Step 7: Test end-to-end thủ công**

```bash
npm run dev
```

Thực hiện flow đầy đủ:
1. Điền job title + yêu cầu thô → Tạo JD
2. Nhấn "Tạo bảng hỏi cho sếp" → thấy link `/q/[token]`
3. Copy link, mở tab mới, điền wizard 7 bước, submit
4. Quay lại tab recruiter, nhấn "Kiểm tra sếp đã điền chưa"
5. Nhấn "Tinh chỉnh JD" → thấy JD mới + danh sách changes
6. Nhấn "Xác nhận JD mới" → JD được update

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/app/api/generate/route.ts
git commit -m "feat: add questionnaire UI to recruiter page"
```

---

## Self-Review

**Spec coverage:**
- ✅ Flow recruiter → generate → link → sếp điền → recruiter tinh chỉnh
- ✅ Wizard 7 bước, AI pre-fill
- ✅ Public link không cần login, token expires 30 ngày
- ✅ Schema `questionnaires` + `questionnaire_answers` với FK vào `jd_history`
- ✅ 5 API routes đúng spec
- ✅ 2 AI calls: generate questions, refine JD
- ✅ Framing câu hỏi theo góc hiring manager

**Placeholders:** Không có TBD hay TODO còn sót.

**Type consistency:**
- `Question` type dùng nhất quán từ Task 1 → Task 5 → Task 6
- `questionnaireId` / `token` dùng đúng tên trong tất cả handlers
- `answers` là `Record<string, unknown>` nhất quán giữa submit API và page state
