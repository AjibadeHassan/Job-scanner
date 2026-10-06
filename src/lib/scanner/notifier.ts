// WhatsApp Notifier — sends job alerts via CallMeBot API (free)
import { type MatchedJob } from './matcher'

export async function sendWhatsAppNotification(jobs: MatchedJob[]): Promise<boolean> {
  const apiKey = process.env.CALLMEBOT_API_KEY
  const phone = process.env.WHATSAPP_PHONE

  if (!apiKey || !phone) {
    console.log('⚠️  WhatsApp credentials not set (CALLMEBOT_API_KEY, WHATSAPP_PHONE). Skipping notification.')
    return false
  }

  if (jobs.length === 0) {
    console.log('No matched jobs to notify.')
    return false
  }

  // Build the message (WhatsApp has a ~4096 char limit, keep it concise)
  const topJobs = jobs.slice(0, 5)
  const jobLines = topJobs
    .map(
      (j, i) =>
        `${i + 1}. *${j.title}* at ${j.company}\n   Score: ${j.matchScore}/100 | ${j.experienceFit}\n   ${j.url}`
    )
    .join('\n\n')

  const message = `🔔 *Job Scanner Report*\n\n_${jobs.length} new matched jobs found!_\n\n${jobLines}\n\n_Check the dashboard for full details and cover letters._`

  try {
    // CallMeBot WhatsApp API
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apiKey}`
    const res = await fetch(url)

    if (res.ok) {
      console.log(`✓ WhatsApp notification sent (${topJobs.length} jobs)`)
      return true
    } else {
      console.error('WhatsApp notification failed:', res.status, await res.text())
      return false
    }
  } catch (err) {
    console.error('WhatsApp notification error:', err)
    return false
  }
}
