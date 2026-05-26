# JD Paste Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi flow chính thành "paste JD → tạo bảng hỏi", giữ generate JD như accordion phụ.

**Architecture:** 2 thay đổi độc lập: (1) API `questionnaire/generate` nhận `jdText` thay vì `jdHistoryId+jobTitle+generatedJd` — tự lưu vào `jd_history` và extract title bằng AI; (2) `page.tsx` đổi layout thành single-column, ô paste JD là primary input, accordion "Gợi ý draft" là secondary.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Anthropic SDK (`claude-opus-4-7`), Supabase JS v2.

---

## File Map

| File | Action | Mục đích |
|------|--------|----------|
| `src/app/api/questionnaire/generate/route.ts` | Modify | Nhận `jdText`, tự lưu jd_history + extract title |
| `src/app/page.tsx` | Modify | Single-column layout, paste JD primary, draft accordion phụ |

---

## Task 1: Update Questionnaire Generate API

**Files:**
- Modify: `src/app/api/questionnaire/generate/route.ts`

**Context:** Hiện tại API nhận `{jdHistoryId, jobTitle, generatedJd}` — recruiter phải generate JD trước rồi mới tạo bảng hỏi. Giờ đổi sang nhận `{jdText}` — API tự extract title + lưu vào jd_history + tạo questionnaire trong 1 call.

Hiện tại file (`src/app/api/questionnaire/generate/route.ts`) dùng `.single()` sau khi insert questionnaire — nếu insert fail, `.single()` sẽ throw. Đổi sang `.maybeSingle()` cho an toàn.

- [ ] **Step 1: Đọc file hiện tại**

```bash
cat "/Users/Macbook/Claude Code/jane-ai/src/app/api/questionnaire/generate/route.ts"
```

- [ ] **Step 2: Thay toàn bộ file bằng version mới**

`src/app/api/questionnaire/generate/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'
import { Question } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { jdText } = await req.json()

    if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
      return NextResponse.json({ error: 'Thiếu nội dung JD' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `Bạn là chuyên gia tuyển dụng. Dựa trên JD sau, hãy:
1. Extract tên vị trí tuyển dụng (jobTitle)
2. Tạo bảng hỏi 7 nhóm dành cho HIRING MANAGER (sếp trực tiếp), KHÔNG phải HR

Câu hỏi phải là những gì sếp biết và quyết định được: lý do mở vị trí, tiêu chí thực sự, văn hoá team, lịch phỏng vấn, điểm đặc biệt của team. KHÔNG hỏi về gói bảo hiểm, training budget (đó là việc HR).

**JD:**
${jdText}

Trả về JSON theo đúng format sau, không thêm bất kỳ text nào khác:

