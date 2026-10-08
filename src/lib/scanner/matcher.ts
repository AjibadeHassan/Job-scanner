// AI Matcher — structured rubric scoring with Groq/Gemini + keyword fallback
// Scores on 4 dimensions: skill overlap, experience fit, domain relevance, remote feasibility

import { getAIClient, type ChatMessage } from './ai'
import { type CandidateProfile, buildProfileContext } from './profile'
import { type JobPosting } from './jobs/scrapers'

export interface MatchedJob extends JobPosting {
  matchScore: number
  matchReason: string
  experienceFit: string
  redFlags?: string[]
  coverLetter?: string
  matchMethod: string
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

  // Sort by postedAt descending (newest first) before matching
  jobs.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())

  const client = getAIClient()

  if (!client.isAvailable()) {
    console.log('  AI not available — using keyword matching')
    return matchWithKeywords(jobs, profile)
  }

  console.log(`  AI matching enabled (${client.provider})`)

  // Test AI on first 3 jobs
  const profileContext = buildProfileContext(profile)
  const testBatch = jobs.slice(0, 3)
  const testResults = await Promise.all(
    testBatch.map((job) => matchSingleJobAI(client, job, profileContext))
  )

  const aiWorking = testResults.some((r) => r !== null && r.matchMethod === 'ai')

  if (!aiWorking) {
    console.log('  ⚠️  AI unavailable — switching to keyword matching for all jobs')
    return matchWithKeywords(jobs, profile)
  }

  console.log('  ✅ AI is working — structured rubric matching')
  return matchWithAI(jobs, profile, profileContext, testResults)
}

async function matchWithAI(
  jobs: JobPosting[],
  profile: CandidateProfile,
  profileContext: string,
  initialResults: (MatchedJob | null)[]
): Promise<MatchedJob[]> {
  const client = getAIClient()
  const matched: MatchedJob[] = []
  let aiCount = 0, kwCount = 0

  // Add test batch results
  for (const result of initialResults) {
    if (result && result.matchScore >= 40) {
      matched.push(result)
      if (result.matchMethod === 'ai') aiCount++
      else kwCount++
    }
  }

  // Process remaining in batches of 5
  const batchSize = 5
  for (let i = 3; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map((job) => matchSingleJobAI(client, job, profileContext))
    )
    for (const result of batchResults) {
      if (result && result.matchScore >= 40) {
        matched.push(result)
        if (result.matchMethod === 'ai') aiCount++
        else kwCount++
      }
    }
  }

  matched.sort((a, b) => b.matchScore - a.matchScore)
  console.log(`✓ ${matched.length} jobs matched (AI: ${aiCount}, keyword fallback: ${kwCount})`)
  return matched.slice(0, 30)
}

function matchWithKeywords(jobs: JobPosting[], profile: CandidateProfile): Promise<MatchedJob[]> {
  const matched = jobs.map((job) => scoreJobWithKeywords(job, profile))
  const filtered = matched.filter((j) => j.matchScore >= 40 && j.matchScore > 0)
  filtered.sort((a, b) => b.matchScore - a.matchScore)
  console.log(`✓ ${filtered.length} jobs matched via keywords`)
  return Promise.resolve(filtered.slice(0, 30))
}

