import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  APPROVED_RISK_LEVEL,
  loadApprovedChunksFromText,
  parseApprovedChunkLine,
} from '@/lib/recruiting-rag/approved-chunks'
import {
  DEFAULT_RAG_MIN_SCORE,
  buildRetrievalQuery,
  formatRetrievedContext,
  prepareRagForChat,
  retrieveRelevantChunks,
} from '@/lib/recruiting-rag/retrieval'
import { buildRecruitingSystemPrompt } from '@/lib/recruiting-rag/prompt'

describe('approved recruiting chunks', () => {
  it('parses approved chunks and preserves embedding text for retrieval', () => {
    const chunk = parseApprovedChunkLine(
      JSON.stringify({
        id: 'chunk-1',
        text: 'Raw approved text',
        embedding_text: 'Retrieval card text',
        topic: 'candidate_persona',
        source_label: 'JaneAI recruiting training corpus',
        risk_level: APPROVED_RISK_LEVEL,
        metadata: { customer_facing_summary: 'Safe summary' },
      }),
      1
    )

    assert.equal(chunk.id, 'chunk-1')
    assert.equal(chunk.text, 'Raw approved text')
    assert.equal(chunk.embeddingText, 'Retrieval card text')
    assert.equal(chunk.topic, 'candidate_persona')
  })

  it('rejects chunks that are not approved public', () => {
    assert.throws(
      () =>
        parseApprovedChunkLine(
          JSON.stringify({
            id: 'chunk-1',
            text: 'Unreviewed text',
            topic: 'candidate_persona',
            source_label: 'JaneAI recruiting training corpus',
            risk_level: 'unreviewed',
          }),
          1
        ),
      /approved_public/
    )
  })

  it('deduplicates chunks by id when loading JSONL', () => {
    const line = JSON.stringify({
      id: 'chunk-1',
      text: 'Approved text',
      topic: 'candidate_persona',
      source_label: 'JaneAI recruiting training corpus',
      risk_level: APPROVED_RISK_LEVEL,
    })

    assert.equal(loadApprovedChunksFromText(`${line}\n${line}\n`).length, 1)
  })
})

describe('recruiting retrieval', () => {
  const chunks = loadApprovedChunksFromText(
    [
      {
        id: 'sourcing',
        text: 'Choose sourcing channels by seniority and candidate persona.',
        embedding_text:
          'LinkedIn senior roles Facebook junior roles sourcing channel candidate persona',
        topic: 'sourcing_strategy',
        source_label: 'JaneAI recruiting training corpus',
        risk_level: APPROVED_RISK_LEVEL,
      },
      {
        id: 'interview',
        text: 'Interview process can include screening, tests, presentations, and evaluation.',
        embedding_text:
          'interview process screening test presentation candidate evaluation rounds',
        topic: 'interview_process',
        source_label: 'JaneAI recruiting training corpus',
        risk_level: APPROVED_RISK_LEVEL,
      },
    ]
      .map((chunk) => JSON.stringify(chunk))
      .join('\n')
  )

  it('builds the retrieval query from the latest user message text', () => {
    const query = buildRetrievalQuery([
      { role: 'user', content: 'Tôi cần tuyển senior data scientist' },
      { role: 'assistant', content: 'Role ở đâu?' },
      { role: 'user', content: 'Nên dùng LinkedIn hay Facebook?' },
    ])

    assert.equal(query, 'Nên dùng LinkedIn hay Facebook?')
  })

  it('scores against embedding text when present', () => {
    const [top] = retrieveRelevantChunks('senior LinkedIn sourcing channel', chunks, 2)

    assert.equal(top.chunkId, 'sourcing')
    assert.ok(top.score >= DEFAULT_RAG_MIN_SCORE)
  })

  it('does not let short Vietnamese filler words hide a matching follow-up topic', () => {
    const [top] = retrieveRelevantChunks('còn vòng interview thì sao?', chunks, 2)

    assert.equal(top.chunkId, 'interview')
    assert.ok(top.score >= DEFAULT_RAG_MIN_SCORE)
  })

  it('filters weak results before preparing prompt context', () => {
    const rag = prepareRagForChat([
      {
        chunkId: 'weak',
        text: 'Weak text',
        topic: 'candidate_persona',
        sourceLabel: 'Guide',
        score: 0.1,
      },
      {
        chunkId: 'strong',
        text: 'Strong interview guidance',
        topic: 'interview_process',
        sourceLabel: 'Guide',
        score: DEFAULT_RAG_MIN_SCORE,
      },
    ])

    assert.equal(rag.hasStrongContext, true)
    assert.deepEqual(rag.usedChunkIds, ['strong'])
    assert.match(rag.retrievedContext, /Strong interview guidance/)
    assert.doesNotMatch(rag.retrievedContext, /Weak text/)
  })

  it('formats retrieved context without exposing private internals', () => {
    const context = formatRetrievedContext([
      {
        chunkId: 'chunk-1',
        text: 'Clarify must-have and nice-to-have requirements.',
        topic: 'hiring_intake',
        sourceLabel: 'JaneAI recruiting training corpus',
        score: 0.9,
      },
    ])

    assert.match(context, /Source 1/)
    assert.match(context, /hiring_intake/)
    assert.match(context, /Clarify must-have/)
  })
})

describe('recruiting prompt', () => {
  it('includes approved context and safety instructions', () => {
    const prompt = buildRecruitingSystemPrompt({
      retrievedContext: '[Source 1]\nText: Clarify hiring need first.',
      hasStrongContext: true,
    })

    assert.match(prompt, /practical recruiting advisor/)
    assert.match(prompt, /Use only approved retrieved context/)
    assert.match(prompt, /Do not invent salary ranges/)
    assert.match(prompt, /Clarify hiring need first/)
  })

  it('uses fallback text when retrieval is weak', () => {
    const prompt = buildRecruitingSystemPrompt({
      retrievedContext: 'Weak context that should not be included',
      hasStrongContext: false,
    })

    assert.match(prompt, /I don't have enough approved recruiting guidance/)
    assert.doesNotMatch(prompt, /Weak context that should not be included/)
  })
})
