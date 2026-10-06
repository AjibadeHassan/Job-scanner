// Main scanner orchestrator — runs the full pipeline:
// 1. Load profile (GitHub + resume)
// 2. Scrape all job boards
// 3. AI match + score jobs (with keyword fallback if AI unavailable)
// 4. Generate cover letters for top matches (with template fallback)
// 5. Save results
// 6. Send Telegram notification

import { loadProfile } from './profile'
import { scrapeAllJobs } from './jobs/scrapers'
import { matchJobs, type MatchedJob } from './matcher'
import { generateCoverLetter, generateTemplateCoverLetter } from './coverletter'
import { sendTelegramNotification } from './notifier'
import { saveResults, type ScanResult } from './storage'

export async function runScan(): Promise<ScanResult> {
  console.log('=== Job Scanner Started ===')
  console.log(`Time: ${new Date().toISOString()}\n`)

  // Step 1: Load candidate profile
  console.log('Step 1: Loading profile...')
  const profile = await loadProfile()
  console.log(`✓ Profile loaded for ${profile.name}\n`)

  // Step 2: Scrape all job boards
  console.log('Step 2: Scraping job boards...')
  const jobs = await scrapeAllJobs()
  console.log(`✓ ${jobs.length} unique jobs scraped\n`)

  if (jobs.length === 0) {
    console.log('No jobs found. Exiting.')
    const result: ScanResult = {
      scanDate: new Date().toISOString(),
      totalScraped: 0,
      totalMatched: 0,
      jobs: [],
      notified: false,
    }
    saveResults(result)
    return result
  }

  // Step 3: AI match + score (with keyword fallback)
  console.log('Step 3: Matching jobs...')
  const matchedJobs = await matchJobs(jobs, profile)
  console.log(`✓ ${matchedJobs.length} jobs matched\n`)

  // Step 4: Generate cover letters for top 10 matches
  console.log('Step 4: Generating cover letters...')
  const topMatches = matchedJobs.slice(0, 10)
  for (const job of topMatches) {
    try {
      job.coverLetter = await generateCoverLetter(job, profile)
      console.log(`  ✓ Cover letter for: ${job.title} at ${job.company}`)
    } catch (err) {
      console.log(`  → Using template cover letter for: ${job.title}`)
      job.coverLetter = generateTemplateCoverLetter(job, profile)
    }
  }
  console.log(`✓ Cover letters generated for ${topMatches.length} jobs\n`)

  // Step 5: Save results
  console.log('Step 5: Saving results...')
  const result: ScanResult = {
    scanDate: new Date().toISOString(),
    totalScraped: jobs.length,
    totalMatched: matchedJobs.length,
    jobs: matchedJobs,
    notified: false,
  }
  saveResults(result)
  console.log('✓ Results saved\n')

  // Step 6: Send Telegram notification
  console.log('Step 6: Sending Telegram notification...')
  const notified = await sendTelegramNotification(matchedJobs)
  result.notified = notified
  saveResults(result)
  console.log(`✓ Notification ${notified ? 'sent' : 'skipped'}\n`)

  console.log('=== Scan Complete ===')
  console.log(`Total scraped: ${result.totalScraped}`)
  console.log(`Total matched: ${result.totalMatched}`)
  console.log(`Notified: ${notified}`)

  return result
}

// Run the scan — works with both bun and node
runScan()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Scan failed:', err)
    process.exit(1)
  })
