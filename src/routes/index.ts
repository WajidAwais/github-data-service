import express, { NextFunction, Request, RequestHandler, Response } from 'express'
import { summarizePullRequestsByMonth } from '../summary'
import { PullRequestSource } from '../github/client'

const MONTH_RE = /^(0?[1-9]|1[0-2])$/
const YEAR_RE = /^\d{4}$/

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next)
  }

// Repeated query keys arrive as arrays; only a single string is valid input.
const single = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

export function createRepoRouter(source: PullRequestSource) {
  const router = express.Router()

  router.get(
    '/',
    asyncRoute(async (_req, res) => {
      res.send(summarizePullRequestsByMonth(await source.listPullRequests()))
    }),
  )

  router.get(
    '/summary',
    asyncRoute(async (req, res) => {
      const month = single(req.query.month)
      const year = single(req.query.year)
      if (!month || !year) {
        return res.status(400).send({ error: 'Both month and year query parameters are required.' })
      }
      if (!MONTH_RE.test(month) || !YEAR_RE.test(year)) {
        return res.status(400).send({ error: 'month must be 1-12 and year a four-digit year.' })
      }

      const period = `${year}-${month.padStart(2, '0')}`
      const summary = summarizePullRequestsByMonth(await source.listPullRequests())
      const monthSummary = summary.find((item) => item.period === period)
      if (!monthSummary) return res.status(404).send({ error: 'No data found for the given month and year.' })
      res.send(monthSummary)
    }),
  )

  router.get(
    '/year-summary',
    asyncRoute(async (req, res) => {
      const year = single(req.query.year)
      if (!year) return res.status(400).send({ error: 'The year query parameter is required.' })
      if (!YEAR_RE.test(year)) return res.status(400).send({ error: 'year must be a four-digit year.' })

      const summary = summarizePullRequestsByMonth(await source.listPullRequests())
      const yearSummary = summary.filter((item) => item.period.startsWith(`${year}-`))
      if (yearSummary.length === 0) return res.status(404).send({ error: 'No data found for the given year.' })
      res.send(yearSummary)
    }),
  )

  return router
}
