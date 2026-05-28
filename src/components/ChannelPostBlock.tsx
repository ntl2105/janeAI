'use client'

import { useState } from 'react'

type Channel = 'linkedin' | 'facebook' | 'threads' | 'topcv'

const CHANNEL_META: Record<Channel, {
  icon: string
  label: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  linkedin:  { icon: '💼', label: 'LinkedIn',         color: '#6366f1', bgColor: '#eef2ff', borderColor: '#a5b4fc' },
  facebook:  { icon: '📘', label: 'Facebook Page',    color: '#1877f2', bgColor: '#eff6ff', borderColor: '#93c5fd' },
  threads:   { icon: '🧵', label: 'Threads',          color: '#111111', bgColor: '#f9fafb', borderColor: '#d1d5db' },
  topcv:     { icon: '📄', label: 'TopCV / Job Board', color: '#6b7280', bgColor: '#f9fafb', borderColor: '#e5e7eb' },
}

type ConnectedAccount = {
  platform_user_name: string | null
  facebook_pages: Array<{ id: string; name: string }> | null
  selected_page_id: string | null
} | null

type Campaign = {
  id: string
  content: string
  status: 'draft' | 'posted' | 'failed'
  posted_at: string | null
}

type Props = {
  channel: Channel
  campaign: Campaign | null
  stars: number
  reason: string
  account: ConnectedAccount
  onPublish: (campaignId: string) => Promise<void>
  onContentChange: (campaignId: string, content: string) => void
}

export default function ChannelPostBlock({
  channel,
  campaign,
  stars,
  reason,
  account,
  onPublish,
  onContentChange,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const meta = CHANNEL_META[channel]
  const isContentOnly = channel === 'threads' || channel === 'topcv'
  const canDirectPost = !isContentOnly && account !== null
  const posted = campaign?.status === 'posted'
  const failed = campaign?.status === 'failed'
  const starsStr = '★'.repeat(stars) + '☆'.repeat(3 - stars)

  async function handlePublish() {
    if (!campaign) return
    setPublishError(null)
    setPublishing(true)
    try {
      await onPublish(campaign.id)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Lỗi không rõ')
    } finally {
      setPublishing(false)
    }
  }

  function handleCopy() {
    if (!campaign) return
    navigator.clipboard.writeText(campaign.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: posted ? '#86efac' : meta.borderColor }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: meta.bgColor }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">{meta.icon}</span>
          <strong className="text-sm" style={{ color: meta.color }}>{meta.label}</strong>

          {posted && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">✓ Đã đăng</span>
          )}
          {failed && (
            <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">Lỗi</span>
          )}
          {!posted && !failed && isContentOnly && (
            <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">Content only</span>
          )}
          {!posted && !failed && !isContentOnly && account && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              ✓ {account.platform_user_name ?? 'Đã kết nối'}
            </span>
          )}
          {!posted && !failed && !isContentOnly && !account && (
            <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">Chưa kết nối</span>
          )}
        </div>
        <span className="text-xs font-medium shrink-0" style={{ color: meta.color }}>{starsStr}</span>
      </div>

      {/* Reason */}
      <div className="px-4 pt-2">
        <p className="text-xs text-gray-400">{reason}</p>
      </div>

      {/* Content + Actions */}
      {campaign && (
        <div className="px-4 pb-4 pt-2 space-y-2">
          {!expanded ? (
            <>
              <p className="text-xs text-gray-600 line-clamp-3 bg-gray-50 rounded-lg p-3 leading-relaxed whitespace-pre-line">
                {campaign.content}
              </p>
              <button
                onClick={() => setExpanded(true)}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                Xem đầy đủ &amp; chỉnh sửa ↓
              </button>
            </>
          ) : (
            <>
              <textarea
                value={campaign.content}
                onChange={(e) => onContentChange(campaign.id, e.target.value)}
                rows={8}
                className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Thu gọn ↑
              </button>
            </>
          )}

          {publishError && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{publishError}</p>
          )}

          {posted ? (
            <p className="text-xs text-green-600 text-center py-1">
              ✓ Đã đăng lúc {campaign.posted_at
                ? new Date(campaign.posted_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                : ''}
            </p>
          ) : isContentOnly ? (
            <button
              onClick={handleCopy}
              className="w-full py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {copied ? '✓ Đã copy!' : 'Copy nội dung →'}
            </button>
          ) : canDirectPost ? (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: meta.color }}
            >
              {publishing ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang đăng...
                </>
              ) : `Post lên ${meta.label} →`}
            </button>
          ) : (
            <a
              href={`/api/auth/${channel}/connect`}
              className="block w-full py-2.5 text-sm font-semibold text-center rounded-lg border-2 transition-colors hover:bg-gray-50"
              style={{ color: meta.color, borderColor: meta.color }}
            >
              Kết nối {meta.label} →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
