'use client'

import { useState, useEffect, useCallback } from 'react'
import ChannelPostBlock from './ChannelPostBlock'
import type { GeneratedPosts, ConnectedAccount, PostCampaign } from '@/lib/supabase'

type Channel = 'linkedin' | 'facebook' | 'threads' | 'topcv'
const CHANNELS: Channel[] = ['linkedin', 'facebook', 'threads', 'topcv']

type Props = {
  jdHistoryId: string
}

type CampaignMap = Partial<Record<Channel, PostCampaign>>
type AccountMap = Partial<Record<Channel, ConnectedAccount>>

export default function PostingCard({ jdHistoryId }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<GeneratedPosts | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignMap>({})
  const [accounts, setAccounts] = useState<AccountMap>({})

  const fetchAccounts = useCallback(async () => {
    const results = await Promise.allSettled(
      (['linkedin', 'facebook'] as Channel[]).map(async (p) => {
        const res = await fetch(`/api/auth/${p}/status`)
        const data = await res.json() as { connected: boolean; account: ConnectedAccount }
        return { platform: p, account: data.connected ? data.account : null }
      })
    )
    const map: AccountMap = {}
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        map[r.value.platform] = r.value.account ?? undefined
      }
    })
    setAccounts(map)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Check if campaigns already exist
      const campRes = await fetch(`/api/post-job/campaigns?jd_id=${jdHistoryId}`)
      const campData = await campRes.json() as { campaigns: PostCampaign[] }

      if (campData.campaigns?.length > 0) {
        const map: CampaignMap = {}
        campData.campaigns.forEach(c => { map[c.channel as Channel] = c })
        setCampaigns(map)
        // Re-generate to get recommendations (not stored in DB)
        const genRes = await fetch('/api/post-job/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jd_history_id: jdHistoryId }),
        })
        const genData = await genRes.json() as { generated: GeneratedPosts }
        if (genData.generated) setGenerated(genData.generated)
      } else {
        // First time — generate everything
        const genRes = await fetch('/api/post-job/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jd_history_id: jdHistoryId }),
        })
        const genData = await genRes.json() as { generated: GeneratedPosts; error?: string }
        if (genData.error) throw new Error(genData.error)
        setGenerated(genData.generated)

        const newCampRes = await fetch(`/api/post-job/campaigns?jd_id=${jdHistoryId}`)
        const newCampData = await newCampRes.json() as { campaigns: PostCampaign[] }
        const map: CampaignMap = {}
        newCampData.campaigns?.forEach(c => { map[c.channel as Channel] = c })
        setCampaigns(map)
      }
    } catch (err) {
      console.error('PostingCard fetch error:', err)
      setError('Không tải được nội dung, thử lại nhé!')
    } finally {
      setLoading(false)
    }
  }, [jdHistoryId])

  useEffect(() => {
    fetchData()
    fetchAccounts()
  }, [fetchData, fetchAccounts])

  function handleContentChange(campaignId: string, content: string) {
    setCampaigns(prev => {
      const updated = { ...prev }
      for (const ch of CHANNELS) {
        if (updated[ch]?.id === campaignId) {
          updated[ch] = { ...updated[ch]!, content }
        }
      }
      return updated
    })
    fetch('/api/post-job/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, content }),
    }).catch(console.error)
  }

  async function handlePublish(campaignId: string) {
    const res = await fetch('/api/post-job/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (!data.ok) throw new Error(data.error ?? 'Lỗi không rõ')

    setCampaigns(prev => {
      const updated = { ...prev }
      for (const ch of CHANNELS) {
        if (updated[ch]?.id === campaignId) {
          updated[ch] = { ...updated[ch]!, status: 'posted', posted_at: new Date().toISOString() }
        }
      }
      return updated
    })

    // Refresh account status after posting
    fetchAccounts()
  }

  return (
    <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">✦</span>
          </div>
          <h2 className="font-bold text-gray-800 text-base">Đăng tuyển ngay</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">Jane gợi ý kênh + generate content phù hợp cho từng nơi</p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-10">
            <svg className="animate-spin w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-500">Jane đang phân tích JD và viết content... (~15s)</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={fetchData} className="mt-2 text-xs text-red-500 underline">Thử lại</button>
          </div>
        )}

        {!loading && !error && generated && (
          <>
            {/* Channel recommendation chips */}
            <div className="bg-indigo-50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-indigo-700 mb-2">Jane gợi ý cho role này</p>
              <div className="flex flex-wrap gap-2">
                {[...generated.channel_recommendations]
                  .sort((a, b) => b.stars - a.stars)
                  .map(rec => (
                    <span
                      key={rec.channel}
                      className="text-xs px-2 py-1 rounded-full font-medium bg-white border border-indigo-200 text-indigo-600"
                    >
                      {rec.channel} {'★'.repeat(rec.stars)}{'☆'.repeat(3 - rec.stars)}
                    </span>
                  ))}
              </div>
            </div>

            {/* Channel blocks */}
            {CHANNELS.map(channel => {
              const rec = generated.channel_recommendations.find(r => r.channel === channel)
              return (
                <ChannelPostBlock
                  key={channel}
                  channel={channel}
                  campaign={campaigns[channel] ?? null}
                  stars={rec?.stars ?? 1}
                  reason={rec?.reason ?? ''}
                  account={accounts[channel] ?? null}
                  onPublish={handlePublish}
                  onContentChange={handleContentChange}
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
