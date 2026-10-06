// Unified AI client — uses Google Gemini API (works anywhere with GEMINI_API_KEY)
// Falls back to z-ai-web-dev-sdk if in Z.ai sandbox
// Throws if neither available (caller should use keyword fallback)

const GEMINI_MODEL = 'gemini-flash-latest'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

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
    if (this.geminiKey) {
      return this.callGemini(messages)
    }
    throw new Error('No AI provider available (set GEMINI_API_KEY)')
  }

  private async callGemini(messages: ChatMessage[]): Promise<string> {
    // The first assistant message is the system prompt in our format
    // Gemini uses system_instruction separately
    let systemPrompt = ''
    const conversation: { role: string; parts: { text: string }[] }[] = []

    for (const msg of messages) {
      if (msg.role === 'assistant' && !systemPrompt) {
        // First assistant message = system prompt
        systemPrompt = msg.content
      } else {
        // Gemini uses "model" for assistant, "user" for user
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

    const res = await fetch(`${GEMINI_ENDPOINT}?key=${this.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Gemini API error (${res.status}): ${err.slice(0, 200)}`)
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new Error('Gemini returned empty response')
    }

    return text
  }
}

// Singleton instance
let _client: AIClient | null = null

export function getAIClient(): AIClient {
  if (!_client) {
    _client = new AIClient()
  }
  return _client
}
