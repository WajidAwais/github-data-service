import { PullRequest } from '../types'
import { RateLimitError, UpstreamError } from './errors'

const API_ORIGIN = 'https://api.github.com'
const PER_PAGE = 100
const PAGE_CONCURRENCY = 5

export interface PullRequestSource {
  listPullRequests(): Promise<PullRequest[]>
}

export interface GitHubClientOptions {
  owner: string
  repo: string
  token?: string
  cacheTtlMs?: number
  fetch?: typeof fetch
  now?: () => number
}

export class GitHubClient implements PullRequestSource {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private cached?: { at: number; data: PullRequest[] }
  private inFlight?: Promise<PullRequest[]>

  constructor(private readonly options: GitHubClientOptions) {
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? Date.now
  }

  // Every endpoint needs the full list, so one cached copy (and one shared
  // in-flight request) stops each API call from costing 15+ GitHub requests.
  async listPullRequests(): Promise<PullRequest[]> {
    const ttl = this.options.cacheTtlMs ?? 0
    if (this.cached && this.now() - this.cached.at < ttl) return this.cached.data
    if (!this.inFlight) {
      this.inFlight = this.fetchAllPages()
        .then((data) => {
          this.cached = { at: this.now(), data }
          return data
        })
        .finally(() => {
          this.inFlight = undefined
        })
    }
    return this.inFlight
  }

  private async fetchAllPages(): Promise<PullRequest[]> {
    const first = await this.fetchPage(1)
    const pages: PullRequest[][] = [first.items]

    // Only the page number is taken from the Link header; the URL itself is
    // never followed, so a response can't redirect us to another host.
    const remaining: number[] = []
    for (let page = 2; page <= first.lastPage; page++) remaining.push(page)

    while (remaining.length > 0) {
      const batch = remaining.splice(0, PAGE_CONCURRENCY)
      const results = await Promise.all(batch.map((page) => this.fetchPage(page)))
      pages.push(...results.map((r) => r.items))
    }
    return pages.flat()
  }

  private async fetchPage(page: number): Promise<{ items: PullRequest[]; lastPage: number }> {
    const { owner, repo, token } = this.options
    const url = new URL(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, API_ORIGIN)
    url.search = new URLSearchParams({ state: 'all', per_page: String(PER_PAGE), page: String(page) }).toString()

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'recurate',
    }
    if (token) headers.Authorization = `Bearer ${token}`

    let response: Response
    try {
      response = await this.fetchImpl(url, { headers, redirect: 'error' })
    } catch {
      // Network-level failure (DNS, TLS, refused redirect). The cause can
      // include request details, so it is deliberately not propagated.
      throw new UpstreamError(0, 'Could not reach GitHub')
    }
    if (!response.ok) throw this.errorFor(response)

    const items: unknown = await response.json()
    if (!Array.isArray(items)) throw new UpstreamError(response.status, 'Unexpected response shape from GitHub')
    return { items: items as PullRequest[], lastPage: lastPageFrom(response.headers.get('link'), page) }
  }

  private errorFor(response: Response): UpstreamError {
    const { status, headers } = response
    const remaining = headers.get('x-ratelimit-remaining')
    const retryAfter = headers.get('retry-after')
    if (status === 429 || (status === 403 && (remaining === '0' || retryAfter))) {
      let wait = Number(retryAfter)
      if (!Number.isFinite(wait) || wait <= 0) {
        const reset = Number(headers.get('x-ratelimit-reset'))
        wait = Number.isFinite(reset) ? Math.ceil(reset - this.now() / 1000) : 60
      }
      return new RateLimitError(status, Math.max(1, wait))
    }
    return new UpstreamError(status)
  }
}

export function lastPageFrom(link: string | null, current: number): number {
  if (!link) return current
  const last = link.split(',').find((part) => /rel="last"/.test(part))
  const match = last && /[?&]page=(\d+)/.exec(last)
  if (!match) return current
  // Cap absurd values so a malformed header can't fan out thousands of requests.
  return Math.min(Number(match[1]), 1000)
}
