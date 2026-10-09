// Main scanner orchestrator — v2 with source rotation + dedup + AI matching
import { loadProfile } from './profile'
import { scrapeRotatedSources } from './jobs/sourceRotation'
import { deduplicateJobs } from './jobs/dedup'
import { matchJobs, type MatchedJob } from './matcher'
import { generateCoverLetter, generateTemplateCoverLetter } from './coverletter'
import { sendTelegramNotification } from './notifier'
import { saveResults, type ScanResult } from './storage'
import { getAIClient } from './ai'

export async function runScan(): Promise<ScanResult> {
  console.log('=== Job Scanner v2 Started ===')
  console.log(`Time: ${new Date().toISOString()}\n`)

  // Step 1: Load profile
  console.log('Step 1: Loading profile...')
  const profile = await loadProfile()
  console.log(`✓ Profile loaded for ${profile.name}\n`)

  // Step 2: Scrape (rotated sources, 24h cooldown)
  console.log('Step 2: Scraping (source rotation)...')
  const { jobs: scrapedJobs, sourcesUsed, sourcesSkipped } = await scrapeRotatedSources()

  if (sourcesUsed.length === 0) {
    console.log('✓ All sources on cooldown — skipping scan\n')
    const result: ScanResult = {
      scanDate: new Date().toISOString(),
      totalScraped: 0, totalNew: 0, totalMatched: 0,
      sourcesUsed: [], sourcesSkipped, jobs: [], notified: false,
      aiProvider: 'none',
    }
    saveResults(result)
    return result
  }

  console.log(`✓ Scraped ${scrapedJobs.length} jobs from ${sourcesUsed.length} sources\n`)

  if (scrapedJobs.length === 0) {
    const result: ScanResult = {
      scanDate: new Date().toISOString(),
      totalScraped: 0, totalNew: 0, totalMatched: 0,
      sourcesUsed, sourcesSkipped, jobs: [], notified: false,
      aiProvider: getAIClient().provider,
    }
    saveResults(result)
    return result
  }

  // Step 3: Deduplicate (filter out previously seen jobs)
  console.log('Step 3: Deduplicating...')
  const { newJobs, duplicates } = deduplicateJobs(scrapedJobs)
  console.log(`✓ ${newJobs.length} new jobs (${duplicates} duplicates filtered)\n`)

  if (newJobs.length === 0) {
    console.log('No new jobs found — all were seen before. Exiting.')
    const result: ScanResult = {
      scanDate: new Date().toISOString(),
      totalScraped: scrapedJobs.length, totalNew: 0, totalMatched: 0,
      sourcesUsed, sourcesSkipped, jobs: [], notified: false,
      aiProvider: getAIClient().provider,
    }
    saveResults(result)
    return result
  }

  // Step 4: Match (AI with keyword fallback)
  console.log('Step 4: Matching jobs...')
  const matchedJobs = await matchJobs(newJobs, profile)
  console.log(`✓ ${matchedJobs.length} jobs matched\n`)

  // Step 5: Generate cover letters for top 10
  console.log('Step 5: Generating cover letters...')
  const topMatches = matchedJobs.slice(0, 10)
  for (const job of topMatches) {
    try {
      job.coverLetter = await generateCoverLetter(job, profile)
      console.log(`  ✓ ${job.title.slice(0, 40)} at ${job.company}`)
    } catch {
      job.coverLetter = generateTemplateCoverLetter(job, profile)
      console.log(`  → template for ${job.title.slice(0, 40)}`)
    }
  }
  console.log(`✓ Cover letters done\n`)

  // Step 6: Save results
  console.log('Step 6: Saving results...')
  const result: ScanResult = {
    scanDate: new Date().toISOString(),
    totalScraped: scrapedJobs.length,
    totalNew: newJobs.length,
    totalMatched: matchedJobs.length,
    sourcesUsed,
    sourcesSkipped,
    jobs: matchedJobs,
    notified: false,
    aiProvider: getAIClient().provider,
  }
  saveResults(result)
  console.log('✓ Results saved\n')

  // Step 7: Telegram notification
  console.log('Step 7: Sending Telegram notification...')
  const notified = await sendTelegramNotification(matchedJobs)
  result.notified = notified
  saveResults(result)
  console.log(`✓ Notification ${notified ? 'sent' : 'skipped'}\n`)

  console.log('=== Scan Complete ===')
  console.log(`Scraped: ${result.totalScraped} | New: ${result.totalNew} | Matched: ${result.totalMatched} | AI: ${result.aiProvider}`)

  return result
}

// Only auto-run when executed directly via `bun run src/lib/scanner/index.ts`
// NOT during Next.js build (which imports this module for type collection)
if (process.argv[1]?.endsWith('scanner/index.ts') || process.argv[1]?.endsWith('scanner\\index.ts')) {
  runScan().then(() => process.exit(0)).catch((err) => {
    console.error('Scan failed:', err)
    process.exit(1)
  })
}
