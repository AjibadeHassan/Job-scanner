import { NextRequest, NextResponse } from 'next/server'

// Apply endpoint — returns the apply URL + cover letter for a specific job
// The frontend uses this to open the application page and copy the cover letter
export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json()

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    // Load results to find the job
    const { loadResults } = await import('@/lib/scanner/storage')
    const results = loadResults()

    if (!results) {
      return NextResponse.json({ error: 'No scan results available' }, { status: 404 })
    }

    const job = results.jobs.find((j) => j.id === jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Return the apply URL and cover letter
    // The frontend will:
    // 1. Open the applyUrl in a new tab
    // 2. Copy the cover letter to clipboard
    // 3. If the applyUrl is a mailto:, open it with the cover letter pre-filled
    return NextResponse.json({
      applyUrl: job.applyUrl || job.url,
      coverLetter: job.coverLetter || '',
      jobTitle: job.title,
      company: job.company,
      email: 'hassanajibade17@gmail.com', // candidate's email for the application
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
