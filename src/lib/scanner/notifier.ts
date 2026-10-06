// Telegram Notifier — sends job alerts via Telegram Bot API (free, unlimited)
import { type MatchedJob } from './matcher'

export async function sendTelegramNotification(jobs: MatchedJob[]): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.log('⚠️  Telegram credentials not set (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Skipping notification.')
    return false
  }

  if (jobs.length === 0) {
    console.log('No matched jobs to notify.')
    return false
  }

  // Telegram message limit is 4096 chars — split if needed
  const topJobs = jobs.slice(0, 8)

  // Build HTML-formatted message
  const jobLines = topJobs
    .map(
      (j, i) =>
        `<b>${i + 1}. ${escapeHtml(j.title)}</b>\n` +
        `   🏢 ${escapeHtml(j.company)}\n` +
        `   ⭐ Score: ${j.matchScore}/100 | ${escapeHtml(j.experienceFit)}\n` +
        `   🔗 <a href="${j.url}">View Job</a>`
    )
    .join('\n\n')

  const header = `🔔 <b>Job Scanner Report</b>\n\n` +
    `<i>${jobs.length} matched job${jobs.length !== 1 ? 's' : ''} found!</i>\n\n`
  const footer = `\n\n📱 Check the dashboard for cover letters & apply links.`
  const fullMessage = header + jobLines + footer

  // If message exceeds Telegram's 4096 char limit, send in chunks
  if (fullMessage.length <= 4096) {
    return await sendTelegramMessage(botToken, chatId, fullMessage)
  } else {
    // Send header + first 4 jobs, then remaining in a second message
    const firstBatch = topJobs.slice(0, 4)
    const secondBatch = topJobs.slice(4)

    const msg1 = header +
      firstBatch.map((j, i) =>
        `<b>${i + 1}. ${escapeHtml(j.title)}</b>\n` +
        `   🏢 ${escapeHtml(j.company)}\n` +
        `   ⭐ ${j.matchScore}/100 | ${escapeHtml(j.experienceFit)}\n` +
        `   🔗 <a href="${j.url}">View Job</a>`
      ).join('\n\n')

    const msg2 = `<b>...continued (${secondBatch.length} more)</b>\n\n` +
      secondBatch.map((j, i) =>
        `<b>${i + 5}. ${escapeHtml(j.title)}</b>\n` +
        `   🏢 ${escapeHtml(j.company)}\n` +
        `   ⭐ ${j.matchScore}/100\n` +
        `   🔗 <a href="${j.url}">View Job</a>`
      ).join('\n\n') + footer

    const sent1 = await sendTelegramMessage(botToken, chatId, msg1)
    const sent2 = await sendTelegramMessage(botToken, chatId, msg2)
    return sent1 || sent2
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (res.ok) {
      console.log('✓ Telegram notification sent')
      return true
    } else {
      const error = await res.json()
      console.error('Telegram notification failed:', res.status, JSON.stringify(error))
      return false
    }
  } catch (err) {
    console.error('Telegram notification error:', err)
    return false
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Keep backward-compatible export name
export const sendWhatsAppNotification = sendTelegramNotification
