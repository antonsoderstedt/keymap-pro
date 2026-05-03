"""
Export [GEN-INT] Pouches – AU campaign full data to markdown for AI analysis.
Customer: ZAF Group AB (164-850-4493)
"""
from google.ads.googleads.client import GoogleAdsClient
from datetime import date, datetime, timedelta
import os

CUSTOMER_ID = "1648504493"
CAMPAIGN_NAME = "[GEN-INT] Pouches – AU"
DATE_RANGE_DAYS = 90
OUTPUT_FILE = f"reports/ZAF_GEN-INT_Pouches_AU_full_export_{datetime.now().strftime('%Y-%m-%d_%H-%M')}.md"


def get_client():
    return GoogleAdsClient.load_from_dict({
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ["GOOGLE_ADS_CUSTOMER_ID"],
        "use_proto_plus": True,
    })


def date_range():
    end = date.today()
    start = end - timedelta(days=DATE_RANGE_DAYS)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def fetch_campaign_overview(client):
    ga = client.get_service("GoogleAdsService")
    start, end = date_range()
    query = f"""
        SELECT
            campaign.name,
            campaign.status,
            campaign.bidding_strategy_type,
            campaign.advertising_channel_type,
            campaign_budget.amount_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc,
            metrics.search_impression_share,
            metrics.search_budget_lost_impression_share,
            metrics.search_rank_lost_impression_share
        FROM campaign
        WHERE campaign.name = '{CAMPAIGN_NAME}'
          AND segments.date BETWEEN '{start}' AND '{end}'
    """
    rows = list(ga.search(customer_id=CUSTOMER_ID, query=query))
    if not rows:
        return None
    r = rows[0]
    return {
        "name": r.campaign.name,
        "status": r.campaign.status.name,
        "channel": r.campaign.advertising_channel_type.name,
        "bidding": r.campaign.bidding_strategy_type.name,
        "daily_budget_sek": r.campaign_budget.amount_micros / 1_000_000,
        "impressions": r.metrics.impressions,
        "clicks": r.metrics.clicks,
        "cost": r.metrics.cost_micros / 1_000_000,
        "conversions": r.metrics.conversions,
        "conv_value": r.metrics.conversions_value,
        "ctr": r.metrics.ctr * 100,
        "avg_cpc": r.metrics.average_cpc / 1_000_000,
        "impr_share": r.metrics.search_impression_share * 100,
        "lost_budget": r.metrics.search_budget_lost_impression_share * 100,
        "lost_rank": r.metrics.search_rank_lost_impression_share * 100,
    }


def fetch_ad_groups(client):
    ga = client.get_service("GoogleAdsService")
    query = f"""
        SELECT
            ad_group.name,
            ad_group.status,
            ad_group.type,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc
        FROM ad_group
        WHERE campaign.name = '{CAMPAIGN_NAME}'
          AND ad_group.status = 'ENABLED'
        ORDER BY ad_group.name
    """
    rows = ga.search(customer_id=CUSTOMER_ID, query=query)
    results = []
    for r in rows:
        results.append({
            "name": r.ad_group.name,
            "status": r.ad_group.status.name,
            "type": r.ad_group.type_.name,
            "impressions": r.metrics.impressions,
            "clicks": r.metrics.clicks,
            "cost": r.metrics.cost_micros / 1_000_000,
            "conversions": r.metrics.conversions,
            "conv_value": r.metrics.conversions_value,
            "ctr": r.metrics.ctr * 100,
            "avg_cpc": r.metrics.average_cpc / 1_000_000,
        })
    return results


