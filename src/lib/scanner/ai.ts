// Unified AI client — uses Google Gemini API (works anywhere with GEMINI_API_KEY)
// Tries multiple models, minimal retries (no long delays — caller handles fallback)

const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
]

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export class AIClient {
  private geminiKey: string | undefined

  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY
  }

  isAvailable(): boolean {
    return !!this.geminiKey
  }

  async create(messages: ChatMessage[]): Promise<string> {
    if (!this.geminiKey) {
      throw new Error('No AI provider available (set GEMINI_API_KEY)')
    }
    return this.callGemini(messages)
  }

  private async callGemini(messages: ChatMessage[]): Promise<string> {
    let systemPrompt = ''
    const conversation: { role: string; parts: { text: string }[] }[] = []

    for (const msg of messages) {
      if (msg.role === 'assistant' && !systemPrompt) {
        systemPrompt = msg.content
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user'
        conversation.push({ role, parts: [{ text: msg.content }] })
      }
    }

    const body: any = {
      contents: conversation,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }

    if (systemPrompt) {
      body.system_instruction = { parts: [{ text: systemPrompt }] }
    }

    // Try each model once (no retries, no delays — caller handles fallback)
    for (const model of GEMINI_MODELS) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        const res = await fetch(`${endpoint}?key=${this.geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (res.ok) {
          const data = await res.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) return text
        }

        // 503/429 → try next model immediately (no delay)
        // 400/404 → model not available, try next
        // Other errors → throw
        if (res.status === 503 || res.status === 429 || res.status === 400 || res.status === 404) {
          continue
        }

        const errText = await res.text()
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`)
      } catch (err: any) {
        // Network error → try next model
        if (err.message?.includes('fetch')) continue
        throw err
      }
    }

    throw new Error('All Gemini models unavailable (503/429)')
  }
}

let _client: AIClient | null = null

export function getAIClient(): AIClient {
  if (!_client) {
    _client = new AIClient()
  }
  return _client
}
