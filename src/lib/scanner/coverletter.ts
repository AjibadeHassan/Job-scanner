// Cover Letter Generator — heavily humanized with Groq/Gemini + template fallback
// Each letter is unique: varied openings, specific project references, no cliches

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

  try {
    const profileContext = buildProfileContext(profile)

    // Pick a random opening style to avoid repetition across cover letters
    const openings = [
      'Start with a specific observation about the company or the role that shows genuine research.',
      'Open with a brief, specific anecdote about a relevant project you built.',
      'Begin with what specifically drew you to this role — reference a detail from the job description.',
      'Start with a question or a bold statement about the kind of work you want to do.',
    ]
    const openingStyle = openings[Math.floor(Math.random() * openings.length)]

    const systemPrompt = `You are an expert cover letter writer who creates heavily humanized, authentic letters. Write a cover letter for ${job.title} at ${job.company}.

CRITICAL HUMANIZATION RULES:
1. ${openingStyle}
2. NEVER start with "I am writing to apply for" — this is an instant rejection signal
3. Reference 1 specific detail from the job description (a required skill, a responsibility, the company mission)
4. Mention exactly 1 relevant project from the candidate's portfolio — choose the MOST relevant one based on the job requirements
5. Write like you're talking to a real person, not filling in a template
6. Vary sentence length dramatically — some 5-word sentences, some 20-word sentences
7. Show, don't tell: instead of "I'm passionate about clean code", describe a specific time you refactored something
8. Include one genuine personal detail that connects you to the work (not generic)
9. BANNED CLICHES (never use these): "passionate about", "team player", "think outside the box", "results-driven", "detail-oriented", "fast-paced environment", "wear many hats", "hit the ground running"
10. Keep it to 250-350 words, 3 paragraphs max
11. Use the actual company name, NOT [Company Name]
12. Sign off as: ${profile.name}
13. Do NOT include address, date, or "Dear Hiring Manager" — use "Dear ${job.company} Team"

The letter should feel like a real developer wrote it in 20 minutes because they genuinely wanted THIS job at THIS company — not a form letter they sent to 50 places.`

    const userMessage = `${profileContext}

JOB DETAILS:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description.slice(0, 500)}
Match Score: ${job.matchScore}/100
Match Reason: ${job.matchReason}
Experience Fit: ${job.experienceFit}

Write a heavily humanized cover letter. Make it specific to this role at ${job.company}.`

    const messages: ChatMessage[] = [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]

    return await client.create(messages)
  } catch {
    return generateTemplateCoverLetter(job, profile)
  }
}

export function generateTemplateCoverLetter(job: MatchedJob, profile: CandidateProfile): string {
  const topRepos = profile.topRepos.slice(0, 2)
  const repoMention = topRepos.length > 0
    ? `In my recent work, I built ${topRepos[0].name}${topRepos[1] ? ` and ${topRepos[1].name}` : ''} — projects that required deep problem-solving and attention to user experience. `
    : ''

  return `Dear ${job.company} Team,

I came across the ${job.title} role at ${job.company} and it immediately caught my attention. The combination of technologies and the remote-first approach aligns perfectly with how I work best — independently, with ownership, and across the full stack.

I'm a full-stack developer based in Lagos, Nigeria, with hands-on experience in React, Next.js, TypeScript, and Node.js. ${repoMention}I thrive in environments where I can contribute to both the frontend and backend, and I'm particularly drawn to roles that involve building real products used by real people.

I'd welcome the chance to discuss how my experience could contribute to ${job.company}. Thank you for taking the time to review my application.

Best regards,
${profile.name}`
}
