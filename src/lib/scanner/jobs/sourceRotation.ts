// Source rotation manager — picks a random available subset of sources per scan
// Each source has a 24h cooldown: if scraped in the last 24h, it's skipped

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { type JobPosting } from './scrapers'

interface SourceHistory {
  [sourceName: string]: {
    lastScraped: string // ISO date
    jobsFound: number
  }
}

const DATA_DIR = join(process.cwd(), 'data')
const HISTORY_FILE = join(DATA_DIR, 'source_history.json')
const COOLDOWN_HOURS = 24
const SOURCES_PER_SCAN = 12

// Import all scraper functions
import {
  scrapeRemoteOK, scrapeRemotive, scrapeHackerNews, scrapeArbeitnow,
  scrapePythonJobs, scrapeWeWorkRemotely, scrapeWeWorkRemotelyDev,
  scrapeWeWorkRemotelyFrontend, scrapeWeWorkRemotelyFullStack, scrapeWeWorkRemotelyDevOps,
  scrapeEuropeRemote, scrapeJobicy, scrapeRemoteCo, scrapeDailyRemote,
  scrapeJustRemote, scrapeRemotePeople, scrapeCrossover, scrapeLandingJobs,
  scrapeWellfound, scrapeOtta, scrapeUpwork, scrapeUpworkNode,
  scrapeUpworkPython, scrapeUpworkAI, scrapeFreelancer, scrapeGuru,
  scrapeRedditRemoteJobs, scrapeRedditForHire,
} from './scrapers'

// The full pool of 28 sources
const SOURCE_POOL: { name: string; scrape: () => Promise<JobPosting[]>; reliability: string }[] = [
  { name: 'RemoteOK', scrape: scrapeRemoteOK, reliability: 'high' },
  { name: 'Remotive', scrape: scrapeRemotive, reliability: 'high' },
  { name: 'HackerNews', scrape: scrapeHackerNews, reliability: 'high' },
  { name: 'Arbeitnow', scrape: scrapeArbeitnow, reliability: 'high' },
  { name: 'PythonJobs', scrape: scrapePythonJobs, reliability: 'medium' },
  { name: 'WeWorkRemotely', scrape: scrapeWeWorkRemotely, reliability: 'high' },
  { name: 'WeWorkRemotely-Dev', scrape: scrapeWeWorkRemotelyDev, reliability: 'high' },
  { name: 'WeWorkRemotely-Frontend', scrape: scrapeWeWorkRemotelyFrontend, reliability: 'high' },
  { name: 'WeWorkRemotely-FullStack', scrape: scrapeWeWorkRemotelyFullStack, reliability: 'high' },
  { name: 'WeWorkRemotely-DevOps', scrape: scrapeWeWorkRemotelyDevOps, reliability: 'medium' },
  { name: 'EuropeRemote', scrape: scrapeEuropeRemote, reliability: 'medium' },
  { name: 'Jobicy', scrape: scrapeJobicy, reliability: 'medium' },
  { name: 'Remote.co', scrape: scrapeRemoteCo, reliability: 'medium' },
  { name: 'DailyRemote', scrape: scrapeDailyRemote, reliability: 'medium' },
  { name: 'JustRemote', scrape: scrapeJustRemote, reliability: 'medium' },
  { name: 'RemotePeople', scrape: scrapeRemotePeople, reliability: 'low' },
  { name: 'Crossover', scrape: scrapeCrossover, reliability: 'low' },
  { name: 'LandingJobs', scrape: scrapeLandingJobs, reliability: 'medium' },
  { name: 'Wellfound', scrape: scrapeWellfound, reliability: 'medium' },
  { name: 'Otta', scrape: scrapeOtta, reliability: 'medium' },
  { name: 'Upwork', scrape: scrapeUpwork, reliability: 'medium' },
  { name: 'Upwork-Node', scrape: scrapeUpworkNode, reliability: 'medium' },
  { name: 'Upwork-Python', scrape: scrapeUpworkPython, reliability: 'medium' },
  { name: 'Upwork-AI', scrape: scrapeUpworkAI, reliability: 'medium' },
  { name: 'Freelancer', scrape: scrapeFreelancer, reliability: 'low' },
  { name: 'Guru', scrape: scrapeGuru, reliability: 'low' },
  { name: 'Reddit-RemoteJobs', scrape: scrapeRedditRemoteJobs, reliability: 'medium' },
  { name: 'Reddit-ForHire', scrape: scrapeRedditForHire, reliability: 'medium' },
]

function loadHistory(): SourceHistory {
  if (!existsSync(HISTORY_FILE)) return {}
  try { return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { return {} }
}

function saveHistory(history: SourceHistory): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2))
}

export function getAvailableSources(): { name: string; scrape: () => Promise<JobPosting[]>; reliability: string }[] {
  const history = loadHistory()
  const now = Date.now()
  const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000

  const available = SOURCE_POOL.filter((source) => {
    const lastScraped = history[source.name]?.lastScraped
    if (!lastScraped) return true // never scraped
    const elapsed = now - new Date(lastScraped).getTime()
    return elapsed >= cooldownMs
  })

  return available
}

export function pickRandomSubset<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, arr.length))
}

export async function scrapeRotatedSources(): Promise<{ jobs: JobPosting[]; sourcesUsed: string[]; sourcesSkipped: number }> {
  const available = getAvailableSources()

  if (available.length === 0) {
    console.log('  ⏸  All sources scraped within last 24h — skipping this scan')
    return { jobs: [], sourcesUsed: [], sourcesSkipped: SOURCE_POOL.length }
  }

  // Pick a random subset, prioritizing high-reliability sources
  const highReliability = available.filter((s) => s.reliability === 'high')
  const otherReliability = available.filter((s) => s.reliability !== 'high')

  // Always include all high-reliability sources (if available)
  // Fill the rest with random picks from others
  const slotsRemaining = Math.max(0, SOURCES_PER_SCAN - highReliability.length)
  const randomOthers = pickRandomSubset(otherReliability, slotsRemaining)
  const selected = [...highReliability, ...randomOthers]

  console.log(`  Pool: ${SOURCE_POOL.length} sources | Available: ${available.length} | Selected: ${selected.length}`)
  console.log(`  Sources: ${selected.map((s) => s.name).join(', ')}`)

  // Scrape selected sources in parallel
  const results = await Promise.all(
    selected.map(async (source) => {
      try {
        const jobs = await source.scrape()
        return { name: source.name, jobs, success: true }
      } catch {
        return { name: source.name, jobs: [] as JobPosting[], success: false }
      }
    })
  )

  // Update history
  const history = loadHistory()
  const now = new Date().toISOString()
  for (const result of results) {
    history[result.name] = { lastScraped: now, jobsFound: result.jobs.length }
  }
  saveHistory(history)

  const allJobs = results.flatMap((r) => r.jobs)
  const sourcesUsed = results.filter((r) => r.success).map((r) => r.name)
  const sourcesSkipped = SOURCE_POOL.length - available.length

  // Log per-source counts
  for (const result of results) {
    console.log(`    ${result.name}: ${result.jobs.length} jobs${result.success ? '' : ' (failed)'}`)
  }

  return { jobs: allJobs, sourcesUsed, sourcesSkipped }
}
