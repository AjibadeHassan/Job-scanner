import { NextRequest, NextResponse } from 'next/server'
import { loadResults } from '@/lib/scanner/storage'
import { recordApplication, generateMailtoLink, type Application } from '@/lib/scanner/applications'

export async function POST(req: NextRequest) {
  try {
    const { jobId, recipientEmail } = await req.json()

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const results = loadResults()
    if (!results) {
      return NextResponse.json({ error: 'No scan results available' }, { status: 404 })
    }

    const job = results.jobs.find((j) => j.id === jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Record the application
    const application: Application = recordApplication(job)

    // Generate mailto link for email application
    const mailtoLink = generateMailtoLink(job, recipientEmail)

    return NextResponse.json({
      application,
      mailtoLink,
      applyUrl: job.applyUrl || job.url,
      coverLetter: job.coverLetter || '',
      jobTitle: job.title,
      company: job.company,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
