import { ConfigError, loadConfig } from '../src/config'

describe('loadConfig', () => {
  it('defaults to downshift-js/downshift under /api/v1', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      apiPrefix: '/api/v1',
      owner: 'downshift-js',
      repo: 'downshift',
      token: undefined,
      cacheTtlMs: 300_000,
    })
  })

  it.each(['v2', '2', '/api/v2'])('accepts API_VERSION=%s', (version) => {
    expect(loadConfig({ API_VERSION: version }).apiPrefix).toBe('/api/v2')
  })

  it.each(['../admin', 'v1/../../x', 'latest'])('rejects API_VERSION=%s', (version) => {
    expect(() => loadConfig({ API_VERSION: version })).toThrow(ConfigError)
  })

  it.each(['evil.com/x', '../etc', 'a b', '-lead', 'x'.repeat(40)])('rejects owner %s', (owner) => {
    expect(() => loadConfig({ GITHUB_OWNER: owner })).toThrow(ConfigError)
  })

  it.each(['..', 'a/b', 'a?b', 'repo#x'])('rejects repo %s', (repo) => {
    expect(() => loadConfig({ GITHUB_REPO: repo })).toThrow(ConfigError)
  })

  it('rejects a non-numeric port', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(ConfigError)
  })
})
