import 'dotenv/config'
import { createApp } from './app'
import { loadConfig } from './config'
import { GitHubClient } from './github/client'

const config = loadConfig()
if (!config.token) {
  console.warn('GITHUB_PERSONAL_ACCESS_TOKEN is not set; GitHub allows 60 unauthenticated requests per hour.')
}

const source = new GitHubClient(config)
const app = createApp({ apiPrefix: config.apiPrefix, source })

app.listen(config.port, () => {
  console.log(`Serving ${config.owner}/${config.repo} stats on port ${config.port} under ${config.apiPrefix}`)
})
