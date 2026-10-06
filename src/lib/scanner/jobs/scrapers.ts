// Job scrapers — 11 free remote job APIs/RSS feeds
// All return normalized JobPosting objects

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


// Helper: fetch with timeout (prevents hanging on slow/dead feeds)
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchWithTimeout(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

// 1. RemoteOK — free JSON API, no auth
async function scrapeRemoteOK(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://remoteok.com/api?tags=remote', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`RemoteOK: ${res.status}`)
    const data = await res.json()
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
  } catch (err) { console.error('RemoteOK: failed'); return [] }
}

// 2. Remotive — free JSON API, no auth
async function scrapeRemotive(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://remotive.com/api/remote-jobs?limit=100')
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
  } catch (err) { console.error('Remotive: failed'); return [] }
}

// 3. WeWorkRemotely — free RSS feed
async function scrapeWeWorkRemotely(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://weworkremotely.com/remote-jobs.rss', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`WWR: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 50).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      const parts = title.split(':')
      const company = parts[0]?.trim() || 'Unknown'
      const jobTitle = parts.slice(1).join(':').trim() || title
      return {
        id: `wwr-${idx}`,
        title: jobTitle.replace(/\(.*?\)/, '').trim(),
        company,
        description: description.replace(/<[^>]*>/g, '').trim(),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'WeWorkRemotely',
      }
    })
  } catch (err) { console.error('WeWorkRemotely: failed'); return [] }
}

// 4. Hacker News "Who's Hiring" — free Algolia API
async function scrapeHackerNews(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout(
      `https://hn.algolia.com/api/v1/search?query=Ask+HN%3A+Who+is+hiring&tags=story&hitsPerPage=1`
    )
    if (!res.ok) throw new Error(`HN: ${res.status}`)
    const data = await res.json()
    const storyId = data.hits?.[0]?.objectID
    if (!storyId) return []

    const commentsRes = await fetchWithTimeout(
      `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=50`
    )
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
          location: 'Remote', category: 'General', tags: [],
          postedAt: c.created_at, source: 'HackerNews',
        }
      })
  } catch (err) { console.error('HackerNews: failed'); return [] }
}

// 5. Working Nomads — RSS feed
async function scrapeWorkingNomads(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://www.workingnomads.com/jobsfeed', {
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
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'WorkingNomads',
      }
    })
  } catch (err) { console.error('WorkingNomads error:', err); return [] }
}

// 6. Europe Remote — RSS feed
async function scrapeEuropeRemote(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://europeremote.com/jobs.rss', {
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
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote (Europe)', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'EuropeRemote',
      }
    })
  } catch (err) { console.error('EuropeRemote: failed'); return [] }
}

// 7. Himalayas — free JSON API, no auth
async function scrapeHimalayas(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://himalayas.app/api/jobs', {
      headers: { 'User-Agent': 'job-scanner/1.0', 'Accept': 'application/json' },
    })
    if (!res.ok) throw new Error(`Himalayas: ${res.status}`)
    const data = await res.json()
    const jobs = data.jobs || data.data || data || []
    return (Array.isArray(jobs) ? jobs : [])
      .filter((j: any) => j.title || j.position)
      .slice(0, 50)
      .map((j: any, idx: number): JobPosting => ({
        id: `himalayas-${j.id || idx}`,
        title: j.title || j.position,
        company: j.company?.name || j.company_name || j.company || 'Unknown',
        description: (j.description || j.content || '').replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: j.url || j.apply_url || `https://himalayas.app/jobs/${j.id || idx}`,
        applyUrl: j.apply_url || j.url,
        location: j.location || 'Remote',
        category: j.category || j.department || 'General',
        tags: j.tags || j.skills || [],
        salary: j.salary_range || j.salary,
        postedAt: j.created_at || j.posted_at || new Date().toISOString(),
        source: 'Himalayas',
      }))
  } catch (err) { console.error('Himalayas: failed'); return [] }
}

// 8. Arbeitnow — free JSON API, no auth
async function scrapeArbeitnow(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://www.arbeitnow.com/api/job-board-api', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`Arbeitnow: ${res.status}`)
    const data = await res.json()
    return (data.data || [])
      .filter((j: any) => j.title && (j.remote === true || j.location?.toLowerCase().includes('remote')))
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
  } catch (err) { console.error('Arbeitnow: failed'); return [] }
}

// 9. Jobicy — RSS feed
async function scrapeJobicy(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://jobicy.com/jobs.rss', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`Jobicy: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `jobicy-${idx}`,
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'Jobicy',
      }
    })
  } catch (err) { console.error('Jobicy: failed'); return [] }
}

// 10. Jobspresso — RSS feed
async function scrapeJobspresso(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://jobspresso.co/feed/', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`Jobspresso: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `jobspresso-${idx}`,
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'Jobspresso',
      }
    })
  } catch (err) { console.error('Jobspresso error:', err); return [] }
}

// 11. Remote.co — RSS/JSON feed
async function scrapeRemoteCo(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://remote.co/remote-jobs/feed/', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`Remote.co: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `remoteco-${idx}`,
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'Remote.co',
      }
    })
  } catch (err) { console.error('Remote.co: failed'); return [] }
}

