// Profile loader — fetches GitHub repos + parses resume to build a candidate profile
import { getAIClient } from './ai'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface CandidateProfile {
  name: string
  role: string
  location: string
  email: string
  experienceLevel: string
  skills: string[]
  categories: string[]
  githubUsername: string
  topRepos: { name: string; description: string; language: string; stars: number; url: string }[]
  resumeHighlights: string
  bio: string
  updatedAt: string
}

const CACHE_FILE = join(process.cwd(), 'data', 'profile.json')
const CACHE_TTL = 24 * 60 * 60 * 1000

const PORTFOLIO_CONTEXT = `
Name: Ajibade Hassan
Role: Full-Stack Web Developer & AI Engineer
Location: Lagos, Nigeria (open to remote)
Email: hassanajibade17@gmail.com
GitHub: AjibadeHassan

Skills:
- Frontend: React, Next.js, TypeScript, JavaScript, HTML5, CSS3, SCSS, Tailwind CSS, Responsive Design
- Backend: Node.js, Python, Django, REST API, PostgreSQL, MySQL, Prisma
- AI Engineering: LLM Integration, Prompt Engineering, RAG, OpenAI API, LangChain, Vector Databases
- Tools: Git, GitHub, Docker, Jest, Vite, Webpack, Linux/Terminal, SEO

Experience: 3+ years coding, 20+ projects built, 30+ GitHub repos
Notable projects:
- E-Hospital Management System (Next.js 16, Prisma, AI chatbot with RAG, symptom triage)
- Developer Portfolio (Next.js 16, AI assistant, dark mode, Prisma contact form)
- Django REST + React (full-stack integration)
- E-Commerce web application (React, service booking + product ordering)
`

export async function loadProfile(): Promise<CandidateProfile> {
  if (existsSync(CACHE_FILE)) {
    const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
    if (Date.now() - new Date(cached.updatedAt).getTime() < CACHE_TTL) {
      console.log('✓ Using cached profile')
      return cached
    }
  }

  console.log('Building fresh profile...')
  const githubUsername = process.env.GITHUB_USERNAME || 'AjibadeHassan'
  const githubToken = process.env.GITHUB_TOKEN

  let topRepos: CandidateProfile['topRepos'] = []
  try {
    const headers: Record<string, string> = { 'User-Agent': 'job-scanner' }
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`
    const res = await fetch(
      `https://api.github.com/users/${githubUsername}/repos?sort=updated&per_page=30&type=owner`,
      { headers }
    )
    if (res.ok) {
      const repos = await res.json()
      topRepos = repos
        .filter((r: any) => !r.fork)
        .sort((a: any, b: any) => b.stargazers_count - a.stargazers_count)
        .slice(0, 10)
        .map((r: any) => ({
          name: r.name, description: r.description || '',
          language: r.language || 'Unknown', stars: r.stargazers_count, url: r.html_url,
        }))
      console.log(`✓ Fetched ${topRepos.length} repos from GitHub`)
    }
  } catch (err) { console.error('GitHub API error:', err) }

  let resumeHighlights = ''
  try {
    resumeHighlights = await parseResumeWithLLM()
    console.log('✓ Resume parsed')
  } catch (err) {
    console.log('⚠️  Resume parsing skipped (AI unavailable), using portfolio context')
    resumeHighlights = PORTFOLIO_CONTEXT
  }

  const profile: CandidateProfile = {
    name: 'Ajibade Hassan',
    role: 'Full-Stack Web Developer & AI Engineer',
    location: 'Lagos, Nigeria (open to remote)',
    email: 'hassanajibade17@gmail.com',
    experienceLevel: 'junior-mid',
    skills: [
      'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js',
      'Python', 'Django', 'REST API', 'PostgreSQL', 'MySQL', 'Prisma',
      'Tailwind CSS', 'HTML5', 'CSS3', 'SCSS', 'Docker', 'Git',
      'LLM Integration', 'Prompt Engineering', 'RAG', 'LangChain',
      'Responsive Design', 'SEO', 'Jest',
    ],
    categories: ['Full-Stack', 'Frontend', 'Backend', 'AI Engineer', 'Remote Developer'],
    githubUsername, topRepos, resumeHighlights,
    bio: PORTFOLIO_CONTEXT, updatedAt: new Date().toISOString(),
  }

  writeFileSync(CACHE_FILE, JSON.stringify(profile, null, 2))
  console.log('✓ Profile cached')
  return profile
}

async function parseResumeWithLLM(): Promise<string> {
  const client = getAIClient()
  if (!client.isAvailable()) {
    return PORTFOLIO_CONTEXT
  }
  const response = await client.create([
    { role: 'assistant', content: 'You are a resume parser. Extract key professional highlights from this candidate info. Return a concise summary of experience, skills, and achievements in 200 words or less.' },
    { role: 'user', content: PORTFOLIO_CONTEXT },
  ])
  return response || PORTFOLIO_CONTEXT
}

export function buildProfileContext(profile: CandidateProfile): string {
  const repoLines = profile.topRepos
    .map((r) => `- ${r.name} (${r.language}, ${r.stars}★): ${r.description}`)
    .join('\n')
  return `CANDIDATE PROFILE:
Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}
Email: ${profile.email}
Experience Level: ${profile.experienceLevel} (target both junior and mid-level positions)
Job Categories: ${profile.categories.join(', ')}

SKILLS:
${profile.skills.join(', ')}

TOP GITHUB PROJECTS:
${repoLines || 'See resume highlights'}

RESUME HIGHLIGHTS:
${profile.resumeHighlights}`
}
