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
    }

    return NextResponse.json({ generated })
  } catch (error) {
    console.error('Generate posts error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
