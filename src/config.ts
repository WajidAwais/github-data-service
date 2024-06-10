export interface Config {
  port: number
  apiPrefix: string
  owner: string
  repo: string
  token?: string
  cacheTtlMs: number
}

// GitHub's own limits: logins are alphanumeric with single hyphens, repo
// names allow dots/underscores. Validating here (not per request) is what
// keeps the service pinned to one repository instead of acting as a proxy.
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/

export class ConfigError extends Error {}

function apiPrefixFrom(version: string | undefined): string {
  const raw = (version ?? 'v1').trim().replace(/^\/?(api\/)?/, '')
  const match = /^v?(\d{1,3})$/.exec(raw)
  if (!match) throw new ConfigError(`API_VERSION must look like "v1", got "${version}"`)
  return `/api/v${match[1]}`
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const owner = env.GITHUB_OWNER || 'downshift-js'
  const repo = env.GITHUB_REPO || 'downshift'
  if (!OWNER_RE.test(owner)) throw new ConfigError('GITHUB_OWNER is not a valid GitHub login')
  if (!REPO_RE.test(repo) || repo === '.' || repo === '..') {
    throw new ConfigError('GITHUB_REPO is not a valid repository name')
  }

  const port = Number(env.PORT || 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('PORT must be 1-65535')

  const ttlSeconds = Number(env.CACHE_TTL_SECONDS ?? 300)
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < 0) throw new ConfigError('CACHE_TTL_SECONDS must be >= 0')

  return {
    port,
    apiPrefix: apiPrefixFrom(env.API_VERSION),
    owner,
    repo,
    token: env.GITHUB_PERSONAL_ACCESS_TOKEN || undefined,
    cacheTtlMs: ttlSeconds * 1000,
  }
}
