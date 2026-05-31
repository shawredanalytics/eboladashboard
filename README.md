# Ebola Live Dashboard

Public-facing Ebola dashboard with:

- a React + Vite web app
- a native Streamlit app for direct hosting from GitHub
- a live outbreak data pipeline that pulls current information from open CDC and WHO sources

## Features

- Live Ebola case summaries from public CDC and WHO pages
- Vector world map with highlighted outbreak countries and hotspot labels
- Country-level burden table and regional spotlight panel
- Netlify-ready deployment using a serverless function for the live data endpoint
- Streamlit Community Cloud-ready app using `streamlit_app.py`

## Streamlit Hosting

This repository is now compatible with Streamlit hosting.

Required files included:

- `streamlit_app.py`
- `streamlit_data.py`
- `requirements.txt`
- `.streamlit/config.toml`

### Streamlit Community Cloud Settings

- Repository: this GitHub repo
- Branch: `main`
- Main file path: `streamlit_app.py`

### Local Streamlit Run

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Run the Streamlit app:

```bash
streamlit run streamlit_app.py
```

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

## Project Modes

- `streamlit_app.py`: use this for Streamlit hosting
- `src/` + `server/`: use this for the React/Vite app

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
