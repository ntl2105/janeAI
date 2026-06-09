import { getSupabaseAdmin } from '@/lib/supabase'
import type { NormalizedLeadPayload, RecruitingChatMessageInsert } from './persistence'

type SupabaseAny = ReturnType<typeof getSupabaseAdmin> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

function db(): SupabaseAny {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSupabaseAdmin() as any
}

export async function getOrCreateRecruitingConversation({
  conversationId,
  userId,
}: {
  conversationId?: string | null
  userId: string
}): Promise<string> {
  if (conversationId) {
    const { data, error } = await (db().from('recruiting_chat_conversations') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    if (data?.id) return String(data.id)
  }

  const id = crypto.randomUUID()
  const { data, error } = await (db().from('recruiting_chat_conversations') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({ id, user_id: userId })
    .select('id')
    .maybeSingle()

  if (error) throw error
  return data?.id ? String(data.id) : id
}

export async function saveRecruitingChatMessage(input: RecruitingChatMessageInsert) {
  const { error } = await (db().from('recruiting_chat_messages') as any).insert(input) // eslint-disable-line @typescript-eslint/no-explicit-any
  if (error) throw error
}

export async function saveRecruitingLead({
  userId,
  payload,
}: {
  userId: string
  payload: NormalizedLeadPayload
}) {
  const { data, error } = await (db().from('recruiting_leads') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({
      user_id: userId,
      conversation_id: payload.conversationId,
      email: payload.email,
      name: payload.name,
      company: payload.company,
      hiring_need: payload.hiringNeed,
      metadata: {
        source: 'recruiting_chatbot',
        capturedAt: new Date().toISOString(),
      },
    })
    .select('id')
    .maybeSingle()

  if (error) throw error
  return data?.id ? String(data.id) : null
}
