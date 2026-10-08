// Application tracking — stores which jobs you've applied to + their status
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { type MatchedJob } from './matcher'

export interface Application {
  jobId: string
  title: string
  company: string
  url: string
  coverLetter: string
  status: 'applied' | 'ignored' | 'interested' | 'rejected'
  appliedAt: string
  emailSubject?: string
  emailBody?: string
}

const DATA_DIR = join(process.cwd(), 'data')
const APPS_FILE = join(DATA_DIR, 'applications.json')

export function loadApplications(): Application[] {
  if (!existsSync(APPS_FILE)) return []
  try { return JSON.parse(readFileSync(APPS_FILE, 'utf-8')) } catch { return [] }
}

function saveApplications(apps: Application[]): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2))
}

export function recordApplication(job: MatchedJob): Application {
  const apps = loadApplications()
  // Check if already applied
  const existing = apps.find((a) => a.jobId === job.id)
  if (existing) return existing

  const subject = `Application for ${job.title} — Ajibade Hassan`
  const emailBody = job.coverLetter || ''

  const application: Application = {
    jobId: job.id,
    title: job.title,
    company: job.company,
    url: job.applyUrl || job.url,
    coverLetter: job.coverLetter || '',
    status: 'applied',
    appliedAt: new Date().toISOString(),
    emailSubject: subject,
    emailBody,
  }

  apps.push(application)
  saveApplications(apps)
  return application
}

export function updateApplicationStatus(jobId: string, status: Application['status']): void {
  const apps = loadApplications()
  const app = apps.find((a) => a.jobId === jobId)
  if (app) {
    app.status = status
    saveApplications(apps)
  }
}

export function getApplicationStats(): { total: number; applied: number; ignored: number; interested: number; rejected: number } {
  const apps = loadApplications()
  return {
    total: apps.length,
    applied: apps.filter((a) => a.status === 'applied').length,
    ignored: apps.filter((a) => a.status === 'ignored').length,
    interested: apps.filter((a) => a.status === 'interested').length,
    rejected: apps.filter((a) => a.status === 'rejected').length,
  }
}

// Generate a mailto: link for email-based application
export function generateMailtoLink(job: MatchedJob, recipientEmail?: string): string {
  const subject = `Application for ${job.title} — Ajibade Hassan`
  const body = job.coverLetter || ''
  const to = recipientEmail || '' // user provides the company's application email
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
