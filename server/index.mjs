import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const isDev = process.argv.includes('--dev')
const port = Number(process.env.PORT ?? 8787)
const cacheDurationMs = 10 * 60 * 1000
const worldMapAsset =
  'https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg'

const countryCoordinates = {
  DRC: { code: 'COD', latitude: -2.88, longitude: 23.66 },
  Uganda: { code: 'UGA', latitude: 1.37, longitude: 32.29 },
}

const hotspots = [
  {
    id: 'ituri',
    name: 'Ituri',
    country: 'DRC',
    latitude: 1.62,
    longitude: 29.61,
    detail: 'Confirmed transmission area reported by CDC.',
  },
  {
    id: 'nord-kivu',
    name: 'Nord-Kivu',
    country: 'DRC',
    latitude: 0.1,
    longitude: 29.28,
    detail: 'Confirmed transmission area reported by CDC.',
  },
  {
    id: 'sud-kivu',
    name: 'Sud-Kivu',
    country: 'DRC',
    latitude: -2.51,
    longitude: 28.84,
    detail: 'Confirmed transmission area reported by CDC.',
  },
  {
    id: 'kampala',
    name: 'Kampala',
    country: 'Uganda',
    latitude: 0.3476,
    longitude: 32.5825,
    detail: 'Related cases reported in Uganda according to CDC.',
  },
]

let cachedPayload = null

function stripTags(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumber(value) {
  return Number(value.replace(/,/g, '').trim())
}

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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Ebola Dashboard',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return response.text()
}

function parseCountryMetrics(listHtml) {
  const metricMap = {
    'confirmed cases': 'confirmedCases',
    'confirmed deaths': 'confirmedDeaths',
    'probable case': 'probableCases',
    'probable cases': 'probableCases',
    'probable death': 'probableDeaths',
    'probable deaths': 'probableDeaths',
    'suspected cases*': 'suspectedCases',
    'suspected cases': 'suspectedCases',
    'suspected deaths': 'suspectedDeaths',
  }

  const metrics = {
    confirmedCases: 0,
    confirmedDeaths: 0,
    probableCases: 0,
    probableDeaths: 0,
    suspectedCases: 0,
    suspectedDeaths: 0,
  }

  const itemRegex = /<li>\s*<strong>\s*([\d,]+)\s*<\/strong>\s*([^<]+)<\/li>/gi

  for (const match of listHtml.matchAll(itemRegex)) {
    const count = toNumber(match[1])
    const label = stripTags(match[2]).toLowerCase()
    const key = metricMap[label]

    if (key) {
      metrics[key] = count
    }
  }

  return metrics
}

function parseCdcSummary(html) {
  const reportedAsOfMatch = html.match(
    /As of ([^<]+), the DRC and Uganda Ministries of Health report the following:/i,
  )
  const updatedTimeMatch = html.match(
    /<meta property="og:updated_time" content="([^"]+)"/i,
  )
  const descriptionMatch = html.match(
    /<meta name="description" content="([^"]+)"/i,
  )
  const affectedAreasMatch = html.match(
    /To date, the Ebola disease outbreak in DRC has been confirmed in ([\s\S]{0,220}?)\./i,
  )

  const countryBlocks = [
    {
      name: 'DRC',
      block: html.match(/<p>\s*DRC\s*<\/p>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i)?.[1] ?? '',
    },
    {
      name: 'Uganda',
      block: html.match(/<p>\s*Uganda\s*<\/p>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i)?.[1] ?? '',
    },
  ]

  const countries = countryBlocks
    .filter((entry) => entry.block)
    .map((entry) => ({
      name: entry.name,
      ...countryCoordinates[entry.name],
      metrics: parseCountryMetrics(entry.block),
    }))

  const totals = countries.reduce(
    (accumulator, country) => ({
      confirmedCases: accumulator.confirmedCases + country.metrics.confirmedCases,
      confirmedDeaths: accumulator.confirmedDeaths + country.metrics.confirmedDeaths,
      probableCases: accumulator.probableCases + country.metrics.probableCases,
      probableDeaths: accumulator.probableDeaths + country.metrics.probableDeaths,
      suspectedCases: accumulator.suspectedCases + country.metrics.suspectedCases,
      suspectedDeaths: accumulator.suspectedDeaths + country.metrics.suspectedDeaths,
    }),
    {
      confirmedCases: 0,
      confirmedDeaths: 0,
      probableCases: 0,
      probableDeaths: 0,
      suspectedCases: 0,
      suspectedDeaths: 0,
    },
  )

  return {
    countries,
    description: descriptionMatch?.[1] ?? '',
    updatedTime: updatedTimeMatch?.[1] ?? null,
    reportedAsOf: reportedAsOfMatch?.[1] ?? null,
    affectedAreas: affectedAreasMatch?.[1]?.trim() ?? '',
    totals,
  }
}