def fetch_keywords(client):
    ga = client.get_service("GoogleAdsService")
    query = f"""
        SELECT
            ad_group.name,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            ad_group_criterion.quality_info.quality_score,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc
        FROM keyword_view
        WHERE campaign.name = '{CAMPAIGN_NAME}'
          AND ad_group.status = 'ENABLED'
          AND ad_group_criterion.status = 'ENABLED'
        ORDER BY ad_group.name, ad_group_criterion.keyword.text
    """
    rows = ga.search(customer_id=CUSTOMER_ID, query=query)
    results = []
    for r in rows:
        results.append({
            "ad_group": r.ad_group.name,
            "keyword": r.ad_group_criterion.keyword.text,
            "match_type": r.ad_group_criterion.keyword.match_type.name,
            "status": r.ad_group_criterion.status.name,
            "quality_score": r.ad_group_criterion.quality_info.quality_score,
            "impressions": r.metrics.impressions,
            "clicks": r.metrics.clicks,
            "cost": r.metrics.cost_micros / 1_000_000,
            "conversions": r.metrics.conversions,
            "conv_value": r.metrics.conversions_value,
            "ctr": r.metrics.ctr * 100,
            "avg_cpc": r.metrics.average_cpc / 1_000_000,
        })
    return results


def fetch_search_terms(client):
    ga = client.get_service("GoogleAdsService")
    start, end = date_range()
    query = f"""
        SELECT
            search_term_view.search_term,
            search_term_view.status,
            ad_group.name,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.average_cpc
        FROM search_term_view
        WHERE campaign.name = '{CAMPAIGN_NAME}'
          AND segments.date BETWEEN '{start}' AND '{end}'
        ORDER BY metrics.cost_micros DESC
        LIMIT 500
    """
    rows = ga.search(customer_id=CUSTOMER_ID, query=query)
    results = []
    for r in rows:
        results.append({
            "search_term": r.search_term_view.search_term,
            "status": r.search_term_view.status.name,
            "ad_group": r.ad_group.name,
            "impressions": r.metrics.impressions,
            "clicks": r.metrics.clicks,
            "cost": r.metrics.cost_micros / 1_000_000,
            "conversions": r.metrics.conversions,
            "conv_value": r.metrics.conversions_value,
            "ctr": r.metrics.ctr * 100,
            "avg_cpc": r.metrics.average_cpc / 1_000_000,
        })
    return results


def fetch_ads(client):
    ga = client.get_service("GoogleAdsService")
    query = f"""
        SELECT
            ad_group.name,
            ad_group_ad.ad.id,
            ad_group_ad.ad.type,
            ad_group_ad.status,
            ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.responsive_search_ad.descriptions,
            ad_group_ad.ad.final_urls,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.ctr
        FROM ad_group_ad
        WHERE campaign.name = '{CAMPAIGN_NAME}'
          AND ad_group.status = 'ENABLED'
          AND ad_group_ad.status = 'ENABLED'
        ORDER BY ad_group.name
    """
    rows = ga.search(customer_id=CUSTOMER_ID, query=query)
    results = []
    for r in rows:
        ad = r.ad_group_ad.ad
        rsa = ad.responsive_search_ad
        headlines = [h.text for h in rsa.headlines] if rsa.headlines else []
        descriptions = [d.text for d in rsa.descriptions] if rsa.descriptions else []
        final_urls = list(ad.final_urls) if ad.final_urls else []
        results.append({
            "ad_group": r.ad_group.name,
            "ad_id": ad.id,
            "type": r.ad_group_ad.ad.type_.name,
            "status": r.ad_group_ad.status.name,
            "headlines": headlines,
            "descriptions": descriptions,
            "final_urls": final_urls,
            "impressions": r.metrics.impressions,
            "clicks": r.metrics.clicks,
            "cost": r.metrics.cost_micros / 1_000_000,
            "conversions": r.metrics.conversions,
            "ctr": r.metrics.ctr * 100,
        })
    return results


def fetch_negative_keywords(client):
    ga = client.get_service("GoogleAdsService")
    query = f"""
        SELECT
            campaign_criterion.keyword.text,
            campaign_criterion.keyword.match_type,
            campaign_criterion.type,
            campaign_criterion.negative
        FROM campaign_criterion
        WHERE campaign.name = '{CAMPAIGN_NAME}'
          AND campaign_criterion.negative = TRUE
          AND campaign_criterion.type = 'KEYWORD'
    """
    rows = ga.search(customer_id=CUSTOMER_ID, query=query)
    results = []
    for r in rows:
        results.append({
            "keyword": r.campaign_criterion.keyword.text,
            "match_type": r.campaign_criterion.keyword.match_type.name,
        })
    return results


