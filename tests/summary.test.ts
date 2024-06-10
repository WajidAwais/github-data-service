import { summarizePullRequestsByMonth } from '../src/summary'
import { pr } from './helpers'

describe('summarizePullRequestsByMonth', () => {
  it('counts openings and closings in their own months, sorted chronologically', () => {
    const summary = summarizePullRequestsByMonth([
      pr(3, '2021-11-02T10:00:00Z'),
      pr(1, '2021-09-05T10:00:00Z', '2021-10-01T09:00:00Z'),
      pr(2, '2021-09-20T10:00:00Z', '2021-09-21T09:00:00Z'),
    ])

    expect(summary).toEqual([
      { period: '2021-09', month: 'September 2021', opened: 2, closed: 1 },
      { period: '2021-10', month: 'October 2021', opened: 0, closed: 1 },
      { period: '2021-11', month: 'November 2021', opened: 1, closed: 0 },
    ])
  })

  it('buckets by UTC month, not the server time zone', () => {
    const summary = summarizePullRequestsByMonth([pr(1, '2021-08-31T23:30:00Z')])
    expect(summary).toEqual([{ period: '2021-08', month: 'August 2021', opened: 1, closed: 0 }])
  })

  it('returns an empty list for no pull requests', () => {
    expect(summarizePullRequestsByMonth([])).toEqual([])
  })
})
