import { createRouteClient } from '@/lib/supabase/route'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Narrated trip notes → clean text. Takes a recorded audio blob, sends it to
// Gemini 2.5 Flash, and returns a tidied written version (fillers/false-starts
// removed, grammar fixed) that the user can still edit by hand.
export async function POST(req: NextRequest) {
  const supabase = createRouteClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const form = await req.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  }
  // Inline request cap is 20MB; leave headroom for the prompt.
  if (audio.size > 18 * 1024 * 1024) {
    return NextResponse.json({ error: 'Recording too long — keep it under a few minutes.' }, { status: 413 })
  }

  const mimeType = audio.type || 'audio/webm'
  const base64 = Buffer.from(await audio.arrayBuffer()).toString('base64')

  const prompt =
    'The audio is a person narrating notes for a fly-fishing trip journal. ' +
    'Transcribe what they say and lightly clean it up: remove filler words (um, uh, ah, like), ' +
    'false starts, stutters and long pauses; fix grammar, capitalization and punctuation. ' +
    'Preserve their meaning, details and natural voice — do NOT add facts or embellish. ' +
    'Fly-fishing terms (fly patterns, species, river names) may appear; keep them. ' +
    'If the audio is empty or unintelligible, return an empty string. ' +
    'Output ONLY the cleaned note text — no preamble, quotes, or labels.'

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ]}],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(55000),
      }
    )

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error('Gemini transcribe error:', response.status, errText)
      return NextResponse.json(
        { error: `Transcription failed (${response.status})`, detail: errText.slice(0, 200) },
        { status: 502 }
      )
    }

    const data = await response.json()
    const parts = data.candidates?.[0]?.content?.parts || []
    let text = ''
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].text && !parts[i].thought) { text = parts[i].text; break }
    }
    return NextResponse.json({ text: text.trim() })
  } catch (err: any) {
    const msg = err?.name === 'TimeoutError' ? 'Transcription timed out' : (err?.message || 'Transcription failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
