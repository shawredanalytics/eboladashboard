export interface CountryMetrics {
  confirmedCases: number
  confirmedDeaths: number
  probableCases: number
  probableDeaths: number
  suspectedCases: number
  suspectedDeaths: number
}

export interface CountrySummary {
  name: string
  code: string
  latitude: number
  longitude: number
  metrics: CountryMetrics
  totalKnownCases: number
  caseFatalityRatio: number
}

export interface Hotspot {
  id: string
  name: string
  country: string
  latitude: number
  longitude: number
  detail: string
}

export interface SourceItem {
  publisher: string
  title: string
  url: string
  date: string | null
}

export interface DashboardData {
  refreshedAt: string
  reportedAsOf: string | null
  updatedTime: string | null
  mapAssetUrl: string
  overview: string
  description: string
  affectedAreas: string
  totals: {
    confirmedCases: number
    confirmedDeaths: number
    probableCases: number
    probableDeaths: number
    suspectedCases: number
    suspectedDeaths: number
    countriesAffected: number
  }
  countries: CountrySummary[]
  hotspots: Hotspot[]
  sources: SourceItem[]
  notes: string[]
  warning?: string
}
