-- NOTE: The jd_history table already exists in the database.
-- Run this script only to add the questionnaire tables.

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
  questionnaire_id uuid unique references questionnaires(id) on delete cascade,
  answers jsonb not null default '{}',
  submitted_at timestamptz default now()
);

create index idx_qa_questionnaire_id on questionnaire_answers(questionnaire_id);
