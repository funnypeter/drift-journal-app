import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Verify authenticated user
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageBase64, mimeType, netHoleSize } = await req.json()
  if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const prompt = netHoleSize
    ? `If the holes at the bottom of the net are ${netHoleSize} inches in diameter, estimate the size of the fish. Also identify the species. Output ONLY valid JSON: {"species":"Brown Trout","length":"XX.X","confidence":75} where XX.X is your actual measurement. Species: Rainbow Trout, Brown Trout, Cutthroat Trout, Brook Trout, Bull Trout, Steelhead, Mountain Whitefish, Arctic Grayling.`
    : `Estimate the size of this fish in inches. Also identify the species. Output ONLY valid JSON: {"species":"Brown Trout","length":"XX.X","confidence":75} where XX.X is your actual estimate. Species: Rainbow Trout, Brown Trout, Cutthroat Trout, Brook Trout, Bull Trout, Steelhead, Mountain Whitefish, Arctic Grayling.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: prompt }
          ]}],
          generationConfig: { maxOutputTokens: 1024, temperature: 0 }
        }),
        signal: AbortSignal.timeout(30000),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `Gemini error: ${response.status}` }, { status: 502 })
    }

    const data = await response.json()
    const parts = data.candidates?.[0]?.content?.parts || []
    let text = ''
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].text && !parts[i].thought) { text = parts[i].text; break }
    }

    let clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim()
    if (clean.toLowerCase().startsWith('json')) clean = clean.slice(4).trim()
    const js = clean.indexOf('{')
    const je = clean.lastIndexOf('}')
    if (js < 0 || je <= js) return NextResponse.json({ error: 'No valid JSON from AI' }, { status: 422 })

    const result = JSON.parse(clean.substring(js, je + 1))
    return NextResponse.json(result)

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI request failed' }, { status: 500 })
  }
}
