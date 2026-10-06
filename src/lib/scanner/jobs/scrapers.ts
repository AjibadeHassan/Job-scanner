// Job scrapers — 6 free remote job APIs
// All return normalized JobPosting objects

export interface JobPosting {
  id: string          // unique ID (source + original ID)
  title: string
  company: string
  description: string
  url: string          // job detail URL
  applyUrl?: string    // direct apply URL (if available)
  location: string
  category: string
  tags: string[]
  salary?: string
  postedAt: string     // ISO date
  source: string       // which API it came from
}

// 1. RemoteOK — free JSON API, no auth
async function scrapeRemoteOK(): Promise<JobPosting[]> {
  try {
    const res = await fetch('https://remoteok.com/api?tags=remote', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`RemoteOK: ${res.status}`)
    const data = await res.json()
    // First element is a token object, rest are jobs
    return data
      .slice(1)
      .filter((j: any) => j.position && j.company)
      .map((j: any): JobPosting => ({
        id: `remoteok-${j.id}`,
        title: j.position,
        company: j.company,
        description: `${j.description || ''} ${j.tags?.join(', ') || ''}`.trim(),
        url: j.url || `https://remoteok.com/l/${j.id}`,
        applyUrl: j.apply_url || j.url,
        location: j.location || 'Remote',
        category: j.tags?.[0] || 'General',
        tags: j.tags || [],
        salary: j.salary,
        postedAt: new Date((j.epoch || Date.now() / 1000) * 1000).toISOString(),
        source: 'RemoteOK',
      }))
  } catch (err) {
    console.error('RemoteOK error:', err)
    return []
  }
}

// 2. Remotive — free JSON API, no auth
async function scrapeRemotive(): Promise<JobPosting[]> {
  try {
    const res = await fetch('https://remotive.com/api/remote-jobs?limit=50')
    if (!res.ok) throw new Error(`Remotive: ${res.status}`)
    const data = await res.json()
    return (data.jobs || []).map((j: any): JobPosting => ({
      id: `remotive-${j.id}`,
      title: j.title,
      company: j.company_name,
      description: j.description || '',
      url: j.url,
      applyUrl: j.url,
      location: j.candidate_required_location || 'Remote',
      category: j.category || 'General',
      tags: j.tags || [],
      salary: j.salary,
      postedAt: j.publication_date || new Date().toISOString(),
      source: 'Remotive',
    }))
  } catch (err) {
    console.error('Remotive error:', err)
    return []
  }
}

// 3. WeWorkRemotely — free RSS feed
async function scrapeWeWorkRemotely(): Promise<JobPosting[]> {
  try {
    const res = await fetch('https://weworkremotely.com/remote-jobs.rss', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`WWR: ${res.status}`)
    const xml = await res.text()
    // Parse RSS XML (simple regex-based parser for items)
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 50).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      // Title format: "Company: Job Title (Location)"
      const parts = title.split(':')
      const company = parts[0]?.trim() || 'Unknown'
      const jobTitle = parts.slice(1).join(':').trim() || title
      return {
        id: `wwr-${idx}`,
        title: jobTitle.replace(/\(.*?\)/, '').trim(),
        company,
        description: description.replace(/<[^>]*>/g, '').trim(),
        url: link,
        applyUrl: link,
        location: 'Remote',
        category: 'General',
        tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'WeWorkRemotely',
      }
    })
  } catch (err) {
    console.error('WeWorkRemotely error:', err)
    return []
  }
}

// 4. Hacker News "Who's Hiring" — free Algolia API
async function scrapeHackerNews(): Promise<JobPosting[]> {
  try {
    // Search for "who is hiring" stories, then fetch comments
    // Use Algolia's HN search API
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=Ask+HN%3A+Who+is+hiring&tags=story&hitsPerPage=1`
    )
    if (!res.ok) throw new Error(`HN: ${res.status}`)
    const data = await res.json()
    const storyId = data.hits?.[0]?.objectID
    if (!storyId) return []

    // Fetch top comments from the "Who's Hiring" thread
    const commentsRes = await fetch(
      `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=50`
    )
    if (!commentsRes.ok) return []
    const commentsData = await commentsRes.json()

    return (commentsData.hits || [])
      .filter((c: any) => c.comment_text && c.comment_text.length > 50)
      .slice(0, 40)
      .map((c: any, idx: number): JobPosting => {
        const text = c.comment_text.replace(/<[^>]*>/g, '')
        // Try to extract company/title from first line
        const firstLine = text.split('\n')[0]
        return {
          id: `hn-${c.objectID}`,
          title: firstLine.slice(0, 100),
          company: firstLine.split(/[|\-–at:]/)[0].trim() || 'Unknown',
          description: text.slice(0, 1000),
          url: `https://news.ycombinator.com/item?id=${c.objectID}`,
          applyUrl: `https://news.ycombinator.com/item?id=${c.objectID}`,
          location: 'Remote',
          category: 'General',
          tags: [],
          postedAt: c.created_at,
          source: 'HackerNews',
        }
      })
  } catch (err) {
    console.error('HackerNews error:', err)
    return []
  }
}

// 5. Working Nomads — RSS feed
async function scrapeWorkingNomads(): Promise<JobPosting[]> {
  try {
    const res = await fetch('https://www.workingnomads.com/jobsfeed', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`WorkingNomads: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `wn-${idx}`,
        title,
        company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link,
        applyUrl: link,
        location: 'Remote',
        category: 'General',
        tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'WorkingNomads',
      }
    })
  } catch (err) {
    console.error('WorkingNomads error:', err)
    return []
  }
}

// 6. Europe Remote — RSS feed
async function scrapeEuropeRemote(): Promise<JobPosting[]> {
  try {
    const res = await fetch('https://europeremote.com/jobs.rss', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`EuropeRemote: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `er-${idx}`,
        title,
        company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link,
        applyUrl: link,
        location: 'Remote (Europe)',
        category: 'General',
        tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'EuropeRemote',
      }
    })
  } catch (err) {
    console.error('EuropeRemote error:', err)
    return []
  }
}

// Main scraper — runs all 6 in parallel
export async function scrapeAllJobs(): Promise<JobPosting[]> {
  console.log('Scraping all job boards...')
  const [remoteok, remotive, wwr, hn, wn, er] = await Promise.all([
    scrapeRemoteOK(),
    scrapeRemotive(),
    scrapeWeWorkRemotely(),
    scrapeHackerNews(),
    scrapeWorkingNomads(),
    scrapeEuropeRemote(),
  ])

  const all = [...remoteok, ...remotive, ...wwr, ...hn, ...wn, ...er]
  console.log(`✓ Scraped ${all.length} jobs total (${remoteok.length} RemoteOK, ${remotive.length} Remotive, ${wwr.length} WWR, ${hn.length} HN, ${wn.length} WorkingNomads, ${er.length} EuropeRemote)`)

  // Deduplicate by URL
  const seen = new Set<string>()
  const unique = all.filter((j) => {
    if (seen.has(j.url)) return false
    seen.add(j.url)
    return true
  })
  console.log(`✓ ${unique.length} unique jobs after dedup`)
  return unique
}
