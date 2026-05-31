import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDashboardPayload } from './ebola-data.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const isDev = process.argv.includes('--dev')
const port = Number(process.env.PORT ?? 8787)

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  response.end(JSON.stringify(payload))
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ts': 'text/plain; charset=utf-8',
  }

  return contentTypes[ext] ?? 'application/octet-stream'
}

function sendNotFound(response) {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not found')
}

async function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(distDir, safePath)

  if (!filePath.startsWith(distDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    return false
  }

  response.writeHead(200, {
    'Content-Type': getContentType(filePath),
  })
  createReadStream(filePath).pipe(response)
  return true
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    response.end()
    return
  }

  if (requestUrl.pathname === '/api/ebola/summary') {
    try {
      const payload = await getDashboardPayload()
      json(response, 200, payload)
    } catch (error) {
      json(response, 500, {
        error: 'Unable to load live outbreak data right now.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    return
  }

  if (isDev) {
    sendNotFound(response)
    return
  }

  if (await serveStaticFile(requestUrl.pathname, response)) {
    return
  }

  const indexPath = path.join(distDir, 'index.html')

  if (!existsSync(indexPath)) {
    sendNotFound(response)
    return
  }

  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
  })
  createReadStream(indexPath).pipe(response)
})

server.listen(port, () => {
  const mode = isDev ? 'API server' : 'dashboard server'
  console.log(`${mode} running at http://localhost:${port}`)
})
