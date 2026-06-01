# Jane AI

AI-powered recruitment assistant for creating job descriptions, sending candidate questionnaires, and publishing job postings across multiple platforms.

## Features

- **AI Job Description Generator** — Generate polished JDs from a URL or manual input using Claude
- **Candidate Questionnaires** — Send tokenized questionnaire links to candidates; collect and summarize answers with AI
- **Multi-platform Job Posting** — Publish job posts to LinkedIn, Facebook, and other channels
- **Recruiter Dashboard** — Track questionnaire history, candidate status (hired/rejected), and send reminders
- **Auth** — Sign in with Clerk; OAuth integrations per posting platform

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **AI:** Anthropic Claude (`@anthropic-ai/sdk`)
- **Auth:** Clerk
- **Database:** Supabase
- **Styling:** Tailwind CSS v4

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ENCRYPTION_KEY=
```

## Project Structure

```
src/
├── app/
│   ├── app/          # Recruiter dashboard
│   ├── admin/        # Admin panel
│   ├── q/[token]/    # Candidate questionnaire flow
│   ├── sign-in/
│   ├── sign-up/
│   └── api/
│       ├── generate/           # AI JD generation
│       ├── questionnaire/      # Questionnaire CRUD & resend
│       ├── history/            # JD history
│       ├── post-job/           # Job posting & publishing
│       ├── feedback/           # Feedback widget
│       ├── reminders/          # Reminder banners
│       └── auth/[platform]/    # OAuth per platform
├── components/
└── lib/              # Supabase client, encryption, rate limiting
```

## Deploy

Deployed on Vercel at [ai.bebetterwithjane.com](https://ai.bebetterwithjane.com).
