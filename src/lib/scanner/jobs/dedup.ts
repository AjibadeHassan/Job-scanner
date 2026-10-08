// Deduplication — tracks seen jobs across scans, filters out duplicates
// Jobs expire from the seen list after 3 days (configurable)

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { type JobPosting } from './scrapers'

interface SeenJob {
  url: string
  title: string
  company: string
  firstSeen: string // ISO date
}

const DATA_DIR = join(process.cwd(), 'data')
const SEEN_FILE = join(DATA_DIR, 'seen_jobs.json')
const RETENTION_DAYS = 3

function loadSeenJobs(): Map<string, SeenJob> {
  if (!existsSync(SEEN_FILE)) return new Map()
  try {
    const data: SeenJob[] = JSON.parse(readFileSync(SEEN_FILE, 'utf-8'))
    return new Map(data.map((j) => [j.url, j]))
  } catch { return new Map() }
}

function saveSeenJobs(seen: Map<string, SeenJob>): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  const arr = Array.from(seen.values())
  writeFileSync(SEEN_FILE, JSON.stringify(arr, null, 2))
}

// Remove jobs older than RETENTION_DAYS
function purgeOldJobs(seen: Map<string, SeenJob>): number {
  const now = Date.now()
  const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000
  let purged = 0

  for (const [url, job] of seen) {
    const age = now - new Date(job.firstSeen).getTime()
    if (age > retentionMs) {
      seen.delete(url)
      purged++
    }
  }
  return purged
}

// Filter out jobs already seen; add new jobs to seen list
export function deduplicateJobs(jobs: JobPosting[]): { newJobs: JobPosting[]; duplicates: number; totalSeen: number } {
  const seen = loadSeenJobs()
  const purged = purgeOldJobs(seen)

  const newJobs: JobPosting[] = []
  let duplicates = 0

  for (const job of jobs) {
    // Normalize URL for comparison (remove trailing slashes, query params for tracking)
    const normalizedUrl = normalizeUrl(job.url)

    if (seen.has(normalizedUrl)) {
      duplicates++
    } else {
      seen.set(normalizedUrl, {
        url: normalizedUrl,
        title: job.title,
        company: job.company,
        firstSeen: new Date().toISOString(),
      })
      newJobs.push(job)
    }
  }

  saveSeenJobs(seen)

  console.log(`  Dedup: ${jobs.length} scraped → ${newJobs.length} new (${duplicates} duplicates filtered, ${purged} old entries purged)`)
  console.log(`  Total seen jobs in memory: ${seen.size}`)

  return { newJobs, duplicates, totalSeen: seen.size }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    // Remove tracking params, keep path
    return `${u.origin}${u.pathname}`.replace(/\/$/, '')
  } catch {
    return url.replace(/\/$/, '').split('?')[0]
  }
}
