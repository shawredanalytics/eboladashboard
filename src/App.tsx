import { useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'
import './App.css'
import type { CountrySummary, DashboardData, Hotspot } from './types'

const numberFormat = new Intl.NumberFormat('en-US')
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const worldMapDimensions = {
  width: 960,
  height: 520,
}
const countryIdByCode: Record<string, number> = {
  COD: 180,
  UGA: 800,
}
const atlasData = worldAtlas as unknown as { objects: { countries: unknown } }
const atlasCollection = feature(
  atlasData as never,
  atlasData.objects.countries as never,
) as unknown as {
  features: Array<{
    id: string | number
    properties: Record<string, unknown>
  }>
}

function formatNumber(value: number) {
  return numberFormat.format(value)
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Unavailable'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormat.format(date)
}

function markerSize(country: CountrySummary) {
  const baseline = Math.sqrt(Math.max(country.totalKnownCases, 1))
  return Math.min(70, Math.max(18, baseline * 3.1))
}

function severityLabel(country: CountrySummary) {
  if (country.totalKnownCases >= 400) {
    return 'Very high burden'
  }

  if (country.totalKnownCases >= 100) {
    return 'High burden'
  }

  return 'Active outbreak'
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'alert'
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
    </article>
  )
}

function WorldMap({
  countries,
  hotspots,
  selectedCountryCode,
  onSelectCountry,
}: {
  countries: CountrySummary[]
  hotspots: Hotspot[]
  selectedCountryCode: string
  onSelectCountry: (countryCode: string) => void
}) {
  const countryByCode = useMemo(
    () => Object.fromEntries(countries.map((country) => [country.code, country])),
    [countries],
  )

  const maxCases = useMemo(
    () => Math.max(...countries.map((country) => country.totalKnownCases), 1),
    [countries],
  )

  const projection = useMemo(
    () =>
      geoMercator().fitSize(
        [worldMapDimensions.width, worldMapDimensions.height],
        atlasCollection as never,
      ),
    [],
  )

  const pathGenerator = useMemo(() => geoPath(projection), [projection])
  const selectedCountry =
    countries.find((country) => country.code === selectedCountryCode) ?? countries[0]
  const hotspotsForSelection = hotspots.filter(
    (hotspot) => hotspot.country === selectedCountry?.name,
  )

  function countryFill(countryCode: string) {
    const country = countryByCode[countryCode]

    if (!country) {
      return '#dbe4ef'
    }

    const intensity = country.totalKnownCases / maxCases
    const alpha = 0.32 + intensity * 0.58
    return `rgba(220, 38, 38, ${alpha.toFixed(2)})`
  }

  return (
    <div className="map-shell">
      <div className="map-stage">
        <div className="map-canvas">
          <div className="map-overlay map-overlay--glow" />
          <div className="map-overlay map-overlay--grid" />

          <svg
            className="map-svg"
            viewBox={`0 0 ${worldMapDimensions.width} ${worldMapDimensions.height}`}
            role="img"
            aria-label="Vector world map with affected countries highlighted and hotspot markers"
          >
            <g className="map-country-layer">
              {atlasCollection.features.map((featureItem) => {
                const featureId = Number(featureItem.id)
                const country = countries.find(
                  (entry) => countryIdByCode[entry.code] === featureId,
                )
                const featurePath = pathGenerator(featureItem as never)

                if (!featurePath) {
                  return null
                }

                return (
                  <path
                    key={String(featureItem.id)}
                    d={featurePath}
                    className={`map-country${
                      country ? ' map-country--active' : ''
                    }${country?.code === selectedCountryCode ? ' map-country--selected' : ''}`}
                    fill={country ? countryFill(country.code) : undefined}
                    tabIndex={country ? 0 : -1}
                    role={country ? 'button' : 'presentation'}
                    aria-label={
                      country
                        ? `${country.name}: ${formatNumber(country.totalKnownCases)} known cases`
                        : undefined
                    }
                    onClick={() => {
                      if (country) {
                        onSelectCountry(country.code)
                      }
                    }}
                    onMouseEnter={() => {
                      if (country) {
                        onSelectCountry(country.code)
                      }
                    }}
                    onFocus={() => {
                      if (country) {
                        onSelectCountry(country.code)
                      }
                    }}
                  />
                )
              })}
            </g>

            {countries.map((country) => {
              const projectedPoint = projection([country.longitude, country.latitude])

              if (!projectedPoint) {
                return null
              }

              const [x, y] = projectedPoint
              const size = markerSize(country)
              const isSelected = country.code === selectedCountryCode

              return (
                <g
                  key={country.code}
                  className={`map-bubble${isSelected ? ' map-bubble--selected' : ''}`}
                  transform={`translate(${x} ${y})`}
                >
                  <circle
                    r={size * 0.65}
                    className="map-bubble__halo"
                    onMouseEnter={() => onSelectCountry(country.code)}
                  />
                  <circle
                    r={size * 0.38}
                    className="map-bubble__core"
                    onMouseEnter={() => onSelectCountry(country.code)}
                  />
                  <text y={4} textAnchor="middle" className="map-bubble__label">
                    {country.code}
                  </text>
                </g>
              )
            })}

            {hotspots.map((hotspot) => {
              const projectedPoint = projection([hotspot.longitude, hotspot.latitude])

              if (!projectedPoint) {
                return null
              }

              const [x, y] = projectedPoint

              return (
                <g key={hotspot.id} transform={`translate(${x} ${y})`} className="hotspot-group">
                  <circle className="hotspot-ring" r={14} />
                  <circle className="hotspot-core" r={5.5} />
                  <text x={18} y={5} className="hotspot-label">
                    {hotspot.name}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <aside className="map-focus-panel">
          <div className="map-focus-panel__header">
            <p className="panel__eyebrow">Regional spotlight</p>
            <h3>{selectedCountry?.name ?? 'No country selected'}</h3>
            <p>
              {selectedCountry
                ? `${severityLabel(selectedCountry)} with ${formatNumber(
                    selectedCountry.totalKnownCases,
                  )} total reported and suspected cases.`
                : 'Select a highlighted country to inspect case concentration.'}
            </p>
          </div>

          {selectedCountry ? (
            <div className="focus-stats">
              <div className="focus-stat">
                <span>Confirmed</span>
                <strong>{formatNumber(selectedCountry.metrics.confirmedCases)}</strong>
              </div>
              <div className="focus-stat">
                <span>Deaths</span>
                <strong>{formatNumber(selectedCountry.metrics.confirmedDeaths)}</strong>
              </div>
              <div className="focus-stat">
                <span>CFR</span>
                <strong>{selectedCountry.caseFatalityRatio}%</strong>
              </div>
            </div>
          ) : null}

          <div className="focus-country-list">
            {countries.map((country) => (
              <button
                key={country.code}
                type="button"
                className={`focus-country${
                  country.code === selectedCountryCode ? ' focus-country--active' : ''
                }`}
                onClick={() => onSelectCountry(country.code)}
              >
                <div className="focus-country__row">
                  <strong>{country.name}</strong>
                  <span>{formatNumber(country.totalKnownCases)}</span>
                </div>
                <div className="focus-country__bar">
                  <span
                    style={{
                      width: `${Math.max((country.totalKnownCases / maxCases) * 100, 12)}%`,
                    }}
                  />
                </div>
                <div className="focus-country__meta">
                  <span>{severityLabel(country)}</span>
                  <span>{formatNumber(country.metrics.confirmedDeaths)} deaths</span>
                </div>
              </button>
            ))}
          </div>

          <div className="hotspot-list">
            {hotspotsForSelection.map((hotspot) => (
              <div key={hotspot.id} className="hotspot-pill">
                <span className="hotspot-pill__dot" />
                <div>
                  <strong>{hotspot.name}</strong>
                  <p>{hotspot.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="map-legend">
        <div>
          <span className="legend-dot legend-dot--country" />
          Highlighted outbreak countries
        </div>
        <div>
          <span className="legend-dot legend-dot--hotspot" />
          Reported transmission hotspot
        </div>
        <div>
          <span className="legend-dot legend-dot--bubble" />
          Scaled case-intensity bubble
        </div>
      </div>
    </div>
  )
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCountryCode, setSelectedCountryCode] = useState('COD')

  async function loadDashboard(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetch('/api/ebola/summary')

      if (!response.ok) {
        throw new Error('The dashboard data service returned an error.')
      }

      const payload = (await response.json()) as DashboardData
      setData(payload)
      if (payload.countries.length > 0) {
        setSelectedCountryCode((current) =>
          payload.countries.some((country) => country.code === current)
            ? current
            : payload.countries[0].code,
        )
      }
      setError(null)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load the Ebola dashboard right now.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const sortedCountries = useMemo(
    () =>
      [...(data?.countries ?? [])].sort(
        (first, second) => second.totalKnownCases - first.totalKnownCases,
      ),
    [data?.countries],
  )

  if (loading && !data) {
    return (
      <main className="app-shell loading-state">
        <h1>Ebola Live Dashboard</h1>
        <p>Loading live outbreak information from CDC and WHO...</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Global public outbreak tracking</p>
          <h1>Ebola Live Dashboard</h1>
          <p className="hero-copy">
            A public-facing dashboard that combines live CDC case totals with WHO
            situation context and maps outbreak burden across affected geographies.
          </p>
        </div>

        <div className="hero-meta">
          <div>
            <span>Reported as of</span>
            <strong>{data?.reportedAsOf ?? 'Unavailable'}</strong>
          </div>
          <div>
            <span>Last source update</span>
            <strong>{formatDate(data?.updatedTime ?? data?.refreshedAt ?? null)}</strong>
          </div>
          <button
            type="button"
            className="refresh-button"
            onClick={() => void loadDashboard(true)}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>
      </section>

      {data?.warning ? <p className="banner banner--warning">{data.warning}</p> : null}
      {error ? <p className="banner banner--error">{error}</p> : null}

      <section className="metrics-grid" aria-label="Key outbreak metrics">
        <MetricCard
          label="Confirmed cases"
          value={formatNumber(data?.totals.confirmedCases ?? 0)}
          tone="alert"
        />
        <MetricCard
          label="Confirmed deaths"
          value={formatNumber(data?.totals.confirmedDeaths ?? 0)}
          tone="alert"
        />
        <MetricCard
          label="Suspected cases"
          value={formatNumber(data?.totals.suspectedCases ?? 0)}
        />
        <MetricCard
          label="Probable cases"
          value={formatNumber(data?.totals.probableCases ?? 0)}
        />
        <MetricCard
          label="Countries affected"
          value={formatNumber(data?.totals.countriesAffected ?? 0)}
        />
      </section>

      <section className="content-grid">
        <article className="panel panel--map">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Geographic spread</p>
              <h2>World case map</h2>
            </div>
            <p className="panel__note">
              Countries are filled by outbreak burden, while hotspot markers call out
              named transmission areas within the active region.
            </p>
          </div>
          <WorldMap
            countries={sortedCountries}
            hotspots={data?.hotspots ?? []}
            selectedCountryCode={selectedCountryCode}
            onSelectCountry={setSelectedCountryCode}
          />
        </article>

        <article className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Situation summary</p>
              <h2>What the sources say</h2>
            </div>
          </div>
          <p className="body-copy">{data?.overview}</p>
          <p className="body-copy body-copy--muted">{data?.description}</p>
          <div className="chip-row">
            <span className="chip">Affected areas: {data?.affectedAreas ?? 'Unavailable'}</span>
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--secondary">
        <article className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Country detail</p>
              <h2>Current burden by country</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Total known cases</th>
                  <th>Confirmed cases</th>
                  <th>Confirmed deaths</th>
                  <th>CFR</th>
                </tr>
              </thead>
              <tbody>
                {sortedCountries.map((country) => (
                  <tr key={country.code}>
                    <td>{country.name}</td>
                    <td>{formatNumber(country.totalKnownCases)}</td>
                    <td>{formatNumber(country.metrics.confirmedCases)}</td>
                    <td>{formatNumber(country.metrics.confirmedDeaths)}</td>
                    <td>{country.caseFatalityRatio}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Hotspots</p>
              <h2>Named transmission areas</h2>
            </div>
          </div>
          <div className="stack-list">
            {data?.hotspots.map((hotspot) => (
              <div key={hotspot.id} className="list-card">
                <div>
                  <strong>
                    {hotspot.name}, {hotspot.country}
                  </strong>
                  <p>{hotspot.detail}</p>
                </div>
                <span className="list-tag">
                  {hotspot.latitude.toFixed(2)}, {hotspot.longitude.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--secondary">
        <article className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Open sources</p>
              <h2>Live references</h2>
            </div>
          </div>
          <div className="stack-list">
            {data?.sources.map((source) => (
              <a
                key={`${source.publisher}-${source.url}`}
                className="list-card list-card--link"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                <div>
                  <strong>{source.title}</strong>
                  <p>{source.publisher}</p>
                </div>
                <span className="list-tag">{source.date ?? 'Live source'}</span>
              </a>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Method</p>
              <h2>How this dashboard is built</h2>
            </div>
          </div>
          <ul className="notes-list">
            {data?.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  )
}

export default App