def cpa(cost, conversions):
    return cost / conversions if conversions > 0 else 0.0


def roas(conv_value, cost):
    return conv_value / cost if cost > 0 else 0.0


def build_markdown(overview, ad_groups, keywords, search_terms, ads, negatives):
    today = date.today().strftime("%Y-%m-%d")
    end = date.today()
    start = end - timedelta(days=DATE_RANGE_DAYS)
    lines = []

    # ── HEADER ────────────────────────────────────────────────────────────────
    lines += [
        f"# Campaign Export: {CAMPAIGN_NAME}",
        f"",
        f"**Account:** ZAF Group AB (164-850-4493)",
        f"**Campaign:** {CAMPAIGN_NAME}",
        f"**Date range:** {start} → {end} (last {DATE_RANGE_DAYS} days)",
        f"**Exported:** {today}",
        f"**Currency:** SEK",
        f"",
        "---",
        "",
        "## How to use this document",
        "",
        "This export contains all performance data for the campaign above.",
        "Sections:",
        "1. Campaign Overview — top-level KPIs and impression share",
        "2. Ad Group Breakdown — performance by ad group",
        "3. Keywords — all active keywords with quality scores",
        "4. Search Terms — top 500 by spend",
        "5. Ads (RSA) — all live ad copy",
        "6. Negative Keywords — campaign-level negatives",
        "7. Signal Summaries — pre-computed lists for quick AI analysis",
        "",
        "---",
        "",
    ]

    # ── 1. CAMPAIGN OVERVIEW ──────────────────────────────────────────────────
    lines.append("## 1. Campaign Overview")
    lines.append("")
    if overview:
        o = overview
        lines += [
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Status | {o['status']} |",
            f"| Channel | {o['channel']} |",
            f"| Bidding strategy | {o['bidding']} |",
            f"| Daily budget | SEK {o['daily_budget_sek']:.2f} |",
            f"| Impressions | {o['impressions']:,} |",
            f"| Clicks | {o['clicks']:,} |",
            f"| Spend | SEK {o['cost']:.2f} |",
            f"| CTR | {o['ctr']:.2f}% |",
            f"| Avg CPC | SEK {o['avg_cpc']:.2f} |",
            f"| Conversions | {o['conversions']:.1f} |",
            f"| Conv value | SEK {o['conv_value']:.2f} |",
            f"| CPA | SEK {cpa(o['cost'], o['conversions']):.2f} |",
            f"| ROAS | {roas(o['conv_value'], o['cost']):.2f}x |",
            f"| Search Impr Share | {o['impr_share']:.1f}% |",
            f"| Lost IS (budget) | {o['lost_budget']:.1f}% |",
            f"| Lost IS (rank) | {o['lost_rank']:.1f}% |",
        ]
    else:
        lines.append("_No campaign-level data returned._")
    lines += ["", "---", ""]

    # ── 2. AD GROUP BREAKDOWN ─────────────────────────────────────────────────
    lines.append("## 2. Ad Group Breakdown")
    lines.append("")
    lines.append("| Ad Group | Status | Impr | Clicks | Spend (SEK) | CTR | Avg CPC | Conv | CPA | ROAS |")
    lines.append("|----------|--------|------|--------|-------------|-----|---------|------|-----|------|")
    for ag in ad_groups:
        lines.append(
            f"| {ag['name']} "
            f"| {ag['status']} "
            f"| {ag['impressions']:,} "
            f"| {ag['clicks']:,} "
            f"| {ag['cost']:.2f} "
            f"| {ag['ctr']:.2f}% "
            f"| {ag['avg_cpc']:.2f} "
            f"| {ag['conversions']:.1f} "
            f"| {cpa(ag['cost'], ag['conversions']):.2f} "
            f"| {roas(ag['conv_value'], ag['cost']):.2f}x |"
        )
    lines.append(f"")
    lines.append(f"**Total ad groups:** {len(ad_groups)}")
    lines += ["", "---", ""]

    # ── 3. KEYWORDS ───────────────────────────────────────────────────────────
    lines.append("## 3. Keywords")
    lines.append("")
    lines.append("| Keyword | Match | Ad Group | QS | Impr | Clicks | Spend (SEK) | CTR | Avg CPC | Conv | CPA | ROAS |")
    lines.append("|---------|-------|----------|----|------|--------|-------------|-----|---------|------|-----|------|")
    for kw in keywords:
        qs = kw["quality_score"] if kw["quality_score"] else "—"
        lines.append(
            f"| {kw['keyword']} "
            f"| {kw['match_type']} "
            f"| {kw['ad_group']} "
            f"| {qs} "
            f"| {kw['impressions']:,} "
            f"| {kw['clicks']:,} "
            f"| {kw['cost']:.2f} "
            f"| {kw['ctr']:.2f}% "
            f"| {kw['avg_cpc']:.2f} "
            f"| {kw['conversions']:.1f} "
            f"| {cpa(kw['cost'], kw['conversions']):.2f} "
            f"| {roas(kw['conv_value'], kw['cost']):.2f}x |"
        )
    lines.append("")
    lines.append(f"**Total keywords:** {len(keywords)}")
    lines += ["", "---", ""]

    # ── 4. SEARCH TERMS ───────────────────────────────────────────────────────
    lines.append("## 4. Search Terms (top 500 by spend)")
    lines.append("")
    lines.append("| Search Term | Status | Ad Group | Impr | Clicks | Spend (SEK) | CTR | Avg CPC | Conv | Conv Value |")
    lines.append("|-------------|--------|----------|------|--------|-------------|-----|---------|------|------------|")
    for st in search_terms:
        lines.append(
            f"| {st['search_term']} "
            f"| {st['status']} "
            f"| {st['ad_group']} "
            f"| {st['impressions']:,} "
            f"| {st['clicks']:,} "
            f"| {st['cost']:.2f} "
            f"| {st['ctr']:.2f}% "
            f"| {st['avg_cpc']:.2f} "
            f"| {st['conversions']:.1f} "
            f"| {st['conv_value']:.2f} |"
        )
    lines.append("")
    lines.append(f"**Total search terms shown:** {len(search_terms)}")
    lines += ["", "---", ""]

    # ── 5. ADS (RSA) ─────────────────────────────────────────────────────────
    lines.append("## 5. Ads (Responsive Search Ads)")
    lines.append("")
    for i, ad in enumerate(ads, 1):
        lines.append(f"### Ad {i} — {ad['ad_group']} (ID: {ad['ad_id']})")
        lines.append(f"**Status:** {ad['status']} | **Impressions:** {ad['impressions']:,} | **CTR:** {ad['ctr']:.2f}% | **Conv:** {ad['conversions']:.1f}")
        lines.append("")
        if ad["headlines"]:
            lines.append("**Headlines:**")
            for h in ad["headlines"]:
                lines.append(f"- {h}")
        if ad["descriptions"]:
            lines.append("")
            lines.append("**Descriptions:**")
            for d in ad["descriptions"]:
                lines.append(f"- {d}")
        if ad["final_urls"]:
            lines.append("")
            lines.append(f"**Final URL:** {ad['final_urls'][0]}")
        lines.append("")
    lines.append(f"**Total ads:** {len(ads)}")
    lines += ["", "---", ""]

    # ── 6. NEGATIVE KEYWORDS ─────────────────────────────────────────────────
    lines.append("## 6. Negative Keywords (campaign-level)")
    lines.append("")
    if negatives:
        lines.append("| Keyword | Match Type |")
        lines.append("|---------|------------|")
        for neg in sorted(negatives, key=lambda x: x["keyword"]):
            lines.append(f"| {neg['keyword']} | {neg['match_type']} |")
    else:
        lines.append("_No campaign-level negative keywords found._")
    lines.append("")
    lines.append(f"**Total negatives:** {len(negatives)}")
    lines += ["", "---", ""]

    # ── 7. SIGNAL SUMMARIES ───────────────────────────────────────────────────
    lines.append("## 7. Signal Summaries (for AI analysis)")
    lines.append("")

    # High spend, zero conversions
    wasted = [kw for kw in keywords if kw["conversions"] == 0 and kw["cost"] > 5]
    lines.append(f"### Keywords with spend > SEK 5 and zero conversions ({len(wasted)})")
    lines.append("_Potential wasted spend — review for pause or restructure._")
    lines.append("")
    for kw in sorted(wasted, key=lambda x: -x["cost"]):
        lines.append(f"- **{kw['keyword']}** ({kw['match_type']}) — SEK {kw['cost']:.2f} spend, {kw['clicks']} clicks, 0 conv | Ad group: {kw['ad_group']}")
    lines.append("")

    # Top converting keywords
    top_conv_kw = [kw for kw in keywords if kw["conversions"] > 0]
    lines.append(f"### Top converting keywords ({len(top_conv_kw)})")
    lines.append("")
    for kw in top_conv_kw[:20]:
        lines.append(
            f"- **{kw['keyword']}** ({kw['match_type']}) — {kw['conversions']:.1f} conv, "
            f"CPA SEK {cpa(kw['cost'], kw['conversions']):.2f}, ROAS {roas(kw['conv_value'], kw['cost']):.2f}x"
        )
    lines.append("")

    # Converting search terms not yet keywords
    kw_texts = set(kw["keyword"].lower() for kw in keywords)
    new_signals = [
        st for st in search_terms
        if st["conversions"] > 0 and st["search_term"].lower() not in kw_texts
    ]
    lines.append(f"### Converting search terms not yet added as keywords ({len(new_signals)})")
    lines.append("_Strong candidates for keyword expansion._")
    lines.append("")
    for st in sorted(new_signals, key=lambda x: -x["conversions"]):
        lines.append(
            f"- **{st['search_term']}** — {st['conversions']:.0f} conv, "
            f"SEK {st['cost']:.2f} spend, ad group: {st['ad_group']}"
        )
    lines.append("")

    # High spend search terms with no conversions
    wasted_st = [st for st in search_terms if st["conversions"] == 0 and st["cost"] > 10]
    lines.append(f"### Search terms with spend > SEK 10 and zero conversions ({len(wasted_st)})")
    lines.append("_Candidates for negative keywords._")
    lines.append("")
    for st in sorted(wasted_st, key=lambda x: -x["cost"])[:50]:
        lines.append(
            f"- **{st['search_term']}** — SEK {st['cost']:.2f} spend, "
            f"{st['clicks']} clicks, status: {st['status']}"
        )
    lines.append("")

    lines += ["---", "", "*End of export*"]
    return "\n".join(lines)


