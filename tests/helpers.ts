import { PullRequest } from '../src/types'

export const pr = (id: number, created_at: string, closed_at: string | null = null): PullRequest => ({
  id,
  title: `PR ${id}`,
  created_at,
  updated_at: closed_at ?? created_at,
  closed_at,
  merged_at: null,
})

export const jsonResponse = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
