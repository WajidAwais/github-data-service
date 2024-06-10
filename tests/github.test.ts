import { GitHubClient, lastPageFrom } from '../src/github/client'
import { RateLimitError, UpstreamError } from '../src/github/errors'
import { jsonResponse, pr } from './helpers'

const TOKEN = 'test-token-not-real'

const linkFor = (last: number) =>
  `<https://api.github.com/repositories/1/pulls?page=2>; rel="next", <https://evil.example/pulls?page=${last}>; rel="last"`

describe('GitHubClient', () => {
  it('fetches every page from api.github.com only, with the token in a header', async () => {
    const fetchMock = jest.fn(async (input: string | URL | Request) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      return jsonResponse([pr(page, '2021-09-01T00:00:00Z')], { headers: page === 1 ? { link: linkFor(3) } : {} })
    })
    const client = new GitHubClient({ owner: 'downshift-js', repo: 'downshift', token: TOKEN, fetch: fetchMock as typeof fetch })

    const prs = await client.listPullRequests()

    expect(prs.map((p) => p.id)).toEqual([1, 2, 3])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const [input, init] of fetchMock.mock.calls as unknown as [URL, RequestInit][]) {
      const url = new URL(String(input))
      expect(url.origin).toBe('https://api.github.com')
      expect(url.pathname).toBe('/repos/downshift-js/downshift/pulls')
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
      expect(init.redirect).toBe('error')
    }
  })

  it('omits the Authorization header when no token is configured', async () => {
    const fetchMock = jest.fn(async () => jsonResponse([]))
    await new GitHubClient({ owner: 'o', repo: 'r', fetch: fetchMock as typeof fetch }).listPullRequests()
    const init = (fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1]
    expect(init.headers).not.toHaveProperty('Authorization')
  })

  it('serves repeat calls from cache within the TTL and refetches after it', async () => {
    let now = 0
    const fetchMock = jest.fn(async () => jsonResponse([pr(1, '2021-09-01T00:00:00Z')]))
    const client = new GitHubClient({ owner: 'o', repo: 'r', cacheTtlMs: 1000, fetch: fetchMock as typeof fetch, now: () => now })

    await Promise.all([client.listPullRequests(), client.listPullRequests()])
    now = 999
    await client.listPullRequests()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    now = 1000
    await client.listPullRequests()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('turns an exhausted quota into a RateLimitError with the reset delay', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ message: 'API rate limit exceeded' }, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1090' },
      }),
    )
    const client = new GitHubClient({ owner: 'o', repo: 'r', fetch: fetchMock as typeof fetch, now: () => 1_000_000 })

    const error = await client.listPullRequests().catch((e) => e)
    expect(error).toBeInstanceOf(RateLimitError)
    expect(error.retryAfterSeconds).toBe(90)
  })

  it('honours Retry-After on secondary rate limits', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({}, { status: 429, headers: { 'retry-after': '30' } }))
    const error = await new GitHubClient({ owner: 'o', repo: 'r', fetch: fetchMock as typeof fetch }).listPullRequests().catch((e) => e)
    expect(error).toBeInstanceOf(RateLimitError)
    expect(error.retryAfterSeconds).toBe(30)
  })

  it('reports other failures without the token or upstream body', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ message: `Bad credentials ${TOKEN}` }, { status: 401 }))
    const error = await new GitHubClient({ owner: 'o', repo: 'r', token: TOKEN, fetch: fetchMock as typeof fetch })
      .listPullRequests()
      .catch((e) => e)
    expect(error).toBeInstanceOf(UpstreamError)
    expect(error.status).toBe(401)
    expect(JSON.stringify(error) + error.message + error.stack).not.toContain(TOKEN)
  })

  it('wraps network failures without leaking their cause', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError(`fetch failed for Bearer ${TOKEN}`)
    })
    const error = await new GitHubClient({ owner: 'o', repo: 'r', token: TOKEN, fetch: fetchMock as typeof fetch })
      .listPullRequests()
      .catch((e) => e)
    expect(error).toBeInstanceOf(UpstreamError)
    expect(error.message).toBe('Could not reach GitHub')
    expect(error.cause).toBeUndefined()
  })

  it('rejects a non-array body', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ message: 'Not Found' }))
    await expect(new GitHubClient({ owner: 'o', repo: 'r', fetch: fetchMock as typeof fetch }).listPullRequests()).rejects.toThrow(
      'Unexpected response shape',
    )
  })
})

describe('lastPageFrom', () => {
  it('reads the last page number and caps it', () => {
    expect(lastPageFrom(linkFor(17), 1)).toBe(17)
    expect(lastPageFrom(linkFor(999999), 1)).toBe(1000)
    expect(lastPageFrom(null, 1)).toBe(1)
    expect(lastPageFrom('<https://api.github.com/x?page=1>; rel="prev"', 4)).toBe(4)
  })
})
