import fs from 'fs'
import path from 'path'
import { parse } from 'yaml'

const spec = parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'api-spec.yaml'), 'utf8'))

describe('docs/api-spec.yaml', () => {
  it('documents exactly the routes the app serves', () => {
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/api/v1/repo/stats',
      '/api/v1/repo/stats/summary',
      '/api/v1/repo/stats/year-summary',
      '/health',
    ])
  })

  it('describes the summary fields the API returns', () => {
    expect(spec.components.schemas.Summary.required).toEqual(['period', 'month', 'opened', 'closed'])
  })
})
