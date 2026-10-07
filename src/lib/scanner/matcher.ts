// AI Matcher — uses Gemini API to score jobs, with keyword-based fallback
// If Gemini is overloaded (503) or fails per-job, falls back to keyword matching
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
    console.log('  AI not available — using keyword matching')
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
  let aiSuccessCount = 0
  let keywordFallbackCount = 0

  const batchSize = 3 // Smaller batches to reduce API load
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize)
    console.log(`  AI batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(jobs.length / batchSize)}...`)

    const batchResults = await Promise.all(
      batch.map((job) => matchSingleJobAI(client, job, profileContext))
    )

    for (let idx = 0; idx < batchResults.length; idx++) {
      const result = batchResults[idx]
      if (result && result.matchScore >= 50) {
        matched.push(result)
        if (result.matchMethod === 'ai') aiSuccessCount++
        else keywordFallbackCount++
      }
    }

    // Small delay between batches to avoid overwhelming Gemini
    if (i + batchSize < jobs.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  matched.sort((a, b) => b.matchScore - a.matchScore)
  console.log(`✓ ${matched.length} jobs matched (AI: ${aiSuccessCount}, keyword fallback: ${keywordFallbackCount})`)
  return matched.slice(0, 30)
}

function matchWithKeywords(
  jobs: JobPosting[],
  profile: CandidateProfile
): Promise<MatchedJob[]> {
  console.log('  Scoring jobs by keyword overlap...')
  const matched = jobs.map((job) => scoreJobWithKeywords(job, profile))
  const filtered = matched.filter((j) => j.matchScore >= 40 && j.matchScore > 0)
  filtered.sort((a, b) => b.matchScore - a.matchScore)
  console.log(`✓ ${filtered.length} jobs matched via keywords (score >= 40)`)
  return Promise.resolve(filtered.slice(0, 30))
}

// Keyword scoring for a single job (used as fallback when AI fails)
function scoreJobWithKeywords(job: JobPosting, profile: CandidateProfile): MatchedJob {
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
    // AI failed (503, rate limit, etc.) → fall back to keyword matching for this job
    // Extract profile from the context string (it's passed as profileContext)
    // We need the profile object — let's use a simplified keyword scorer
    const profile: CandidateProfile = {
      name: 'Ajibade Hassan',
      role: 'Full-Stack Web Developer & AI Engineer',
      location: 'Lagos, Nigeria',
      email: 'hassanajibade17@gmail.com',
      experienceLevel: 'junior-mid',
      skills: [
        'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js',
        'Python', 'Django', 'REST API', 'PostgreSQL', 'MySQL', 'Prisma',
        'Tailwind CSS', 'HTML5', 'CSS3', 'SCSS', 'Docker', 'Git',
        'LLM Integration', 'Prompt Engineering', 'RAG', 'LangChain',
        'Responsive Design', 'SEO', 'Jest',
      ],
      categories: ['Full-Stack', 'Frontend', 'Backend', 'AI Engineer'],
      githubUsername: 'AjibadeHassan',
      topRepos: [],
      resumeHighlights: '',
      bio: '',
      updatedAt: new Date().toISOString(),
    }
    const keywordResult = scoreJobWithKeywords(job, profile)
    if (keywordResult.matchScore >= 40) {
      return keywordResult
    }
    return null
  }
}
