// Job scrapers — individual functions for each source
// Each function returns normalized JobPosting[]

export interface JobPosting {
  id: string
  title: string
  company: string
  description: string
  url: string
  applyUrl?: string
  location: string
  category: string
  tags: string[]
  salary?: string
  postedAt: string
  source: string
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function parseRssItem(itemXml: string, idx: number, sourcePrefix: string, source: string): JobPosting | null {
  const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
  const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
  const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
                      itemXml.match(/<description>(.*?)<\/description>/)?.[1] || ''
  const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''

  if (!title || !link) return null

  // Try to extract company from title (formats: "Company: Title" or "Title at Company")
  let company = 'Unknown'
  let jobTitle = title
  if (title.includes(':')) {
    const parts = title.split(':')
    company = parts[0].trim()
    jobTitle = parts.slice(1).join(':').trim()
  } else if (title.includes(' at ')) {
    const parts = title.split(' at ')
    jobTitle = parts[0].trim()
    company = parts.slice(1).join(' at ').trim()
  }

  return {
    id: `${sourcePrefix}-${idx}`,
    title: jobTitle.replace(/\(.*?\)/g, '').trim(),
    company,
    description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
    url: link,
    applyUrl: link,
    location: 'Remote',
    category: 'General',
    tags: [],
    postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    source,
  }
}

async function scrapeRssFeed(url: string, sourceName: string, prefix: string, limit = 40): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'job-scanner/2.0' } })
    if (!res.ok) throw new Error(`${sourceName}: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    const jobs: JobPosting[] = []
    for (let idx = 0; idx < Math.min(items.length, limit); idx++) {
      const job = parseRssItem(items[idx], idx, prefix, sourceName)
      if (job) jobs.push(job)
    }
    return jobs
  } catch {
    return []
  }
}

// === API-based scrapers ===

export async function scrapeRemoteOK(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://remoteok.com/api', { headers: { 'User-Agent': 'job-scanner/2.0' } })
    if (!res.ok) return []
    const data = await res.json()
    return data.slice(1).filter((j: any) => j.position && j.company).map((j: any): JobPosting => ({
      id: `remoteok-${j.id}`,
      title: j.position,
      company: j.company,
      description: `${j.description || ''} ${j.tags?.join(', ') || ''}`.trim().slice(0, 1000),
      url: j.url || `https://remoteok.com/l/${j.id}`,
      applyUrl: j.apply_url || j.url,
      location: j.location || 'Remote',
      category: j.tags?.[0] || 'General',
      tags: j.tags || [],
      salary: j.salary,
      postedAt: new Date((j.epoch || Date.now() / 1000) * 1000).toISOString(),
      source: 'RemoteOK',
    }))
  } catch { return [] }
}

export async function scrapeRemotive(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://remotive.com/api/remote-jobs?limit=100')
    if (!res.ok) return []
    const data = await res.json()
    return (data.jobs || []).map((j: any): JobPosting => ({
      id: `remotive-${j.id}`,
      title: j.title,
      company: j.company_name,
      description: (j.description || '').replace(/<[^>]*>/g, '').trim().slice(0, 1000),
      url: j.url,
      applyUrl: j.url,
      location: j.candidate_required_location || 'Remote',
      category: j.category || 'General',
      tags: j.tags || [],
      salary: j.salary,
      postedAt: j.publication_date || new Date().toISOString(),
      source: 'Remotive',
    }))
  } catch { return [] }
}

export async function scrapeHackerNews(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://hn.algolia.com/api/v1/search?query=Ask+HN%3A+Who+is+hiring&tags=story&hitsPerPage=1')
    if (!res.ok) return []
    const data = await res.json()
    const storyId = data.hits?.[0]?.objectID
    if (!storyId) return []

    const commentsRes = await fetchWithTimeout(`https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=50`)
    if (!commentsRes.ok) return []
    const commentsData = await commentsRes.json()

    return (commentsData.hits || [])
      .filter((c: any) => c.comment_text && c.comment_text.length > 50)
      .slice(0, 40)
      .map((c: any): JobPosting => {
        const text = c.comment_text.replace(/<[^>]*>/g, '')
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
  } catch { return [] }
}

export async function scrapeArbeitnow(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://www.arbeitnow.com/api/job-board-api')
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || [])
      .filter((j: any) => j.title && (j.remote === true || (j.location || '').toLowerCase().includes('remote')))
      .slice(0, 50)
      .map((j: any): JobPosting => ({
        id: `arbeitnow-${j.slug || j.id}`,
        title: j.title,
        company: j.company_name || j.company || 'Unknown',
        description: (j.description || '').replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: j.url || `https://www.arbeitnow.com/jobs/${j.slug}`,
        applyUrl: j.apply_url || j.url,
        location: j.remote ? 'Remote' : (j.location || 'Unknown'),
        category: j.job_types?.[0] || 'General',
        tags: j.tags || [],
        salary: j.salary,
        postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
        source: 'Arbeitnow',
      }))
  } catch { return [] }
}

