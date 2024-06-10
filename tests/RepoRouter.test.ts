import request from 'supertest'
import { createApp } from '../src/app'
import { PullRequestSource } from '../src/github/client'
import { RateLimitError, UpstreamError } from '../src/github/errors'
import { pr } from './helpers'

const fixture = [
  pr(1, '2021-09-05T10:00:00Z', '2021-09-20T10:00:00Z'),
  pr(2, '2021-09-28T10:00:00Z', '2021-10-02T10:00:00Z'),
  pr(3, '2022-01-10T10:00:00Z'),
]

const build = (source: PullRequestSource) => {
  const logError = jest.fn()
  return { app: createApp({ apiPrefix: '/api/v1', source, logError }), logError }
}
const staticSource: PullRequestSource = { listPullRequests: async () => fixture }

describe('RepoRouter', () => {
  const { app } = build(staticSource)

  it('summarises all months in order', async () => {
    const res = await request(app).get('/api/v1/repo/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { period: '2021-09', month: 'September 2021', opened: 2, closed: 1 },
      { period: '2021-10', month: 'October 2021', opened: 0, closed: 1 },
      { period: '2022-01', month: 'January 2022', opened: 1, closed: 0 },
    ])
  })

  it.each(['09', '9'])('returns one month for month=%s', async (month) => {
    const res = await request(app).get(`/api/v1/repo/stats/summary?month=${month}&year=2021`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ period: '2021-09', month: 'September 2021', opened: 2, closed: 1 })
  })

  it('returns 404 for a month with no activity', async () => {
    const res = await request(app).get('/api/v1/repo/stats/summary?month=3&year=2021')
    expect(res.status).toBe(404)
  })

  it('requires month and year', async () => {
    const res = await request(app).get('/api/v1/repo/stats/summary')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it.each([
    'month=13&year=2021',
    'month=0&year=2021',
    'month=1e1&year=2021',
    'month=09&year=21',
    'month=09&year=2021abc',
    'month=1&month=2&year=2021',
  ])('rejects invalid summary query %s', async (query) => {
    const res = await request(app).get(`/api/v1/repo/stats/summary?${query}`)
    expect(res.status).toBe(400)
  })

  it('returns the months of one year', async () => {
    const res = await request(app).get('/api/v1/repo/stats/year-summary?year=2021')
    expect(res.status).toBe(200)
    expect(res.body.map((m: { period: string }) => m.period)).toEqual(['2021-09', '2021-10'])
  })

  it('requires a valid year', async () => {
    expect((await request(app).get('/api/v1/repo/stats/year-summary')).status).toBe(400)
    expect((await request(app).get('/api/v1/repo/stats/year-summary?year=..%2F..')).status).toBe(400)
    expect((await request(app).get('/api/v1/repo/stats/year-summary?year=1999')).status).toBe(404)
  })

  it('does not forward arbitrary paths anywhere', async () => {
    const res = await request(app).get('/api/v1/repo/stats/..%2F..%2Fuser')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found.' })
    expect((await request(app).get('/api/v1/repos/torvalds/linux/pulls')).status).toBe(404)
  })

  it('serves the health check and API docs without an x-powered-by header', async () => {
    const health = await request(app).get('/health')
    expect(health.body).toEqual({ status: 'ok' })
    expect(health.headers['x-powered-by']).toBeUndefined()
    expect((await request(app).get('/api/v1/api-docs/')).status).toBe(200)
  })
})

describe('RepoRouter upstream failures', () => {
  it('maps a rate limit to 503 with Retry-After', async () => {
    const { app } = build({ listPullRequests: async () => Promise.reject(new RateLimitError(403, 42)) })
    const res = await request(app).get('/api/v1/repo/stats')
    expect(res.status).toBe(503)
    expect(res.headers['retry-after']).toBe('42')
  })

  it('maps GitHub errors to 502 with a fixed message and no secrets in logs', async () => {
    const secret = 'ghp_secret_should_never_appear'
    const { app, logError } = build({
      listPullRequests: async () => Promise.reject(new UpstreamError(401, `token ${secret}`)),
    })
    const res = await request(app).get('/api/v1/repo/stats')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Could not fetch data from GitHub.' })
    expect(JSON.stringify(logError.mock.calls)).not.toContain(secret)
  })

  it('maps unexpected errors to 500 without details', async () => {
    const { app } = build({ listPullRequests: async () => Promise.reject(new Error('boom /etc/passwd')) })
    const res = await request(app).get('/api/v1/repo/stats/year-summary?year=2021')
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('passwd')
  })
})