// 10. DailyRemote — RSS feed
async function scrapeDailyRemote(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://dailyremote.com/jobs/feed', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`DailyRemote: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `dailyremote-${idx}`,
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'DailyRemote',
      }
    })
  } catch (err) { console.error('DailyRemote: failed'); return [] }
}

// 11. JustRemote — RSS feed
async function scrapeJustRemote(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://justremote.co/remote-jobs.rss', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`JustRemote: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `justremote-${idx}`,
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'JustRemote',
      }
    })
  } catch (err) { console.error('JustRemote: failed'); return [] }
}

// 12. Remote People — RSS feed
async function scrapeRemotePeople(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://remotepeople.io/jobs.rss', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`RemotePeople: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `remotepeople-${idx}`,
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'RemotePeople',
      }
    })
  } catch (err) { console.error('RemotePeople: failed'); return [] }
}

// 13. Crossover — RSS feed
async function scrapeCrossover(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://www.crossover.com/jobs.rss', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`Crossover: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      return {
        id: `crossover-${idx}`,
        title, company: title.split(/[|\-–at:]/)[0].trim() || 'Unknown',
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'General', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'Crossover',
      }
    })
  } catch (err) { console.error('Crossover: failed'); return [] }
}

// 14. WeWorkRemotely (dev category) — separate RSS feed for more dev jobs
async function scrapeWeWorkRemotelyDev(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://weworkremotely.com/categories/remote-programming-jobs.rss', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`WWR-Dev: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 30).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      const parts = title.split(':')
      const company = parts[0]?.trim() || 'Unknown'
      const jobTitle = parts.slice(1).join(':').trim() || title
      return {
        id: `wwr-dev-${idx}`,
        title: jobTitle.replace(/\(.*?\)/, '').trim(),
        company,
        description: description.replace(/<[^>]*>/g, '').trim(),
        url: link, applyUrl: link,
        location: 'Remote', category: 'Programming', tags: [],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'WeWorkRemotely-Dev',
      }
    })
  } catch (err) { console.error('WeWorkRemotely-Dev: failed'); return [] }
}

// 15. Python.org jobs — RSS feed (Python-specific)
async function scrapePythonJobs(): Promise<JobPosting[]> {
  try {
    const res = await fetchWithTimeout('https://www.python.org/jobs/feed/rss/', {
      headers: { 'User-Agent': 'job-scanner/1.0' },
    })
    if (!res.ok) throw new Error(`PythonJobs: ${res.status}`)
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
    return items.slice(0, 20).map((itemXml, idx): JobPosting => {
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      // Python.org titles format: "Job Title, Company Name"
      const parts = title.split(',')
      const jobTitle = parts[0]?.trim() || title
      const company = parts[1]?.trim() || 'Unknown'
      return {
        id: `python-${idx}`,
        title: jobTitle, company,
        description: description.replace(/<[^>]*>/g, '').trim().slice(0, 1000),
        url: link, applyUrl: link,
        location: 'Remote', category: 'Python', tags: ['python'],
        postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'PythonJobs',
      }
    })
  } catch (err) { console.error('PythonJobs: failed'); return [] }
}

// Main scraper — runs all 15 in parallel
export async function scrapeAllJobs(): Promise<JobPosting[]> {
  console.log('Scraping all 15 job boards...')
  const [
    remoteok, remotive, wwr, hn, er,
    himalayas, arbeitnow, jobicy, remoteco,
    dailyremote, justremote, remotepeople, crossover, wwrdev, pythonjobs
  ] = await Promise.all([
    scrapeRemoteOK(),
    scrapeRemotive(),
    scrapeWeWorkRemotely(),
    scrapeHackerNews(),
    scrapeEuropeRemote(),
    scrapeHimalayas(),
    scrapeArbeitnow(),
    scrapeJobicy(),
    scrapeRemoteCo(),
    scrapeDailyRemote(),
    scrapeJustRemote(),
    scrapeRemotePeople(),
    scrapeCrossover(),
    scrapeWeWorkRemotelyDev(),
    scrapePythonJobs(),
  ])

  const all = [...remoteok, ...remotive, ...wwr, ...hn, ...er,
    ...himalayas, ...arbeitnow, ...jobicy, ...remoteco,
    ...dailyremote, ...justremote, ...remotepeople, ...crossover, ...wwrdev, ...pythonjobs]

  console.log(`  RemoteOK: ${remoteok.length} | Remotive: ${remotive.length} | WWR: ${wwr.length} | HN: ${hn.length} | EuropeRemote: ${er.length}`)
  console.log(`  Himalayas: ${himalayas.length} | Arbeitnow: ${arbeitnow.length} | Jobicy: ${jobicy.length} | Remote.co: ${remoteco.length}`)
  console.log(`  DailyRemote: ${dailyremote.length} | JustRemote: ${justremote.length} | RemotePeople: ${remotepeople.length} | Crossover: ${crossover.length}`)
  console.log(`  WWR-Dev: ${wwrdev.length} | PythonJobs: ${pythonjobs.length}`)
  console.log(`✓ Scraped ${all.length} jobs total`)

  const seen = new Set<string>()
  const unique = all.filter((j) => {
    if (seen.has(j.url)) return false
    seen.add(j.url)
    return true
  })
  console.log(`✓ ${unique.length} unique jobs after dedup`)
  return unique
}