export async function scrapePythonJobs(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://www.python.org/jobs/feed/rss/', { headers: { 'User-Agent': 'job-scanner/2.0' } })
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 20).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      const parts = title.split(',')
      return {
        id: `python-${idx}`,
        title: parts[0]?.trim() || title,
        company: parts[1]?.trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'Python', tags: ['python'],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'PythonJobs',
      }
    })
  } catch { return [] }
}

// === RSS-based scrapers (20+ sources) ===

export async function scrapeWeWorkRemotely(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://weworkremotely.com/remote-jobs.rss', 'WeWorkRemotely', 'wwr', 50)
}

export async function scrapeWeWorkRemotelyDev(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://weworkremotely.com/categories/remote-programming-jobs.rss', 'WeWorkRemotely-Dev', 'wwr-dev', 30)
}

export async function scrapeWeWorkRemotelyFrontend(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss', 'WeWorkRemotely-Frontend', 'wwr-fe', 30)
}

export async function scrapeWeWorkRemotelyFullStack(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss', 'WeWorkRemotely-FullStack', 'wwr-fs', 30)
}

export async function scrapeWeWorkRemotelyDevOps(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss', 'WeWorkRemotely-DevOps', 'wwr-devops', 20)
}

export async function scrapeEuropeRemote(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://europeremote.com/jobs.rss', 'EuropeRemote', 'er', 30)
}

export async function scrapeJobicy(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://jobicy.com/jobs.rss', 'Jobicy', 'jobicy', 30)
}

export async function scrapeRemoteCo(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://remote.co/remote-jobs/feed/', 'Remote.co', 'remoteco', 30)
}

export async function scrapeDailyRemote(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://dailyremote.com/jobs/feed', 'DailyRemote', 'dailyremote', 30)
}

export async function scrapeJustRemote(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://justremote.co/remote-jobs.rss', 'JustRemote', 'justremote', 30)
}

export async function scrapeRemotePeople(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://remotepeople.io/jobs.rss', 'RemotePeople', 'remotepeople', 30)
}

export async function scrapeCrossover(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://www.crossover.com/jobs.rss', 'Crossover', 'crossover', 30)
}

export async function scrapeLandingJobs(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://landing.jobs/jobs.rss', 'LandingJobs', 'landingjobs', 30)
}

export async function scrapeWellfound(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://wellfound.com/jobs.rss', 'Wellfound', 'wellfound', 30)
}

export async function scrapeOtta(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://otta.com/jobs.rss', 'Otta', 'otta', 30)
}

export async function scrapeUpwork(): Promise<JobPosting[]> {
  // Upwork RSS for web development jobs
  return scrapeRssFeed('https://www.upwork.com/ab/feed/jobs/rss?q=react+developer&sort=recency&paging=0%3B10', 'Upwork', 'upwork', 20)
}

export async function scrapeUpworkNode(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://www.upwork.com/ab/feed/jobs/rss?q=node+developer&sort=recency&paging=0%3B10', 'Upwork-Node', 'upwork-node', 20)
}

export async function scrapeUpworkPython(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://www.upwork.com/ab/feed/jobs/rss?q=python+developer&sort=recency&paging=0%3B10', 'Upwork-Python', 'upwork-python', 20)
}

export async function scrapeUpworkAI(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://www.upwork.com/ab/feed/jobs/rss?q=ai+engineer&sort=recency&paging=0%3B10', 'Upwork-AI', 'upwork-ai', 20)
}

export async function scrapeFreelancer(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://www.freelancer.com/rss.xml', 'Freelancer', 'freelancer', 20)
}

export async function scrapeGuru(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://www.guru.com/d/jobs/rss/', 'Guru', 'guru', 20)
}

export async function scrapeRedditRemoteJobs(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://www.reddit.com/r/remotejobs/new/.rss', 'Reddit-RemoteJobs', 'reddit-rj', 25)
}

export async function scrapeRedditForHire(): Promise<JobPosting[]> {
  return scrapeRssFeed('https://www.reddit.com/r/forhire/new/.rss', 'Reddit-ForHire', 'reddit-fh', 25)
}