def main():
    client = get_client()

    print(f"Campaign: {CAMPAIGN_NAME}")
    print(f"Customer: {CUSTOMER_ID}")
    print(f"Date range: last {DATE_RANGE_DAYS} days")
    print()

    print("Fetching campaign overview...")
    overview = fetch_campaign_overview(client)
    if overview:
        print(f"  -> OK ({overview['impressions']:,} impressions, SEK {overview['cost']:.2f} spend)")
    else:
        print("  -> No data found — check campaign name spelling")

    print("Fetching ad groups...")
    ad_groups = fetch_ad_groups(client)
    print(f"  -> {len(ad_groups)} ad groups")

    print("Fetching keywords...")
    keywords = fetch_keywords(client)
    print(f"  -> {len(keywords)} keywords")

    print("Fetching search terms (top 500 by spend)...")
    search_terms = fetch_search_terms(client)
    print(f"  -> {len(search_terms)} search terms")

    print("Fetching ads...")
    ads = fetch_ads(client)
    print(f"  -> {len(ads)} ads")

    print("Fetching negative keywords...")
    negatives = fetch_negative_keywords(client)
    print(f"  -> {len(negatives)} negatives")

    print()
    print("Building export...")
    md = build_markdown(overview, ad_groups, keywords, search_terms, ads, negatives)

    os.makedirs("reports", exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(md)

    print(f"Exported to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