{
  "jobTitle": "Senior Frontend Developer",
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
    const cleanRaw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleanRaw) as {
      jobTitle: string
      questions: Question[]
      prefilled_answers: Record<string, unknown>
    }

    // Lưu JD vào jd_history trước
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jdRecord, error: jdError } = await (getSupabase() as any)
      .from('jd_history')
      .insert({
        job_title: parsed.jobTitle || 'Không rõ vị trí',
        raw_input: jdText,
        generated_jd: jdText,
      })
      .select('id')
      .maybeSingle()

    if (jdError) {
      console.error('Supabase jd_history error:', jdError)
      return NextResponse.json({ error: 'Lỗi lưu JD' }, { status: 500 })
    }

    // Tạo questionnaire linked với jd_history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any)
      .from('questionnaires')
      .insert({
        jd_history_id: jdRecord?.id ?? null,
        questions: parsed.questions,
        prefilled_answers: parsed.prefilled_answers,
      })
      .select('id, token')
      .maybeSingle()

    if (error || !data) {
      console.error('Supabase questionnaire error:', error)
      return NextResponse.json({ error: 'Lỗi lưu bảng hỏi' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, token: data.token })
  } catch (error) {
    console.error('Generate questionnaire error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Kiểm tra TypeScript**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1
```

Expected: không có lỗi mới (pre-existing `as any` errors OK).

- [ ] **Step 4: Commit**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add src/app/api/questionnaire/generate/route.ts && git commit -m "feat: questionnaire generate API accepts jdText, auto-saves to jd_history"
```

---

## Task 2: Rewrite Page UI — Single Column + Paste JD Primary

**Files:**
- Modify: `src/app/page.tsx`

**Context:** Hiện tại `page.tsx` dùng 2-column layout (input panel trái, output panel phải). Giờ đổi thành single-column max-w-2xl:
- Card chính: textarea paste JD + button "Tạo bảng hỏi cho sếp"
- Accordion ẩn: form title + rawInput → generate draft → điền vào textarea chính
- Phần bảng hỏi/answers/refined JD: giữ nguyên logic, chỉ đổi layout

State mới:
- `pastedJd` — nội dung JD chính (textarea lớn)
- `showDraftPanel` — accordion toggle
- `draftJd` — JD draft từ generate API (hiện trong accordion)
- `generatingDraft` — loading state cho draft

State bỏ:
- `generatedJd` → đổi thành `pastedJd`
- `currentJdHistoryId` → API tự xử lý
- `jobTitle` vẫn giữ (cho draft flow), `rawInput` vẫn giữ

- [ ] **Step 1: Đọc file hiện tại để hiểu cấu trúc**

```bash
cat "/Users/Macbook/Claude Code/jane-ai/src/app/page.tsx"
```

- [ ] **Step 2: Thay toàn bộ file**

`src/app/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { JdHistory } from '@/lib/supabase'

export default function Home() {
  // Primary state
  const [pastedJd, setPastedJd] = useState('')

  // Draft flow (accordion)
  const [jobTitle, setJobTitle] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [showDraftPanel, setShowDraftPanel] = useState(false)
  const [draftJd, setDraftJd] = useState('')
  const [generatingDraft, setGeneratingDraft] = useState(false)

  // History
  const [history, setHistory] = useState<Pick<JdHistory, 'id' | 'job_title' | 'created_at'>[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Questionnaire flow
  const [questionnaireToken, setQuestionnaireToken] = useState<string | null>(null)
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null)
  const [refinedJd, setRefinedJd] = useState('')
  const [changes, setChanges] = useState<string[]>([])
  const [generatingQ, setGeneratingQ] = useState(false)
  const [refining, setRefining] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notAnsweredYet, setNotAnsweredYet] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showRefinedToast, setShowRefinedToast] = useState(false)

  const refinedJdRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchHistory()
  }, [])

  async function fetchHistory() {
    try {
      const res = await fetch('/api/history')
      const data = await res.json()
      if (data.history) setHistory(data.history)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleHistoryClick(id: string) {
    const res = await fetch(`/api/history/${id}`)
    const data = await res.json()
    if (data.item) {
      setPastedJd(data.item.generated_jd)
      setJobTitle(data.item.job_title)
      setRawInput(data.item.raw_input ?? '')
      setQuestionnaireToken(null)
      setQuestionnaireId(null)
      setAnswers(null)
      setRefinedJd('')
      setChanges([])
      setNotAnsweredYet(false)
      setShowHistory(false)
    }
  }

  async function handleGenerateDraft() {
    if (!jobTitle.trim() || !rawInput.trim()) return
    setGeneratingDraft(true)
    setDraftJd('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle, rawInput }),
      })
      const data = await res.json()
      if (data.generatedJd) {
        setDraftJd(data.generatedJd)
      } else {
        alert('Có lỗi khi gợi ý JD: ' + (data.error ?? ''))
      }
    } catch {
      alert('Không kết nối được, thử lại nhé!')
    } finally {
      setGeneratingDraft(false)
    }
  }

  function handleUseDraft() {
    setPastedJd(draftJd)
    setDraftJd('')
    setShowDraftPanel(false)
  }

  async function handleCreateQuestionnaire() {
    if (!pastedJd.trim()) return
    setGeneratingQ(true)
    setQuestionnaireToken(null)
    setQuestionnaireId(null)
    setAnswers(null)
    setRefinedJd('')
    setChanges([])
    setNotAnsweredYet(false)
    try {
      const res = await fetch('/api/questionnaire/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText: pastedJd }),
      })
      const data = await res.json()
      if (data.token) {
        setQuestionnaireToken(data.token)
        setQuestionnaireId(data.id)
        fetchHistory()
      } else {
        alert('Có lỗi khi tạo bảng hỏi: ' + (data.error ?? ''))
      }
    } catch {
      alert('Không kết nối được, thử lại nhé!')
    } finally {
      setGeneratingQ(false)
    }
  }

  async function handleCheckAnswers() {
    if (!questionnaireId) return
    setChecking(true)
    setNotAnsweredYet(false)
    const res = await fetch(`/api/questionnaire/${questionnaireId}/answers`)
    const data = await res.json()
    if (data.answers) {
      setAnswers(data.answers)
    } else {
      setNotAnsweredYet(true)
    }
    setChecking(false)
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
        setShowRefinedToast(true)
        setTimeout(() => setShowRefinedToast(false), 4000)
        setTimeout(() => refinedJdRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      } else {
        alert('Lỗi: ' + (data.error ?? 'Không rõ nguyên nhân'))
      }
    } catch (e) {
      console.error('Refine error:', e)
      alert('Không kết nối được server, thử lại nhé!')
    } finally {
      setRefining(false)
    }
  }

  function handleConfirmRefinedJd() {
    setPastedJd(refinedJd)
    setRefinedJd('')
    setChanges([])
    fetchHistory()
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {showRefinedToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-semibold">JD đã tinh chỉnh xong! Xem bên dưới 👇</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">J</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-none">Jane AI</h1>
              <p className="text-xs text-gray-500">Questionnaire Generator</p>
            </div>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Lịch sử ({history.length})
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        {/* History dropdown */}
        {showHistory && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm">JD đã tạo</h2>
            </div>
            <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">Chưa có JD nào</p>
              ) : (
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
              )}
            </div>
          </div>
        )}

        {/* Card chính: Paste JD */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Paste JD vào đây</h2>
            <p className="text-xs text-gray-400">Jane sẽ tự đọc và tạo bảng hỏi cho sếp xác nhận</p>
          </div>
          <textarea
            value={pastedJd}
            onChange={(e) => setPastedJd(e.target.value)}
            rows={10}
            placeholder={'Paste toàn bộ JD vào đây...\n\nVD:\nSenior Frontend Developer\nCông ty ABC đang tìm kiếm...\nYêu cầu: 3+ năm kinh nghiệm React...'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <button
            onClick={handleCreateQuestionnaire}
            disabled={generatingQ || !pastedJd.trim()}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {generatingQ ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang tạo bảng hỏi... (~15s)
              </>
            ) : (
              <>✦ Tạo bảng hỏi cho sếp</>
            )}
          </button>
        </div>

        {/* Accordion: Chưa có JD */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowDraftPanel(!showDraftPanel)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span>Chưa có JD? Để Jane gợi ý draft</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showDraftPanel ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDraftPanel && (
            <div className="px-6 pb-6 space-y-3 border-t border-gray-100 pt-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vị trí tuyển dụng</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="VD: Senior Frontend Developer"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Yêu cầu thô</label>
                <textarea
                  rows={4}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="3 năm React, tiếng Anh tốt, lương 2000-3000 USD..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>
              <button
                onClick={handleGenerateDraft}
                disabled={generatingDraft || !jobTitle.trim() || !rawInput.trim()}
                className="w-full border border-indigo-300 text-indigo-600 rounded-lg py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition-colors"
              >
                {generatingDraft ? 'Đang gợi ý...' : 'Gợi ý JD draft →'}
              </button>

              {draftJd && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-amber-700">✦ Jane gợi ý — chưa chính xác</p>
                    <button
                      onClick={handleUseDraft}
                      className="text-xs text-indigo-600 font-medium border border-indigo-200 rounded-lg px-3 py-1 hover:bg-indigo-50 bg-white"
                    >
                      Dùng draft này →
                    </button>
                  </div>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                    {draftJd}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Questionnaire section */}
        {questionnaireToken && (
          <div className="space-y-3">
            {/* Link */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <p className="text-sm font-medium text-gray-700">Bảng hỏi đã tạo xong</p>
              </div>
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <span className="text-xs text-indigo-700 flex-1 truncate">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/q/{questionnaireToken}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/q/${questionnaireToken}`)
                    setCopiedLink(true)
                    setTimeout(() => setCopiedLink(false), 2000)
                  }}
                  className={`text-xs font-medium whitespace-nowrap transition-colors ${copiedLink ? 'text-green-600' : 'text-indigo-600'}`}
                >
                  {copiedLink ? '✓ Đã copy!' : 'Copy link'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Gửi link này cho sếp qua Zalo/email — không cần đăng nhập</p>
            </div>

            {/* Answers check */}
            {!answers ? (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <button
                  onClick={handleCheckAnswers}
                  disabled={checking}
                  className="w-full border border-indigo-200 text-indigo-600 rounded-xl py-2.5 text-sm hover:bg-indigo-50 transition-colors disabled:opacity-60"
                >
                  {checking ? 'Đang kiểm tra...' : 'Kiểm tra sếp đã điền chưa'}
                </button>
                {notAnsweredYet && (
                  <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-1.5">
                    Sếp chưa điền, gửi link nhắc sếp nhé 😅
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-green-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-green-800">Sếp đã điền xong!</p>
                </div>
                <button
                  onClick={handleRefineJd}
                  disabled={refining}
                  className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {refining ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Đang tinh chỉnh... (~15s)
                    </>
                  ) : '✦ Tinh chỉnh JD từ câu trả lời'}
                </button>
              </div>
            )}

            {/* Refined JD */}
            {refinedJd && (
              <div ref={refinedJdRef} className="bg-white rounded-xl border border-indigo-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">JD đề xuất sau tinh chỉnh</p>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Chờ confirm</span>
                </div>
                {changes.length > 0 && (
                  <ul className="space-y-1">
                    {changes.map((c, i) => (
                      <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
                        <span className="text-green-500 mt-0.5 shrink-0">↑</span>{c}
                      </li>
                    ))}
                  </ul>
                )}
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-4 max-h-60 overflow-y-auto">
                  {refinedJd}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setRefinedJd(''); setChanges([]) }}
                    className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50"
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
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Kiểm tra TypeScript**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1
```

Expected: không có lỗi mới.

- [ ] **Step 4: Commit**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add src/app/page.tsx && git commit -m "feat: redesign UI to paste-JD-first single column layout"
```

---

## Task 3: Deploy

**Files:** None

- [ ] **Step 1: Deploy lên Vercel**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && vercel --prod 2>&1
```

Expected: `▲ Aliased https://jane-ai-seven.vercel.app`

- [ ] **Step 2: Smoke test**

```bash
curl -s -X POST https://jane-ai-seven.vercel.app/api/questionnaire/generate \
  -H "Content-Type: application/json" \
  -d '{"jdText":"Senior Frontend Developer\n3+ nam React, TypeScript\nLuong 2000 USD\nRemote 100%"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('token:', d.get('token','ERROR'))"
```

Expected: `token: <32-char-hex>`

---

## Self-Review

**Spec coverage:**
- ✅ Flow chính: paste JD → tạo bảng hỏi
- ✅ Flow phụ: accordion gợi ý draft
- ✅ API nhận `jdText`, tự lưu jd_history + extract title
- ✅ Layout single column max-w-2xl
- ✅ History: click → điền vào `pastedJd`
- ✅ Toàn bộ questionnaire/answers/refined JD flow giữ nguyên

**Placeholders:** Không có TBD.

**Type consistency:**
- `pastedJd` dùng nhất quán trong page.tsx
- `jdText` là tên field API nhất quán giữa Task 1 và Task 2
- `handleCreateQuestionnaire` gọi với `{jdText: pastedJd}` đúng
