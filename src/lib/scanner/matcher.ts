// AI Matcher — uses Gemini API to score jobs, with keyword-based fallback
import { getAIClient, type ChatMessage } from './ai'
import { type CandidateProfile, buildProfileContext } from './profile'
import { type JobPosting } from './jobs/scrapers'

export interface MatchedJob extends JobPosting {
  matchScore: number
  matchReason: string
  experienceFit: string
  coverLetter?: string
  matchMethod: string // 'ai' | 'keyword'
}

export async function matchJobs(
  jobs: JobPosting[],
  profile: CandidateProfile
): Promise<MatchedJob[]> {
  console.log(`Matching ${jobs.length} jobs...`)

  const client = getAIClient()

  if (client.isAvailable()) {
    console.log('  AI matching enabled (Gemini API)')
    return matchWithAI(jobs, profile)
  } else {
    console.log('  AI not available — using keyword matching fallback')
    return matchWithKeywords(jobs, profile)
  }
}

async function matchWithAI(
  jobs: JobPosting[],
  profile: CandidateProfile
): Promise<MatchedJob[]> {
  const client = getAIClient()
  const profileContext = buildProfileContext(profile)
  const matched: MatchedJob[] = []

  const batchSize = 5
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize)
    console.log(`  AI batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(jobs.length / batchSize)}...`)

    const batchResults = await Promise.all(
      batch.map((job) => matchSingleJobAI(client, job, profileContext))
    )

    for (const result of batchResults) {
      if (result && result.matchScore >= 50) {
        matched.push(result)
      }
    }
  }

  matched.sort((a, b) => b.matchScore - a.matchScore)
  console.log(`✓ ${matched.length} jobs matched via AI (score >= 50)`)
  return matched.slice(0, 30)
}

function matchWithKeywords(
  jobs: JobPosting[],
  profile: CandidateProfile
): Promise<MatchedJob[]> {
  console.log('  Scoring jobs by keyword overlap...')

  const devKeywords = [
    'developer', 'engineer', 'programmer', 'software', 'frontend', 'backend',
    'full-stack', 'fullstack', 'full stack', 'web developer', 'react', 'node',
    'javascript', 'typescript', 'python', 'django', 'next.js', 'nextjs',
    'ai engineer', 'machine learning', 'llm', 'ml engineer', 'data scientist',
    'software engineer', 'application developer',
  ]

  const seniorityKeywords = {
    junior: ['junior', 'entry', 'graduate', 'intern', 'associate', 'beginner'],
    mid: ['mid', 'intermediate', '2+ years', '3+ years', 'experienced'],
    senior: ['senior', 'lead', 'principal', 'staff', '5+ years', 'architect'],
  }

  const remoteKeywords = ['remote', 'work from home', 'distributed', 'anywhere', 'wfh']

  const matched: MatchedJob[] = jobs.map((job) => {
    const text = `${job.title} ${job.description}`.toLowerCase()

    const isDevRole = devKeywords.some((kw) => text.includes(kw))
    const isRemote = remoteKeywords.some((kw) => text.includes(kw)) ||
      job.location.toLowerCase().includes('remote')

    const skillMatches = profile.skills.filter((skill) => {
      const skillLower = skill.toLowerCase()
      return text.includes(skillLower) ||
        text.includes(skillLower.replace('.', '')) ||
        text.includes(skillLower.replace(' ', ''))
    })

    let score = 0
    if (isDevRole) score += 30
    if (isRemote) score += 20
    score += Math.min(skillMatches.length * 10, 40)

    let experienceFit = 'junior-mid'
    if (seniorityKeywords.junior.some((kw) => text.includes(kw))) {
      experienceFit = 'junior'
    } else if (seniorityKeywords.senior.some((kw) => text.includes(kw))) {
      experienceFit = 'senior'
    } else if (seniorityKeywords.mid.some((kw) => text.includes(kw))) {
      experienceFit = 'mid'
    }

    if (experienceFit === 'senior' && !seniorityKeywords.junior.some((kw) => text.includes(kw))) {
      score -= 20
    }

    const matchReason = skillMatches.length > 0
      ? `Matches ${skillMatches.length} skills: ${skillMatches.slice(0, 4).join(', ')}`
      : isDevRole ? 'Relevant developer role' : 'Limited match'

    return {
      ...job,
      matchScore: Math.min(score, 100),
      matchReason,
      experienceFit,
      matchMethod: 'keyword',
    }
  })

  const filtered = matched.filter((j) => j.matchScore >= 40 && j.matchScore > 0)
  filtered.sort((a, b) => b.matchScore - a.matchScore)
  console.log(`✓ ${filtered.length} jobs matched via keywords (score >= 40)`)
  return Promise.resolve(filtered.slice(0, 30))
}

async function matchSingleJobAI(
  client: ReturnType<typeof getAIClient>,
  job: JobPosting,
  profileContext: string
): Promise<MatchedJob | null> {
  try {
    const systemPrompt = `You are a technical recruiter AI. Evaluate how well a job posting matches a candidate's profile.

Return ONLY valid JSON (no markdown, no extra text):
{
  "matchScore": <0-100 integer>,
  "matchReason": "<1 sentence why it matches or doesn't>",
  "experienceFit": "<"junior" | "mid" | "senior" | "junior-mid">,
  "isRemote": <true/false>,
  "isRelevant": <true/false>
}

Scoring guide:
- 90-100: Perfect match (skills + experience + category all align)
- 70-89: Strong match (most skills align, relevant category)
- 50-69: Partial match (some skills overlap)
- 0-49: Poor match (minimal overlap)

Only return isRelevant: true if the job is for a software developer/engineer role. Reject non-dev jobs.
Only return isRemote: true if the job allows remote work.`

    const userMessage = `${profileContext}

JOB TO EVALUATE:
Title: ${job.title}
Company: ${job.company}
Source: ${job.source}
Description: ${job.description.slice(0, 800)}
Tags: ${job.tags.join(', ')}

Evaluate this job. Return JSON.`

    const messages: ChatMessage[] = [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]

    const response = await client.create(messages)

    let raw = response.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    const result = JSON.parse(raw)

    if (!result.isRelevant || !result.isRemote) return null

    return {
      ...job,
      matchScore: result.matchScore,
      matchReason: result.matchReason,
      experienceFit: result.experienceFit,
      matchMethod: 'ai',
    }
  } catch (err) {
    console.error(`  AI match error for ${job.title}:`, err)
    return null
  }
}
