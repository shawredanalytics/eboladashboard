from __future__ import annotations

from html import unescape
import re
import time
from typing import Any

import requests


CACHE_DURATION_SECONDS = 10 * 60

COUNTRY_COORDINATES = {
    "DRC": {"code": "COD", "latitude": -2.88, "longitude": 23.66},
    "Uganda": {"code": "UGA", "latitude": 1.37, "longitude": 32.29},
}

HOTSPOTS = [
    {
        "id": "ituri",
        "name": "Ituri",
        "country": "DRC",
        "latitude": 1.62,
        "longitude": 29.61,
        "detail": "Confirmed transmission area reported by CDC.",
    },
    {
        "id": "nord-kivu",
        "name": "Nord-Kivu",
        "country": "DRC",
        "latitude": 0.1,
        "longitude": 29.28,
        "detail": "Confirmed transmission area reported by CDC.",
    },
    {
        "id": "sud-kivu",
        "name": "Sud-Kivu",
        "country": "DRC",
        "latitude": -2.51,
        "longitude": 28.84,
        "detail": "Confirmed transmission area reported by CDC.",
    },
    {
        "id": "kampala",
        "name": "Kampala",
        "country": "Uganda",
        "latitude": 0.3476,
        "longitude": 32.5825,
        "detail": "Related cases reported in Uganda according to CDC.",
    },
]

_cached_payload: dict[str, Any] | None = None
_cached_until = 0.0


