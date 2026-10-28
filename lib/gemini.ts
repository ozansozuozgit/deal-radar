// Minimal Gemini JSON call (free tier). Returns null when there's no key or no usable answer.

export function hasGemini(): boolean { return !!process.env.GEMINI_API_KEY }

/** Strip the ```json fences Gemini likes to add, then parse. */
export function parseModelJson<T>(text: string): T | null {
  const jsonText = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
  try { return JSON.parse(jsonText) as T } catch { return null }
}

export async function geminiJson<T>(prompt: string, { temperature = 0.2, timeoutMs = 60_000 } = {}): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  )
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
  const data = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  return parseModelJson<T>(text)
}
