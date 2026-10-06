// Cover Letter Generator — uses Gemini API with template fallback
import { getAIClient, type ChatMessage } from './ai'
import { type CandidateProfile, buildProfileContext } from './profile'
import { type MatchedJob } from './matcher'

export async function generateCoverLetter(
  job: MatchedJob,
  profile: CandidateProfile
): Promise<string> {
  const client = getAIClient()

  if (!client.isAvailable()) {
    return generateTemplateCoverLetter(job, profile)
  }

  let lastError: any
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
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

      const messages: ChatMessage[] = [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userMessage },
      ]

      return await client.create(messages)
    } catch (err: any) {
      lastError = err
      if (attempt < 3) {
        console.log(`    Retry ${attempt}/3...`)
        await new Promise((r) => setTimeout(r, attempt * 3000))
        continue
      }
      // Fall back to template
      return generateTemplateCoverLetter(job, profile)
    }
  }
  return generateTemplateCoverLetter(job, profile)
}

export function generateTemplateCoverLetter(
  job: MatchedJob,
  profile: CandidateProfile
): string {
  const topRepos = profile.topRepos.slice(0, 2)
  const repoMention = topRepos.length > 0
    ? `In my recent work, I built ${topRepos[0].name}${topRepos[1] ? ` and ${topRepos[1].name}` : ''} — projects that required deep problem-solving and attention to user experience. `
    : ''

  return `Dear ${job.company} Team,

I came across the ${job.title} role at ${job.company} and it immediately caught my attention. The combination of technologies and the remote-first approach aligns perfectly with how I work best — independently, with ownership, and across the full stack.

I'm a full-stack developer based in Lagos, Nigeria, with hands-on experience in React, Next.js, TypeScript, and Node.js. ${repoMention}I thrive in environments where I can contribute to both the frontend and backend, and I'm particularly drawn to roles that involve building real products used by real people.

What stands out about this opportunity is the chance to work with a distributed team. I've spent the last few years building applications end-to-end — from database schema design to pixel-perfect UIs — and I'm looking for a team where that range is valued. I'm comfortable working across time zones and communicating asynchronously.

I'd welcome the chance to discuss how my experience could contribute to ${job.company}. Thank you for taking the time to review my application.

Best regards,
${profile.name}`
}
