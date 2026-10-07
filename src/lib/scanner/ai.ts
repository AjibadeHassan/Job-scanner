// Unified AI client — uses Google Gemini API (works anywhere with GEMINI_API_KEY)
// Retries on 503/429 with exponential backoff
// Falls back to alternative models if the primary one is unavailable

const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
]

const MAX_RETRIES = 3
const BASE_DELAY = 2000 // 2 seconds

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

    let lastError: any

    // Try each model in order, with retries on 503/429
    for (const model of GEMINI_MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(`${endpoint}?key=${this.geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

          if (res.ok) {
            const data = await res.json()
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) return text
            throw new Error('Empty response')
          }

          const errText = await res.text()

          // 503 = overloaded, 429 = rate limited → retry with backoff
          if (res.status === 503 || res.status === 429) {
            lastError = new Error(`Gemini ${res.status}: ${errText.slice(0, 100)}`)
            if (attempt < MAX_RETRIES) {
              const delay = BASE_DELAY * attempt * attempt // 2s, 8s, 18s
              await new Promise((r) => setTimeout(r, delay))
              continue
            }
            break // try next model
          }

          // 400 = bad request (model not found, etc.) → try next model
          if (res.status === 400 || res.status === 404) {
            lastError = new Error(`Gemini ${res.status}: ${errText.slice(0, 100)}`)
            break // try next model
          }

          // Other errors → throw immediately
          throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`)
        } catch (err: any) {
          // Network errors → retry
          lastError = err
          if (attempt < MAX_RETRIES && !err.message?.includes('400') && !err.message?.includes('404')) {
            const delay = BASE_DELAY * attempt
            await new Promise((r) => setTimeout(r, delay))
            continue
          }
        }
      }
    }

    throw lastError || new Error('All Gemini models failed')
  }
}

let _client: AIClient | null = null

export function getAIClient(): AIClient {
  if (!_client) {
    _client = new AIClient()
  }
  return _client
}
