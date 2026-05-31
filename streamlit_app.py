from __future__ import annotations

from datetime import datetime

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from streamlit_data import get_dashboard_payload


st.set_page_config(
    page_title="Ebola Live Dashboard",
    page_icon=":earth_africa:",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
      .hero-card {
        padding: 1.5rem 1.6rem;
        border-radius: 20px;
        color: white;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #7f1d1d 100%);
        border: 1px solid rgba(255,255,255,0.08);
        margin-bottom: 1rem;
      }
      .hero-card h1 {
        margin: 0 0 0.4rem 0;
        font-size: 2.4rem;
      }
      .hero-card p {
        margin: 0.25rem 0;
        color: rgba(255,255,255,0.88);
      }
      .source-card {
        padding: 0.9rem 1rem;
        border: 1px solid rgba(148,163,184,0.24);
        border-radius: 14px;
        background: rgba(248,250,252,0.9);
        margin-bottom: 0.7rem;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data(ttl=600, show_spinner=False)
def load_dashboard() -> dict:
    return get_dashboard_payload()


def format_datetime(value: str | None) -> str:
    if not value:
        return "Unavailable"
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%b %d, %Y %H:%M UTC")
    except ValueError:
        return value


def severity_label(total_known_cases: int) -> str:
    if total_known_cases >= 400:
        return "Very high burden"
    if total_known_cases >= 100:
        return "High burden"
    return "Active outbreak"


try:
    data = load_dashboard()
except Exception as error:
    st.error(f"Unable to load live outbreak data right now: {error}")
    st.stop()


countries_df = pd.DataFrame(data["countries"]).sort_values("totalKnownCases", ascending=False)
hotspots_df = pd.DataFrame(data["hotspots"])
sources_df = pd.DataFrame(data["sources"])

if not countries_df.empty:
    country_names = countries_df["name"].tolist()
    selected_country_name = st.sidebar.selectbox(
        "Regional spotlight",
        country_names,
        index=0,
        help="Inspect one affected country at a time.",
    )
    selected_country = countries_df.loc[countries_df["name"] == selected_country_name].iloc[0]
else:
    selected_country = None

st.markdown(
    f"""
    <div class="hero-card">
      <h1>Ebola Live Dashboard</h1>
      <p>Live public-health view of Ebola cases, deaths, hotspots, and source-backed updates.</p>
      <p><strong>Reported as of:</strong> {data.get("reportedAsOf") or "Unavailable"} |
      <strong>Last source update:</strong> {format_datetime(data.get("updatedTime") or data.get("refreshedAt"))}</p>
    </div>
    """,
    unsafe_allow_html=True,
)

if data.get("warning"):
    st.warning(data["warning"])

metric_columns = st.columns(5)
metric_columns[0].metric("Confirmed cases", f"{data['totals']['confirmedCases']:,}")
metric_columns[1].metric("Confirmed deaths", f"{data['totals']['confirmedDeaths']:,}")
metric_columns[2].metric("Suspected cases", f"{data['totals']['suspectedCases']:,}")
metric_columns[3].metric("Probable cases", f"{data['totals']['probableCases']:,}")
metric_columns[4].metric("Countries affected", f"{data['totals']['countriesAffected']:,}")

map_col, spotlight_col = st.columns([1.9, 1.1], gap="large")

with map_col:
    st.subheader("World case map")
    st.caption("Affected countries are shaded by outbreak burden, with case bubbles and named hotspot markers.")

    fig = px.choropleth(
        countries_df,
        locations="code",
        color="totalKnownCases",
        hover_name="name",
        color_continuous_scale=["#fee2e2", "#f87171", "#dc2626", "#7f1d1d"],
        projection="natural earth",
        labels={"totalKnownCases": "Total known cases"},
    )

    fig.add_trace(
        go.Scattergeo(
            lon=countries_df["longitude"],
            lat=countries_df["latitude"],
            text=countries_df["name"]
            + "<br>Total known cases: "
            + countries_df["totalKnownCases"].map(lambda value: f"{value:,}")
            + "<br>Confirmed deaths: "
            + countries_df["metrics"].map(lambda metrics: f"{metrics['confirmedDeaths']:,}"),
            mode="markers+text",
            textposition="top center",
            marker={
                "size": countries_df["totalKnownCases"].clip(lower=1).pow(0.5) * 2.4,
                "color": "#7f1d1d",
                "opacity": 0.82,
                "line": {"width": 1.5, "color": "#ffffff"},
            },
            name="Country burden",
            hovertemplate="%{text}<extra></extra>",
        )
    )

    if not hotspots_df.empty:
        fig.add_trace(
            go.Scattergeo(
                lon=hotspots_df["longitude"],
                lat=hotspots_df["latitude"],
                text=hotspots_df["name"] + "<br>" + hotspots_df["detail"],
                mode="markers+text",
                textposition="middle right",
                marker={
                    "size": 10,
                    "color": "#f59e0b",
                    "line": {"width": 1.2, "color": "#ffffff"},
                },
                name="Hotspots",
                hovertemplate="%{text}<extra></extra>",
            )
        )

    fig.update_geos(
        showframe=False,
        showcoastlines=True,
        coastlinecolor="rgba(71,85,105,0.3)",
        showcountries=True,
        countrycolor="rgba(71,85,105,0.2)",
        showland=True,
        landcolor="#e2e8f0",
        showocean=True,
        oceancolor="#eff6ff",
        lataxis_showgrid=True,
        lonaxis_showgrid=True,
    )
    fig.update_layout(
        margin={"l": 0, "r": 0, "t": 10, "b": 0},
        height=560,
        legend={"orientation": "h", "y": -0.08},
        coloraxis_colorbar={"title": "Cases"},
    )
    st.plotly_chart(fig, use_container_width=True)

with spotlight_col:
    st.subheader("Regional spotlight")
    if selected_country is not None:
        st.markdown(f"**{selected_country['name']}**")
        st.caption(
            f"{severity_label(int(selected_country['totalKnownCases']))} with "
            f"{int(selected_country['totalKnownCases']):,} total reported and suspected cases."
        )

        stat_cols = st.columns(3)
        stat_cols[0].metric("Confirmed", f"{selected_country['metrics']['confirmedCases']:,}")
        stat_cols[1].metric("Deaths", f"{selected_country['metrics']['confirmedDeaths']:,}")
        stat_cols[2].metric("CFR", f"{selected_country['caseFatalityRatio']}%")

        st.progress(
            min(float(selected_country["totalKnownCases"]) / float(countries_df["totalKnownCases"].max()), 1.0)
        )

        st.markdown("**Named transmission areas**")
        selected_hotspots = hotspots_df.loc[hotspots_df["country"] == selected_country["name"]]
        if selected_hotspots.empty:
            st.info("No hotspot labels available for this country.")
        else:
            for _, hotspot in selected_hotspots.iterrows():
                st.markdown(
                    f"""
                    <div class="source-card">
                      <strong>{hotspot['name']}</strong><br/>
                      {hotspot['detail']}<br/>
                      <small>{hotspot['latitude']:.2f}, {hotspot['longitude']:.2f}</small>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

st.subheader("Situation summary")
summary_col, method_col = st.columns([1.3, 1], gap="large")

with summary_col:
    st.write(data["overview"])
    st.caption(data["description"])
    st.info(f"Affected areas: {data['affectedAreas'] or 'Unavailable'}")

with method_col:
    st.markdown("**Method**")
    for note in data["notes"]:
        st.markdown(f"- {note}")

st.subheader("Current burden by country")
country_table = countries_df.assign(
    confirmedCases=countries_df["metrics"].map(lambda value: value["confirmedCases"]),
    confirmedDeaths=countries_df["metrics"].map(lambda value: value["confirmedDeaths"]),
)[["name", "totalKnownCases", "confirmedCases", "confirmedDeaths", "caseFatalityRatio"]]
country_table.columns = [
    "Country",
    "Total known cases",
    "Confirmed cases",
    "Confirmed deaths",
    "CFR (%)",
]
st.dataframe(country_table, use_container_width=True, hide_index=True)

st.subheader("Live references")
for _, source in sources_df.iterrows():
    subtitle = source["publisher"]
    if pd.notna(source["date"]):
        subtitle += f" | {source['date']}"
    st.markdown(
        f"""
        <div class="source-card">
          <strong><a href="{source['url']}" target="_blank">{source['title']}</a></strong><br/>
          <small>{subtitle}</small>
        </div>
        """,
        unsafe_allow_html=True,
    )
