import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createAgentApiDevPlugin } from './server/dev/agentApiDevMiddleware.js'

const AGENT_SERVER_ENV_KEYS = Object.freeze([
  'DEEPSEEK_API_KEY',
  'HIERARCHY_CURSOR_SECRET',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
])

function loadAgentServerEnvironment(mode) {
  const fileEnvironment = loadEnv(mode, process.cwd(), '')

  for (const key of AGENT_SERVER_ENV_KEYS) {
    if (process.env[key] === undefined && typeof fileEnvironment[key] === 'string') {
      process.env[key] = fileEnvironment[key]
    }
  }
}

function agentServerEnvironmentPlugin() {
  return {
    name: 'flowzenit-agent-server-environment',
    apply: 'serve',
    config(_config, { mode }) {
      loadAgentServerEnvironment(mode)
    },
  }
}

// Keep this static so existing client-boundary checks can inspect the prefix.
export default defineConfig({
  envPrefix: 'VITE_',
  plugins: [react(), agentServerEnvironmentPlugin(), createAgentApiDevPlugin()],
})
