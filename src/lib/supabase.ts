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
  language: 'vi' | 'en'
  expires_at: string
  created_at: string
}

export type QuestionnaireAnswer = {
  id: string
  questionnaire_id: string
  answers: Record<string, unknown>
  submitted_at: string
}
