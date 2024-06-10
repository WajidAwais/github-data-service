export class UpstreamError extends Error {
  constructor(readonly status: number, message = `GitHub responded with ${status}`) {
    super(message)
    this.name = 'UpstreamError'
  }
}

export class RateLimitError extends UpstreamError {
  constructor(status: number, readonly retryAfterSeconds: number) {
    super(status, 'GitHub rate limit exceeded')
    this.name = 'RateLimitError'
  }
}