function scoreJobWithKeywords(job: JobPosting, profile: CandidateProfile): MatchedJob {
  const text = `${job.title} ${job.description}`.toLowerCase()
  const isDevRole = devKeywords.some((kw) => text.includes(kw))
  const isRemote = remoteKeywords.some((kw) => text.includes(kw)) || job.location.toLowerCase().includes('remote')

  const skillMatches = profile.skills.filter((skill) => {
    const s = skill.toLowerCase()
    return text.includes(s) || text.includes(s.replace('.', '')) || text.includes(s.replace(' ', ''))
  })

  let score = 0
  if (isDevRole) score += 30
  if (isRemote) score += 20
  score += Math.min(skillMatches.length * 10, 40)

  let experienceFit = 'junior-mid'
  if (seniorityKeywords.junior.some((kw) => text.includes(kw))) experienceFit = 'junior'
  else if (seniorityKeywords.senior.some((kw) => text.includes(kw))) experienceFit = 'senior'
  else if (seniorityKeywords.mid.some((kw) => text.includes(kw))) experienceFit = 'mid'

  if (experienceFit === 'senior' && !seniorityKeywords.junior.some((kw) => text.includes(kw))) score -= 20

  const redFlags: string[] = []
  if (experienceFit === 'senior') redFlags.push('Senior role — may require 5+ years')
  if (text.includes('security clearance')) redFlags.push('Requires security clearance')

  return {
    ...job,
    matchScore: Math.min(score, 100),
    matchReason: skillMatches.length > 0
      ? `Matches ${skillMatches.length} skills: ${skillMatches.slice(0, 4).join(', ')}`
      : isDevRole ? 'Relevant developer role' : 'Limited match',
    experienceFit,
    redFlags,
    matchMethod: 'keyword',
  }
}

async function matchSingleJobAI(
  client: ReturnType<typeof getAIClient>,
  job: JobPosting,
  profileContext: string
): Promise<MatchedJob | null> {
  try {
    const systemPrompt = `You are an expert technical recruiter. Evaluate how well a job matches a candidate using a structured rubric.

Return ONLY valid JSON:
{
  "skillScore": <0-25>,
  "expScore": <0-25>,
  "domainScore": <0-25>,
  "remoteScore": <0-25>,
  "total": <0-100, sum of above>,
  "experienceFit": "<junior|mid|senior|junior-mid>",
  "isRelevant": <true if software dev/engineer role>,
  "isRemote": <true if allows remote>,
  "redFlags": ["list of concerns: senior-only, security clearance, specific location required, etc."],
  "reasoning": "<1 sentence summary>"
}

Scoring:
- skillScore: How many required skills match the candidate (25 = perfect overlap)
- expScore: Is the experience level appropriate? (25 = junior/mid match, 0 = senior-only)
- domainScore: Is it a relevant dev role? (25 = frontend/backend/fullstack/AI, 0 = non-dev)
- remoteScore: Can they work remotely? (25 = fully remote, 0 = on-site only)`

    const userMessage = `${profileContext}

JOB:
Title: ${job.title}
Company: ${job.company}
Source: ${job.source}
Description: ${job.description.slice(0, 600)}
Tags: ${job.tags.join(', ')}

Evaluate. Return JSON only.`

    const response = await client.create([
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userMessage },
    ])

    let raw = response.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    const result = JSON.parse(raw)

    if (!result.isRelevant || !result.isRemote) return null

    return {
      ...job,
      matchScore: result.total,
      matchReason: result.reasoning,
      experienceFit: result.experienceFit,
      redFlags: result.redFlags || [],
      matchMethod: 'ai',
    }
  } catch {
    const profile: CandidateProfile = {
      name: 'Ajibade Hassan', role: 'Full-Stack Web Developer & AI Engineer',
      location: 'Lagos, Nigeria', email: 'hassanajibade17@gmail.com',
      experienceLevel: 'junior-mid',
      skills: ['React','Next.js','TypeScript','JavaScript','Node.js','Python','Django','REST API','PostgreSQL','MySQL','Prisma','Tailwind CSS','HTML5','CSS3','SCSS','Docker','Git','LLM Integration','Prompt Engineering','RAG','LangChain','Responsive Design','SEO','Jest'],
      categories: ['Full-Stack','Frontend','Backend','AI Engineer'],
      githubUsername: 'AjibadeHassan', topRepos: [], resumeHighlights: '', bio: '',
      updatedAt: new Date().toISOString(),
    }
    const kw = scoreJobWithKeywords(job, profile)
    return kw.matchScore >= 40 ? kw : null
  }
}
