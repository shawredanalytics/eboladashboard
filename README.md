# Ebola Live Dashboard

Public-facing Ebola dashboard built with React, Vite, and a live outbreak data pipeline that pulls current information from open CDC and WHO sources.

## Features

- Live Ebola case summaries from public CDC and WHO pages
- Vector world map with highlighted outbreak countries and hotspot labels
- Country-level burden table and regional spotlight panel
- Netlify-ready deployment using a serverless function for the live data endpoint

## Local Development

Install dependencies:

```bash
npm install
```

Start the dashboard locally:

```bash
npm run dev
```

This runs:

- Vite frontend on its default local port
- Local API server on `http://localhost:8787`

Build for production:

```bash
npm run build
```

Serve the production build locally:

```bash
npm start
```

## Netlify Deployment

This repository includes:

- `netlify.toml`
- `netlify/functions/ebola-summary.mjs`

Netlify settings:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

The app keeps using `/api/ebola/summary`. On Netlify, that route is redirected to the serverless function automatically.

## Data Sources

- [CDC Ebola Outbreak: Current Situation](https://www.cdc.gov/ebola/situation-summary/)
- [WHO Ebola outbreak - DRC 2026](https://www.who.int/emergencies/situations/ebola-outbreak---drc-2026)
