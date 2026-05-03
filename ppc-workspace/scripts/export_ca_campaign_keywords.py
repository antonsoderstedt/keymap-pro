"""
Export [GENERIC] Pouches – CA campaign keywords + search terms to markdown.
Customer: ZAF Group AB (164-850-4493)
"""
from google.ads.googleads.client import GoogleAdsClient
from datetime import date, datetime, timedelta
import os

CUSTOMER_ID = "1648504493"
CAMPAIGN_NAME = "[GENERIC] Pouches – CA"
DATE_RANGE_DAYS = 90
OUTPUT_FILE = f"reports/ZAF_CA_Generic_Pouches_full_export_{datetime.now().strftime('%Y-%m-%d_%H-%M')}.md"


def get_client():
    return GoogleAdsClient.load_from_dict({
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ["GOOGLE_ADS_CUSTOMER_ID"],
        "use_proto_plus": True
    })


def date_range():
    end = date.today()
    start = end - timedelta(days=DATE_RANGE_DAYS)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def fetch_keywords(client):
    ga = client.get_service("GoogleAdsService")
    start, end = date_range()
    query = f"""
        SELECT
            ad_group.name,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
        FROM keyword_view
        WHERE campaign.name = '{CAMPAIGN_NAME}'
          AND ad_group_criterion.status != 'REMOVED'
          AND segments.date BETWEEN '{start}' AND '{end}'
        ORDER BY metrics.conversions DESC
    """
    rows = ga.search(customer_id=CUSTOMER_ID, query=query)
    results = []
    for row in rows:
        results.append({
            "ad_group": row.ad_group.name,
            "keyword": row.ad_group_criterion.keyword.text,
            "match_type": row.ad_group_criterion.keyword.match_type.name,
            "status": row.ad_group_criterion.status.name,
            "impressions": row.metrics.impressions,
            "clicks": row.metrics.clicks,
            "cost": row.metrics.cost_micros / 1_000_000,
            "conversions": row.metrics.conversions,
            "conv_value": row.metrics.conversions_value,
        })
    return results


def fetch_search_terms(client):
    ga = client.get_service("GoogleAdsService")
    start, end = date_range()
    query = f"""
        SELECT
            search_term_view.search_term,
            search_term_view.status,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
        FROM search_term_view
        WHERE campaign.name = '{CAMPAIGN_NAME}'
          AND segments.date BETWEEN '{start}' AND '{end}'
        ORDER BY metrics.conversions DESC
        LIMIT 300
    """
    rows = ga.search(customer_id=CUSTOMER_ID, query=query)
    results = []
    for row in rows:
        results.append({
            "search_term": row.search_term_view.search_term,
            "status": row.search_term_view.status.name,
            "impressions": row.metrics.impressions,
            "clicks": row.metrics.clicks,
            "cost": row.metrics.cost_micros / 1_000_000,
            "conversions": row.metrics.conversions,
            "conv_value": row.metrics.conversions_value,
        })
    return results


def build_markdown(keywords, search_terms):
    today = date.today().strftime("%Y-%m-%d")
    end = date.today()
    start = end - timedelta(days=DATE_RANGE_DAYS)

    lines = []
    lines.append(f"# [GENERIC] Pouches – CA | Full Campaign Data")
    lines.append(f"**Account:** ZAF Group AB (164-850-4493)")
    lines.append(f"**Campaign:** {CAMPAIGN_NAME}")
    lines.append(f"**Date range:** {start} → {end} (last {DATE_RANGE_DAYS} days)")
    lines.append(f"**Exported:** {today}")
    lines.append(f"**Purpose:** Keyword expansion research — feed to ChatGPT for new keyword ideas")
    lines.append("")
    lines.append("---")
    lines.append("")

    # --- KEYWORDS ---
    lines.append("## Active Keywords")
    lines.append("")
    lines.append("| Keyword | Match Type | Ad Group | Impr | Clicks | Cost (CAD) | Conv | Conv Value |")
    lines.append("|---------|------------|----------|------|--------|------------|------|------------|")
    for kw in keywords:
        lines.append(
            f"| {kw['keyword']} "
            f"| {kw['match_type']} "
            f"| {kw['ad_group']} "
            f"| {kw['impressions']:,} "
            f"| {kw['clicks']:,} "
            f"| {kw['cost']:.2f} "
            f"| {kw['conversions']:.1f} "
            f"| {kw['conv_value']:.2f} |"
        )
    lines.append("")
    lines.append(f"**Total keywords:** {len(keywords)}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # --- SEARCH TERMS ---
    lines.append("## Search Terms (top 300 by conversions, last 90 days)")
    lines.append("")
    lines.append("| Search Term | Status | Impr | Clicks | Cost (CAD) | Conv | Conv Value |")
    lines.append("|-------------|--------|------|--------|------------|------|------------|")
    for st in search_terms:
        lines.append(
            f"| {st['search_term']} "
            f"| {st['status']} "
            f"| {st['impressions']:,} "
            f"| {st['clicks']:,} "
            f"| {st['cost']:.2f} "
            f"| {st['conversions']:.1f} "
            f"| {st['conv_value']:.2f} |"
        )
    lines.append("")
    lines.append(f"**Total search terms shown:** {len(search_terms)}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # --- KEYWORD STEMS (deduplicated list for ChatGPT prompt) ---
    lines.append("## Keyword Seed List (for ChatGPT expansion prompt)")
    lines.append("")
    lines.append(
        "Paste this list into ChatGPT to generate new keyword ideas for Canada and other markets."
    )
    lines.append("")
    all_terms = sorted(set(kw["keyword"].lower() for kw in keywords))
    for term in all_terms:
        lines.append(f"- {term}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # --- CONVERTING SEARCH TERMS ---
    converting = [st for st in search_terms if st["conversions"] > 0]
    lines.append(f"## Converting Search Terms ({len(converting)} terms with conv > 0)")
    lines.append("")
    lines.append(
        "These terms actually converted. Strong signals for new keyword targeting."
    )
    lines.append("")
    for st in converting:
        lines.append(
            f"- {st['search_term']} "
            f"({st['conversions']:.0f} conv, {st['cost']:.0f} CAD cost)"
        )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("*End of export*")

    return "\n".join(lines)


def main():
    client = get_client()

    print(f"Fetching keywords for campaign: {CAMPAIGN_NAME}")
    keywords = fetch_keywords(client)
    print(f"  -> {len(keywords)} keywords found")

    print("Fetching search terms (last 90 days, top 300 by conversions)...")
    search_terms = fetch_search_terms(client)
    print(f"  -> {len(search_terms)} search terms found")

    md = build_markdown(keywords, search_terms)

    os.makedirs("reports", exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(md)

    print(f"\nExported to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
