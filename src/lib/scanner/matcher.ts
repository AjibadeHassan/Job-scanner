// AI Matcher — uses LLM to score jobs against the candidate profile
import ZAI from 'z-ai-web-dev-sdk'
import { type CandidateProfile, buildProfileContext } from './profile'
import { type JobPosting } from './jobs/scrapers'

export interface MatchedJob extends JobPosting {
  matchScore: number      // 0-100
  matchReason: string     // why it matched
  experienceFit: string   // 'junior' | 'mid' | 'senior' | 'junior-mid'
  coverLetter?: string    // generated after matching
}

export async function matchJobs(
  jobs: JobPosting[],
  profile: CandidateProfile
): Promise<MatchedJob[]> {
  console.log(`AI matching ${jobs.length} jobs...`)
  const zai = await ZAI.create()
  const profileContext = buildProfileContext(profile)

  const matched: MatchedJob[] = []

  // Process in batches of 5 to avoid token limits
  const batchSize = 5
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize)
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(jobs.length / batchSize)}...`)

    const batchResults = await Promise.all(
      batch.map((job) => matchSingleJob(zai, job, profileContext))
    )

    for (const result of batchResults) {
      if (result && result.matchScore >= 60) {
        matched.push(result)
      }
    }
  }

  // Sort by match score descending
  matched.sort((a, b) => b.matchScore - a.matchScore)
  console.log(`✓ ${matched.length} jobs matched (score >= 60)`)
  return matched.slice(0, 30) // keep top 30
}

async function matchSingleJob(
  zai: any,
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

Only return isRelevant: true if the job is for a software developer/engineer role (frontend, backend, full-stack, AI/ML, or similar). Reject non-dev jobs (sales, marketing, design-only, etc.).
Only return isRemote: true if the job allows remote work.`

    const userMessage = `${profileContext}

JOB TO EVALUATE:
Title: ${job.title}
Company: ${job.company}
Source: ${job.source}
Description: ${job.description.slice(0, 800)}
Tags: ${job.tags.join(', ')}

Evaluate this job. Return JSON.`

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      thinking: { type: 'disabled' },
    })

    let raw = completion.choices?.[0]?.message?.content || ''
    raw = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')

    const result = JSON.parse(raw)

    // Filter out non-relevant or non-remote jobs
    if (!result.isRelevant || !result.isRemote) return null

    return {
      ...job,
      matchScore: result.matchScore,
      matchReason: result.matchReason,
      experienceFit: result.experienceFit,
    }
  } catch (err) {
    console.error(`  Match error for ${job.title}:`, err)
    return null
  }
}