function parseWhoOverview(html) {
  const titleMatch = html.match(/<title>\s*([^<]+?)\s*<\/title>/i)
  const overviewMatch = html.match(
    /An Ebola outbreak was confirmed[\s\S]{0,1800}?(?=<\/p>)/i,
  )
  const newsRegex =
    /(\d{1,2}\s+[A-Za-z]+\s+20\d{2})[\s\S]{0,600}?<a href="([^"]+)"[^>]*>\s*([^<]*Ebola[^<]*)\s*<\/a>/gi
  const newsItems = []

  for (const match of html.matchAll(newsRegex)) {
    const url = match[2].startsWith('http')
      ? match[2]
      : `https://www.who.int${match[2]}`

    if (!newsItems.some((item) => item.url === url)) {
      newsItems.push({
        publisher: 'WHO',
        date: match[1],
        title: stripTags(match[3]),
        url,
      })
    }
  }

  return {
    title: stripTags(titleMatch?.[1] ?? 'WHO Ebola Situation'),
    overview: stripTags(overviewMatch?.[0] ?? ''),
    newsItems: newsItems.slice(0, 5),
  }
}

async function buildDashboardPayload() {
  const [cdcHtml, whoHtml] = await Promise.all([
    fetchText('https://www.cdc.gov/ebola/situation-summary/'),
    fetchText('https://www.who.int/emergencies/situations/ebola-outbreak---drc-2026'),
  ])

  const cdc = parseCdcSummary(cdcHtml)
  const who = parseWhoOverview(whoHtml)

  return {
    refreshedAt: new Date().toISOString(),
    reportedAsOf: cdc.reportedAsOf,
    updatedTime: cdc.updatedTime,
    mapAssetUrl: worldMapAsset,
    overview: who.overview,
    description: cdc.description,
    affectedAreas: cdc.affectedAreas,
    totals: {
      ...cdc.totals,
      countriesAffected: cdc.countries.length,
    },
    countries: cdc.countries.map((country) => ({
      ...country,
      totalKnownCases:
        country.metrics.confirmedCases +
        country.metrics.probableCases +
        country.metrics.suspectedCases,
      caseFatalityRatio:
        country.metrics.confirmedCases > 0
          ? Number(
              (
                (country.metrics.confirmedDeaths / country.metrics.confirmedCases) *
                100
              ).toFixed(1),
            )
          : 0,
    })),
    hotspots,
    sources: [
      {
        publisher: 'CDC',
        title: 'Ebola Outbreak: Current Situation',
        url: 'https://www.cdc.gov/ebola/situation-summary/',
        date: cdc.reportedAsOf,
      },
      {
        publisher: 'WHO',
        title: who.title,
        url: 'https://www.who.int/emergencies/situations/ebola-outbreak---drc-2026',
        date: null,
      },
      ...who.newsItems,
    ],
    notes: [
      'Country totals come from the CDC current Ebola situation page.',
      'Regional hotspots are based on affected areas explicitly named by CDC.',
      'WHO context cards summarize the current public-health situation and recent outbreak updates.',
    ],
  }
}

async function getDashboardPayload() {
  const now = Date.now()

  if (cachedPayload && cachedPayload.expiresAt > now) {
    return cachedPayload.data
  }

  try {
    const data = await buildDashboardPayload()
    cachedPayload = {
      data,
      expiresAt: now + cacheDurationMs,
    }
    return data
  } catch (error) {
    if (cachedPayload) {
      return {
        ...cachedPayload.data,
        warning: 'Live refresh failed. Showing the most recent cached outbreak data.',
      }
    }

    throw error
  }
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