def strip_tags(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def to_number(value: str) -> int:
    return int(value.replace(",", "").strip())


def fetch_text(url: str) -> str:
    response = requests.get(
        url,
        timeout=30,
        headers={
            "User-Agent": "Mozilla/5.0 Ebola Dashboard Streamlit",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    response.raise_for_status()
    return response.text


def parse_country_metrics(list_html: str) -> dict[str, int]:
    metric_map = {
        "confirmed cases": "confirmedCases",
        "confirmed deaths": "confirmedDeaths",
        "probable case": "probableCases",
        "probable cases": "probableCases",
        "probable death": "probableDeaths",
        "probable deaths": "probableDeaths",
        "suspected cases*": "suspectedCases",
        "suspected cases": "suspectedCases",
        "suspected deaths": "suspectedDeaths",
    }

    metrics = {
        "confirmedCases": 0,
        "confirmedDeaths": 0,
        "probableCases": 0,
        "probableDeaths": 0,
        "suspectedCases": 0,
        "suspectedDeaths": 0,
    }

    for count, label in re.findall(
        r"<li>\s*<strong>\s*([\d,]+)\s*</strong>\s*([^<]+)</li>", list_html, re.I
    ):
        key = metric_map.get(strip_tags(label).lower())
        if key:
            metrics[key] = to_number(count)

    return metrics


def parse_cdc_summary(html: str) -> dict[str, Any]:
    reported_as_of_match = re.search(
        r"As of ([^<]+), the DRC and Uganda Ministries of Health report the following:",
        html,
        re.I,
    )
    updated_time_match = re.search(
        r'<meta property="og:updated_time" content="([^"]+)"', html, re.I
    )
    description_match = re.search(
        r'<meta name="description" content="([^"]+)"', html, re.I
    )
    affected_areas_match = re.search(
        r"To date, the Ebola disease outbreak in DRC has been confirmed in ([\s\S]{0,220}?)\.",
        html,
        re.I,
    )

    country_blocks = [
        {
            "name": "DRC",
            "block": re.search(
                r"<p>\s*DRC\s*</p>[\s\S]*?<ul>([\s\S]*?)</ul>", html, re.I
            ),
        },
        {
            "name": "Uganda",
            "block": re.search(
                r"<p>\s*Uganda\s*</p>[\s\S]*?<ul>([\s\S]*?)</ul>", html, re.I
            ),
        },
    ]

    countries = []
    for item in country_blocks:
        if not item["block"]:
            continue

        countries.append(
            {
                "name": item["name"],
                **COUNTRY_COORDINATES[item["name"]],
                "metrics": parse_country_metrics(item["block"].group(1)),
            }
        )

    totals = {
        "confirmedCases": sum(country["metrics"]["confirmedCases"] for country in countries),
        "confirmedDeaths": sum(country["metrics"]["confirmedDeaths"] for country in countries),
        "probableCases": sum(country["metrics"]["probableCases"] for country in countries),
        "probableDeaths": sum(country["metrics"]["probableDeaths"] for country in countries),
        "suspectedCases": sum(country["metrics"]["suspectedCases"] for country in countries),
        "suspectedDeaths": sum(country["metrics"]["suspectedDeaths"] for country in countries),
    }

    return {
        "countries": countries,
        "description": description_match.group(1) if description_match else "",
        "updatedTime": updated_time_match.group(1) if updated_time_match else None,
        "reportedAsOf": reported_as_of_match.group(1) if reported_as_of_match else None,
        "affectedAreas": affected_areas_match.group(1).strip() if affected_areas_match else "",
        "totals": totals,
    }


def parse_who_overview(html: str) -> dict[str, Any]:
    title_match = re.search(r"<title>\s*([^<]+?)\s*</title>", html, re.I)
    overview_match = re.search(
        r"An Ebola outbreak was confirmed[\s\S]{0,1800}?(?=</p>)", html, re.I
    )
    news_matches = re.findall(
        r'(\d{1,2}\s+[A-Za-z]+\s+20\d{2})[\s\S]{0,600}?<a href="([^"]+)"[^>]*>\s*([^<]*Ebola[^<]*)\s*</a>',
        html,
        re.I,
    )

    news_items: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for date, href, title in news_matches:
        url = href if href.startswith("http") else f"https://www.who.int{href}"
        if url in seen_urls:
            continue
        seen_urls.add(url)
        news_items.append(
            {
                "publisher": "WHO",
                "date": date,
                "title": strip_tags(title),
                "url": url,
            }
        )

    return {
        "title": strip_tags(title_match.group(1) if title_match else "WHO Ebola Situation"),
        "overview": strip_tags(overview_match.group(0) if overview_match else ""),
        "newsItems": news_items[:5],
    }


def build_dashboard_payload() -> dict[str, Any]:
    cdc_html = fetch_text("https://www.cdc.gov/ebola/situation-summary/")
    who_html = fetch_text("https://www.who.int/emergencies/situations/ebola-outbreak---drc-2026")

    cdc = parse_cdc_summary(cdc_html)
    who = parse_who_overview(who_html)

    countries: list[dict[str, Any]] = []
    for country in cdc["countries"]:
        total_known_cases = (
            country["metrics"]["confirmedCases"]
            + country["metrics"]["probableCases"]
            + country["metrics"]["suspectedCases"]
        )
        confirmed_cases = country["metrics"]["confirmedCases"]
        case_fatality_ratio = (
            round((country["metrics"]["confirmedDeaths"] / confirmed_cases) * 100, 1)
            if confirmed_cases
            else 0
        )
        countries.append(
            {
                **country,
                "totalKnownCases": total_known_cases,
                "caseFatalityRatio": case_fatality_ratio,
            }
        )

    return {
        "refreshedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "reportedAsOf": cdc["reportedAsOf"],
        "updatedTime": cdc["updatedTime"],
        "overview": who["overview"],
        "description": cdc["description"],
        "affectedAreas": cdc["affectedAreas"],
        "totals": {
            **cdc["totals"],
            "countriesAffected": len(cdc["countries"]),
        },
        "countries": countries,
        "hotspots": HOTSPOTS,
        "sources": [
            {
                "publisher": "CDC",
                "title": "Ebola Outbreak: Current Situation",
                "url": "https://www.cdc.gov/ebola/situation-summary/",
                "date": cdc["reportedAsOf"],
            },
            {
                "publisher": "WHO",
                "title": who["title"],
                "url": "https://www.who.int/emergencies/situations/ebola-outbreak---drc-2026",
                "date": None,
            },
            *who["newsItems"],
        ],
        "notes": [
            "Country totals come from the CDC current Ebola situation page.",
            "Regional hotspots are based on affected areas explicitly named by CDC.",
            "WHO context cards summarize the current public-health situation and recent outbreak updates.",
        ],
    }


def get_dashboard_payload() -> dict[str, Any]:
    global _cached_payload, _cached_until

    now = time.time()
    if _cached_payload and now < _cached_until:
        return _cached_payload

    payload = build_dashboard_payload()
    _cached_payload = payload
    _cached_until = now + CACHE_DURATION_SECONDS
    return payload
