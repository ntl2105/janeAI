import { NextRequest, NextResponse } from 'next/server'

function extractText(html: string): string {
  // Remove script, style, nav, footer, header blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')

  // Convert block-level tags to newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|h[1-6]|section|article|tr)[^>]*>/gi, '\n')

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')

  // Collapse excessive whitespace / blank lines
  text = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
    .join('\n')
    .trim()

  return text
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'URL không hợp lệ' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Chỉ hỗ trợ http/https' }, { status: 400 })
  }

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Không tải được trang (HTTP ${response.status})` },
        { status: 502 }
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ error: 'URL không phải trang HTML' }, { status: 422 })
    }

    const html = await response.text()
    const text = extractText(html)

    if (text.length < 100) {
      return NextResponse.json(
        { error: 'Không đọc được nội dung JD từ link này (trang có thể chặn bot)' },
        { status: 422 }
      )
    }

    return NextResponse.json({ text: text.slice(0, 20000) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('timeout') || message.includes('TimeoutError')) {
      return NextResponse.json({ error: 'Trang tải quá lâu, thử lại nhé' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Không kết nối được tới trang đó' }, { status: 502 })
  }
}
