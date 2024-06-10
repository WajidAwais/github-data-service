import { PullRequest, Summary } from './types'

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// GitHub timestamps are UTC; bucketing in UTC keeps a PR opened at
// 23:30Z on the 31st in the right month regardless of the server's zone.
const periodOf = (timestamp: string | null): string | undefined =>
  timestamp ? timestamp.slice(0, 7) : undefined

export const summarizePullRequestsByMonth = (pullRequests: PullRequest[]): Summary[] => {
  const months = new Map<string, { opened: number; closed: number }>()
  const bucket = (period: string) => {
    let counts = months.get(period)
    if (!counts) {
      counts = { opened: 0, closed: 0 }
      months.set(period, counts)
    }
    return counts
  }

  for (const pullRequest of pullRequests) {
    const created = periodOf(pullRequest.created_at)
    if (created) bucket(created).opened++
    const closed = periodOf(pullRequest.closed_at)
    if (closed) bucket(closed).closed++
  }

  return [...months.keys()].sort().map((period) => ({
    period,
    month: monthLabel.format(new Date(`${period}-01T00:00:00Z`)),
    ...months.get(period)!,
  }))
}
