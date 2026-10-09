// Unified AI client — supports Groq (primary, fast/reliable) and Gemini (fallback)
// Both are free. Set GROQ_API_KEY or GEMINI_API_KEY to enable AI.
// If neither available, callers should use keyword/template fallbacks.

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export class AIClient {
  private groqKey: string | undefined
  private geminiKey: string | undefined

  constructor() {
    this.groqKey = process.env.GROQ_API_KEY
    this.geminiKey = process.env.GEMINI_API_KEY
  }

  isAvailable(): boolean {
    return !!(this.groqKey || this.geminiKey)
  }

  get provider(): string {
    if (this.groqKey) return 'groq'
    if (this.geminiKey) return 'gemini'
    return 'none'
  }

  async create(messages: ChatMessage[]): Promise<string> {
    // Try Groq first (fast, reliable, free 30 req/min)
    if (this.groqKey) {
      try {
        return await this.callGroq(messages)
      } catch (err: any) {
        // If Groq fails with 429/503, try Gemini
        if (this.geminiKey && (err.message?.includes('429') || err.message?.includes('503'))) {
          return await this.callGemini(messages)
        }
        throw err
      }
    }
    // Groq not configured — try Gemini
    if (this.geminiKey) {
      return await this.callGemini(messages)
    }
    throw new Error('No AI provider available (set GROQ_API_KEY or GEMINI_API_KEY)')
  }

  private async callGroq(messages: ChatMessage[]): Promise<string> {
    // Try multiple models — some accounts don't have access to all models
    const models = [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama3-70b-8192',
      'gemma2-9b-it',
      'mixtral-8x7b-32768',
    ]
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions'

    // Convert to OpenAI-compatible format
    const openaiMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'system' : 'user',
      content: m.content,
    }))

    let lastError: any
    for (const model of models) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.groqKey}`,
          },
          body: JSON.stringify({
            model,
            messages: openaiMessages,
            temperature: 0.7,
            max_tokens: 2048,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const text = data.choices?.[0]?.message?.content
          if (text) return text
        }

        const errText = await res.text()
        // 404 = model not found → try next model
        // 403 = forbidden → try next model
        if (res.status === 404 || res.status === 403) {
          lastError = new Error(`Groq ${res.status}: ${errText.slice(0, 100)}`)
          continue
        }
        // Other errors (429, 500, etc.) → throw immediately
        throw new Error(`Groq API error (${res.status}): ${errText.slice(0, 200)}`)
      } catch (err: any) {
        if (err.message?.includes('404') || err.message?.includes('403')) {
          lastError = err
          continue
        }
        throw err
      }
    }
    throw lastError || new Error('All Groq models failed')
  }

  private async callGemini(messages: ChatMessage[]): Promise<string> {
    const models = ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash']

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
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }
    if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] }

    for (const model of models) {
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
        if (res.status !== 503 && res.status !== 429 && res.status !== 400 && res.status !== 404) {
          const err = await res.text()
          throw new Error(`Gemini API error (${res.status}): ${err.slice(0, 200)}`)
        }
      } catch (err: any) {
        if (err.message?.includes('fetch')) continue
        if (err.message?.includes('503') || err.message?.includes('429')) continue
        throw err
      }
    }
    throw new Error('All Gemini models unavailable')
  }
}

let _client: AIClient | null = null
export function getAIClient(): AIClient {
  if (!_client) _client = new AIClient()
  return _client
}
