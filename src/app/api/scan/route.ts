import { NextRequest, NextResponse } from 'next/server'

// Manual scan trigger — dispatches GitHub Actions workflow
// (can't run scan in-process on Vercel due to serverless timeout)
export async function POST(req: NextRequest) {
  try {
    const ghToken = process.env.GH_DISPATCH_TOKEN || process.env.GITHUB_TOKEN

    if (!ghToken) {
      // No token — return link to Actions page
      return NextResponse.json({
        message: 'No dispatch token configured. Trigger scan manually on GitHub.',
        actionsUrl: 'https://github.com/AjibadeHassan/Job-scanner/actions/workflows/scan.yml',
        dispatched: false,
      })
    }

    // Dispatch the workflow via GitHub API
    const res = await fetch(
      'https://api.github.com/repos/AjibadeHassan/Job-scanner/actions/workflows/scan.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ghToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    )

    if (res.ok) {
      return NextResponse.json({
        message: 'Scan dispatched! Check GitHub Actions — results will appear in 2-3 minutes.',
        dispatched: true,
      })
    }

    // Token doesn't have workflow scope — fall back to link
    return NextResponse.json({
      message: 'Could not dispatch automatically. Trigger scan manually on GitHub.',
      actionsUrl: 'https://github.com/AjibadeHassan/Job-scanner/actions/workflows/scan.yml',
      dispatched: false,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
