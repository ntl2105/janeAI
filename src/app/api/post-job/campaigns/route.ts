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
