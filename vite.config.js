import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serves api/parse-rule.js on the local dev and preview servers, so the whole app
 * (including plain-English rules) runs with `npm run dev`. On Vercel the same file
 * runs as a serverless function. The key is read here, in Node, and never reaches
 * the browser bundle (only VITE_-prefixed variables are exposed to client code).
 */
function localApi(env) {
  const mount = (server) => {
    server.middlewares.use('/api/parse-rule', async (req, res) => {
      const { createHandler } = await import('./api/parse-rule.js')
      const handler = createHandler({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL || undefined })

      let body = ''
      for await (const chunk of req) body += chunk

      const vercelLikeRes = {
        status(code) {
          res.statusCode = code
          return this
        },
        setHeader(name, value) {
          res.setHeader(name, value)
        },
        json(payload) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
          return this
        },
      }
      await handler({ method: req.method, body }, vercelLikeRes)
    })
  }
  return { name: 'local-api', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), localApi(env)],
  }
})
