import path from 'path'
import express, { NextFunction, Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import YAML from 'yamljs'
import { createRepoRouter } from './routes'
import { PullRequestSource } from './github/client'
import { RateLimitError, UpstreamError } from './github/errors'

export interface AppOptions {
  apiPrefix: string
  source: PullRequestSource
  logError?: (message: string) => void
}

const swaggerDocument = YAML.load(path.join(__dirname, '..', 'docs', 'api-spec.yaml'))

export function createApp({ apiPrefix, source, logError = console.error }: AppOptions) {
  const app = express()
  app.disable('x-powered-by')

  app.get('/health', (_req, res) => {
    res.send({ status: 'ok' })
  })
  app.use(`${apiPrefix}/repo/stats`, createRepoRouter(source))
  app.use(`${apiPrefix}/api-docs`, swaggerUi.serve, swaggerUi.setup(swaggerDocument))

  app.use((_req, res) => {
    res.status(404).send({ error: 'Not found.' })
  })

  // Responses carry fixed messages only: upstream bodies and request
  // headers (which hold the token) never reach the client or the log.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RateLimitError) {
      logError(`GitHub rate limit hit; retry in ${err.retryAfterSeconds}s`)
      res.set('Retry-After', String(err.retryAfterSeconds))
      return res.status(503).send({ error: 'GitHub rate limit reached, try again later.' })
    }
    if (err instanceof UpstreamError) {
      logError(`GitHub request failed with status ${err.status}`)
      return res.status(502).send({ error: 'Could not fetch data from GitHub.' })
    }
    logError(`Unexpected error: ${err instanceof Error ? err.name : typeof err}`)
    res.status(500).send({ error: 'Internal server error.' })
  })

  return app
}
