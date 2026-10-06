// Cover Letter Generator — creates professional, heavily humanized cover letters
import ZAI from 'z-ai-web-dev-sdk'
import { type CandidateProfile, buildProfileContext } from './profile'
import { type MatchedJob } from './matcher'

export async function generateCoverLetter(
  job: MatchedJob,
  profile: CandidateProfile
): Promise<string> {
  // Retry with exponential backoff (handles 429 rate limits)
  let lastError: any
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const zai = await ZAI.create()
      const profileContext = buildProfileContext(profile)

      const systemPrompt = `You are an expert cover letter writer. Write a professional, heavily humanized cover letter for a job application.

CRITICAL RULES FOR HUMANIZATION:
1. Write in a natural, conversational tone — NOT robotic or templated
2. Open with a genuine, specific hook (NOT "I am writing to apply for...")
3. Reference specific details from the job description to show you read it
4. Mention 1-2 specific projects from the candidate's portfolio that are relevant
5. Use varied sentence structure — mix short and long sentences
6. Include a personal touch that feels authentic (why this role matters to the candidate)
7. Avoid clichés: "passionate about", "team player", "think outside the box", "results-driven"
8. Keep it concise: 250-350 words (3 short paragraphs)
9. Do NOT use placeholders like [Company Name] — use the actual company name
10. End with a confident but humble call to action
11. Sign off as: ${profile.name}
12. Do NOT include the candidate's address or date at the top
13. Do NOT include "Dear Hiring Manager" — instead use "Dear [Company] Team" or "Dear [Company] Hiring Team"

The letter should feel like a real person wrote it in 15 minutes — warm, specific, and genuinely interested in THIS particular role at THIS particular company.`

      const userMessage = `${profileContext}

JOB DETAILS:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description.slice(0, 600)}
Match Reason: ${job.matchReason}
Experience Fit: ${job.experienceFit}

Write a professional, heavily humanized cover letter for this job. Make it feel authentic and specific to this role.`

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        thinking: { type: 'disabled' },
      })

      return completion.choices?.[0]?.message?.content || ''
    } catch (err: any) {
      lastError = err
      if (err.message?.includes('429') && attempt < 3) {
        console.log(`    Rate limited, retrying in ${attempt * 5}s...`)
        await new Promise((r) => setTimeout(r, attempt * 5000))
        continue
      }
      throw err
    }
  }
  throw lastError
}
