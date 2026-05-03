"""
ZAF Group AB – Full Account Audit
Customer ID: 1648504493
Login (MCC): from env GOOGLE_ADS_CUSTOMER_ID
"""

import os
import re
import csv
import json
import math
from datetime import date, datetime, timedelta
from collections import defaultdict
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

CUSTOMER_ID = "1648504493"
TODAY = date.today()
TIMESTAMP = datetime.now().strftime("%Y-%m-%d_%H-%M")
PERIOD_END   = TODAY - timedelta(days=1)
PERIOD_START = PERIOD_END - timedelta(days=29)
PREV_END     = PERIOD_START - timedelta(days=1)
PREV_START   = PREV_END - timedelta(days=29)

REPORTS_DIR = "reports"
os.makedirs(REPORTS_DIR, exist_ok=True)


def get_client():
    return GoogleAdsClient.load_from_dict({
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id":       os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret":   os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token":   os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ["GOOGLE_ADS_CUSTOMER_ID"],
        "use_proto_plus": True,
    })


def safe_div(a, b):
    return round(a / b, 4) if b else None


def run_query(client, query, label=""):
    svc = client.get_service("GoogleAdsService")
    try:
        return list(svc.search(customer_id=CUSTOMER_ID, query=query))
    except GoogleAdsException as ex:
        err_code = ex.error.code().name if ex.error else "UNKNOWN"
        print(f"  [API ERROR] {label}: {err_code}")
        for err in ex.failure.errors:
            print(f"    * {err.message}")
        return []


# ─────────────────────────────────────────────────────────────
# 1. CAMPAIGN PERFORMANCE (current + previous period)
# ─────────────────────────────────────────────────────────────
def section_campaigns(client):
    print("\n[1/7] Campaign performance...")

    def fetch_period(start, end):
        q = f"""
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                metrics.cost_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                metrics.conversions_value,
                metrics.search_impression_share,
                metrics.search_budget_lost_impression_share,
                metrics.search_rank_lost_impression_share
            FROM campaign
            WHERE segments.date BETWEEN '{start}' AND '{end}'
            ORDER BY metrics.cost_micros DESC
        """
        rows = run_query(client, q, "campaigns")
        result = {}
        for r in rows:
            cid = str(r.campaign.id)
            cost = r.metrics.cost_micros / 1e6
            clicks = r.metrics.clicks
            impr = r.metrics.impressions
            conv = r.metrics.conversions
            val  = r.metrics.conversions_value
            result[cid] = {
                "name":   r.campaign.name,
                "status": r.campaign.status.name,
                "type":   r.campaign.advertising_channel_type.name,
                "cost":   cost,
                "impressions": impr,
                "clicks":  clicks,
                "ctr":    safe_div(clicks, impr),
                "cpc":    safe_div(cost, clicks),
                "conversions": round(conv, 2),
                "cpa":    safe_div(cost, conv),
                "conv_value": round(val, 2),
                "roas":   safe_div(val, cost),
                "is":     r.metrics.search_impression_share,
                "is_lost_budget": r.metrics.search_budget_lost_impression_share,
                "is_lost_rank":   r.metrics.search_rank_lost_impression_share,
            }
        return result

    curr = fetch_period(PERIOD_START, PERIOD_END)
    prev = fetch_period(PREV_START, PREV_END)

    combined = []
    all_ids = set(list(curr.keys()) + list(prev.keys()))
    for cid in all_ids:
        c = curr.get(cid, {})
        p = prev.get(cid, {})
        row = {
            "campaign_id":  cid,
            "campaign_name": c.get("name", p.get("name", "")),
            "status":        c.get("status", p.get("status", "")),
            "type":          c.get("type", p.get("type", "")),
            "cost_curr":     c.get("cost", 0),
            "cost_prev":     p.get("cost", 0),
            "impressions_curr": c.get("impressions", 0),
            "impressions_prev": p.get("impressions", 0),
            "clicks_curr":   c.get("clicks", 0),
            "clicks_prev":   p.get("clicks", 0),
            "ctr_curr":      c.get("ctr", 0),
            "ctr_prev":      p.get("ctr", 0),
            "cpc_curr":      c.get("cpc", 0),
            "cpc_prev":      p.get("cpc", 0),
            "conversions_curr": c.get("conversions", 0),
            "conversions_prev": p.get("conversions", 0),
            "cpa_curr":      c.get("cpa", ""),
            "cpa_prev":      p.get("cpa", ""),
            "conv_value_curr": c.get("conv_value", 0),
            "conv_value_prev": p.get("conv_value", 0),
            "roas_curr":     c.get("roas", ""),
            "roas_prev":     p.get("roas", ""),
            "impression_share": c.get("is", ""),
            "is_lost_budget":   c.get("is_lost_budget", ""),
            "is_lost_rank":     c.get("is_lost_rank", ""),
        }
        combined.append(row)

    # Save CSV
    fname = f"{REPORTS_DIR}/zaf_1_campaigns_{TIMESTAMP}.csv"
    if combined:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(combined[0].keys()))
            writer.writeheader()
            writer.writerows(combined)
    print(f"  → {len(combined)} campaigns saved to {fname}")
    return combined


# ─────────────────────────────────────────────────────────────
# 2. QUALITY SCORE
# ─────────────────────────────────────────────────────────────
def section_quality_score(client):
    print("\n[2/7] Quality Score...")
    q = f"""
        SELECT
            campaign.name,
            ad_group.name,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            ad_group_criterion.quality_info.quality_score,
            ad_group_criterion.quality_info.search_predicted_ctr,
            ad_group_criterion.quality_info.creative_quality_score,
            ad_group_criterion.quality_info.post_click_quality_score,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks,
            metrics.impressions
        FROM keyword_view
        WHERE segments.date BETWEEN '{PERIOD_START}' AND '{PERIOD_END}'
          AND ad_group_criterion.type = KEYWORD
        ORDER BY metrics.cost_micros DESC
    """
    rows = run_query(client, q, "quality_score")

    result = []
    for r in rows:
        qs  = r.ad_group_criterion.quality_info.quality_score
        ctr_rank = r.ad_group_criterion.quality_info.search_predicted_ctr.name
        ad_rel   = r.ad_group_criterion.quality_info.creative_quality_score.name
        lp_exp   = r.ad_group_criterion.quality_info.post_click_quality_score.name
        cost     = r.metrics.cost_micros / 1e6
        result.append({
            "campaign":     r.campaign.name,
            "ad_group":     r.ad_group.name,
            "keyword":      r.ad_group_criterion.keyword.text,
            "match_type":   r.ad_group_criterion.keyword.match_type.name,
            "status":       r.ad_group_criterion.status.name,
            "quality_score": qs if qs else "N/A",
            "expected_ctr": ctr_rank,
            "ad_relevance": ad_rel,
            "landing_page_exp": lp_exp,
            "cost":         round(cost, 2),
            "clicks":       r.metrics.clicks,
            "impressions":  r.metrics.impressions,
            "conversions":  round(r.metrics.conversions, 2),
            "flag_low_qs":  "LOW QS" if qs and qs < 5 else "",
        })

    fname = f"{REPORTS_DIR}/zaf_2_quality_score_{TIMESTAMP}.csv"
    if result:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(result[0].keys()))
            writer.writeheader()
            writer.writerows(result)
    print(f"  → {len(result)} keywords saved to {fname}")
    return result


# ─────────────────────────────────────────────────────────────
# 3. RSA ASSET PERFORMANCE
# ─────────────────────────────────────────────────────────────
def section_rsa_assets(client):
    print("\n[3/7] RSA asset performance...")
    q = """
        SELECT
            campaign.name,
            ad_group.name,
            ad_group_ad.ad.id,
            ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.responsive_search_ad.descriptions,
            ad_group_ad.ad.final_urls,
            ad_group_ad.policy_summary.approval_status,
            ad_group_ad.policy_summary.policy_topic_entries,
            ad_group_ad.status,
            ad_group_ad.ad_strength
        FROM ad_group_ad
        WHERE ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD
          AND campaign.status != REMOVED
    """
    rows = run_query(client, q, "rsa_assets")

    result = []
    for r in rows:
        ad = r.ad_group_ad.ad
        rsa = ad.responsive_search_ad

        headlines = []
        for h in rsa.headlines:
            perf = getattr(h, 'asset_performance_label', None)
            pin  = getattr(h, 'pinned_field', None)
            headlines.append({
                "text": h.text,
                "performance": perf.name if perf else "UNSPECIFIED",
                "pinned": pin.name if pin else "",
            })

        descriptions = []
        for d in rsa.descriptions:
            perf = getattr(d, 'asset_performance_label', None)
            pin  = getattr(d, 'pinned_field', None)
            descriptions.append({
                "text": d.text,
                "performance": perf.name if perf else "UNSPECIFIED",
                "pinned": pin.name if pin else "",
            })

        policy = r.ad_group_ad.policy_summary
        approval = policy.approval_status.name
        policy_topics = []
        for entry in policy.policy_topic_entries:
            policy_topics.append(f"{entry.topic}: {entry.type_.name}")

        final_urls = list(ad.final_urls) if ad.final_urls else []
        ad_strength = r.ad_group_ad.ad_strength.name if r.ad_group_ad.ad_strength else "UNKNOWN"

        for asset_type, assets in [("HEADLINE", headlines), ("DESCRIPTION", descriptions)]:
            for asset in assets:
                result.append({
                    "campaign":       r.campaign.name,
                    "ad_group":       r.ad_group.name,
                    "ad_id":          ad.id,
                    "ad_status":      r.ad_group_ad.status.name,
                    "ad_strength":    ad_strength,
                    "asset_type":     asset_type,
                    "asset_text":     asset["text"],
                    "performance":    asset["performance"],
                    "pinned":         asset["pinned"],
                    "approval_status": approval,
                    "policy_issues":  " | ".join(policy_topics),
                    "final_url":      final_urls[0] if final_urls else "",
                })

    fname = f"{REPORTS_DIR}/zaf_3_rsa_assets_{TIMESTAMP}.csv"
    if result:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(result[0].keys()))
            writer.writeheader()
            writer.writerows(result)
    print(f"  → {len(result)} asset rows saved to {fname}")
    return result


# ─────────────────────────────────────────────────────────────
# 4. DEVICE / HOUR-OF-DAY / DAY-OF-WEEK
# ─────────────────────────────────────────────────────────────
def section_segmented(client):
    print("\n[4/7] Device / Hour / Day-of-week...")
    results = {}

    # 4a Device
    q_device = f"""
        SELECT
            campaign.name,
            segments.device,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value
        FROM campaign
        WHERE segments.date BETWEEN '{PERIOD_START}' AND '{PERIOD_END}'
    """
    rows = run_query(client, q_device, "device")
    device_rows = []
    for r in rows:
        cost = r.metrics.cost_micros / 1e6
        clicks = r.metrics.clicks
        impr = r.metrics.impressions
        conv = r.metrics.conversions
        val  = r.metrics.conversions_value
        device_rows.append({
            "campaign":  r.campaign.name,
            "device":    r.segments.device.name,
            "cost":      round(cost, 2),
            "impressions": impr,
            "clicks":    clicks,
            "ctr":       round(safe_div(clicks, impr) * 100, 2) if safe_div(clicks, impr) else 0,
            "cpc":       round(safe_div(cost, clicks), 2) if safe_div(cost, clicks) else 0,
            "conversions": round(conv, 2),
            "cpa":       round(safe_div(cost, conv), 2) if safe_div(cost, conv) else "",
            "conv_value": round(val, 2),
            "roas":      round(safe_div(val, cost), 2) if safe_div(val, cost) else "",
        })
    fname = f"{REPORTS_DIR}/zaf_4a_device_{TIMESTAMP}.csv"
    if device_rows:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(device_rows[0].keys()))
            writer.writeheader()
            writer.writerows(device_rows)
    results["device"] = device_rows
    print(f"  → {len(device_rows)} device rows saved")

    # 4b Hour of day
    q_hour = f"""
        SELECT
            segments.hour,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value
        FROM campaign
        WHERE segments.date BETWEEN '{PERIOD_START}' AND '{PERIOD_END}'
    """
    rows = run_query(client, q_hour, "hour_of_day")
    hour_agg = defaultdict(lambda: {"cost": 0, "impressions": 0, "clicks": 0, "conversions": 0, "conv_value": 0})
    for r in rows:
        h = r.segments.hour
        hour_agg[h]["cost"]        += r.metrics.cost_micros / 1e6
        hour_agg[h]["impressions"] += r.metrics.impressions
        hour_agg[h]["clicks"]      += r.metrics.clicks
        hour_agg[h]["conversions"] += r.metrics.conversions
        hour_agg[h]["conv_value"]  += r.metrics.conversions_value

    hour_rows = []
    for h in sorted(hour_agg.keys()):
        d = hour_agg[h]
        cost = d["cost"]; clicks = d["clicks"]; impr = d["impressions"]
        conv = d["conversions"]; val = d["conv_value"]
        hour_rows.append({
            "hour":        h,
            "cost":        round(cost, 2),
            "impressions": impr,
            "clicks":      clicks,
            "ctr":         round(safe_div(clicks, impr) * 100, 2) if safe_div(clicks, impr) else 0,
            "cpc":         round(safe_div(cost, clicks), 2) if safe_div(cost, clicks) else 0,
            "conversions": round(conv, 2),
            "cpa":         round(safe_div(cost, conv), 2) if safe_div(cost, conv) else "",
            "conv_value":  round(val, 2),
            "roas":        round(safe_div(val, cost), 2) if safe_div(val, cost) else "",
        })
    fname = f"{REPORTS_DIR}/zaf_4b_hour_of_day_{TIMESTAMP}.csv"
    if hour_rows:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(hour_rows[0].keys()))
            writer.writeheader()
            writer.writerows(hour_rows)
    results["hour"] = hour_rows
    print(f"  → {len(hour_rows)} hour rows saved")

    # 4c Day of week
    q_dow = f"""
        SELECT
            segments.day_of_week,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value
        FROM campaign
        WHERE segments.date BETWEEN '{PERIOD_START}' AND '{PERIOD_END}'
    """
    rows = run_query(client, q_dow, "day_of_week")
    dow_agg = defaultdict(lambda: {"cost": 0, "impressions": 0, "clicks": 0, "conversions": 0, "conv_value": 0})
    for r in rows:
        d = r.segments.day_of_week.name
        dow_agg[d]["cost"]        += r.metrics.cost_micros / 1e6
        dow_agg[d]["impressions"] += r.metrics.impressions
        dow_agg[d]["clicks"]      += r.metrics.clicks
        dow_agg[d]["conversions"] += r.metrics.conversions
        dow_agg[d]["conv_value"]  += r.metrics.conversions_value

    dow_order = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
    dow_rows = []
    for day in dow_order:
        if day not in dow_agg:
            continue
        d = dow_agg[day]
        cost = d["cost"]; clicks = d["clicks"]; impr = d["impressions"]
        conv = d["conversions"]; val = d["conv_value"]
        dow_rows.append({
            "day_of_week": day,
            "cost":        round(cost, 2),
            "impressions": impr,
            "clicks":      clicks,
            "ctr":         round(safe_div(clicks, impr) * 100, 2) if safe_div(clicks, impr) else 0,
            "cpc":         round(safe_div(cost, clicks), 2) if safe_div(cost, clicks) else 0,
            "conversions": round(conv, 2),
            "cpa":         round(safe_div(cost, conv), 2) if safe_div(cost, conv) else "",
            "conv_value":  round(val, 2),
            "roas":        round(safe_div(val, cost), 2) if safe_div(val, cost) else "",
        })
    fname = f"{REPORTS_DIR}/zaf_4c_day_of_week_{TIMESTAMP}.csv"
    if dow_rows:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(dow_rows[0].keys()))
            writer.writeheader()
            writer.writerows(dow_rows)
    results["dow"] = dow_rows
    print(f"  → {len(dow_rows)} day-of-week rows saved")

    return results


# ─────────────────────────────────────────────────────────────
# 5. LANDING PAGE COMPARISON
# ─────────────────────────────────────────────────────────────
def section_landing_pages(client):
    print("\n[5/7] Landing page comparison...")
    q = f"""
        SELECT
            landing_page_view.unexpanded_final_url,
            metrics.cost_micros,
            metrics.clicks,
            metrics.impressions,
            metrics.conversions,
            metrics.conversions_value
        FROM landing_page_view
        WHERE segments.date BETWEEN '{PERIOD_START}' AND '{PERIOD_END}'
        ORDER BY metrics.cost_micros DESC
    """
    rows = run_query(client, q, "landing_pages")

    url_agg = defaultdict(lambda: {"cost": 0, "clicks": 0, "impressions": 0, "conversions": 0, "conv_value": 0})
    for r in rows:
        url = r.landing_page_view.unexpanded_final_url
        url_agg[url]["cost"]        += r.metrics.cost_micros / 1e6
        url_agg[url]["clicks"]      += r.metrics.clicks
        url_agg[url]["impressions"] += r.metrics.impressions
        url_agg[url]["conversions"] += r.metrics.conversions
        url_agg[url]["conv_value"]  += r.metrics.conversions_value

    result = []
    for url, d in sorted(url_agg.items(), key=lambda x: -x[1]["cost"]):
        cost = d["cost"]; clicks = d["clicks"]; conv = d["conversions"]; val = d["conv_value"]
        cvr = safe_div(conv, clicks)
        result.append({
            "final_url":    url,
            "cost":         round(cost, 2),
            "clicks":       clicks,
            "conversions":  round(conv, 2),
            "conv_rate":    round(cvr * 100, 2) if cvr else 0,
            "cpa":          round(safe_div(cost, conv), 2) if safe_div(cost, conv) else "",
            "conv_value":   round(val, 2),
            "roas":         round(safe_div(val, cost), 2) if safe_div(val, cost) else "",
            "flag":         "LOW CVR" if cvr and cvr < 0.01 else "",
        })

    fname = f"{REPORTS_DIR}/zaf_5_landing_pages_{TIMESTAMP}.csv"
    if result:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(result[0].keys()))
            writer.writeheader()
            writer.writerows(result)
    print(f"  → {len(result)} landing pages saved to {fname}")
    return result


# ─────────────────────────────────────────────────────────────
# 6. SEARCH TERMS REVIEW (negative keyword agent)
# ─────────────────────────────────────────────────────────────
def section_search_terms(client):
    print("\n[6/7] Search terms review...")
    q = f"""
        SELECT
            campaign.name,
            ad_group.name,
            search_term_view.search_term,
            search_term_view.status,
            metrics.cost_micros,
            metrics.clicks,
            metrics.impressions,
            metrics.conversions,
            metrics.conversions_value
        FROM search_term_view
        WHERE segments.date BETWEEN '{PERIOD_START}' AND '{PERIOD_END}'
        ORDER BY metrics.cost_micros DESC
    """
    rows = run_query(client, q, "search_terms")

    result = []
    for r in rows:
        cost = r.metrics.cost_micros / 1e6
        clicks = r.metrics.clicks
        conv  = r.metrics.conversions
        val   = r.metrics.conversions_value
        term  = r.search_term_view.search_term
        status = r.search_term_view.status.name

        # Negative keyword logic
        is_converting = conv > 0
        is_irrelevant = (
            not is_converting
            and cost > 5
            and status == "NONE"
        )
        neg_suggestion = ""
        neg_reason     = ""
        risk_level     = ""
        match_type_rec = ""

        if is_irrelevant:
            neg_suggestion = term
            neg_reason     = "No conversions + cost > 5 SEK"
            risk_level     = "LOW" if cost < 20 else "MEDIUM"
            match_type_rec = "EXACT" if clicks < 5 else "PHRASE"

        result.append({
            "campaign":      r.campaign.name,
            "ad_group":      r.ad_group.name,
            "search_term":   term,
            "status":        status,
            "cost":          round(cost, 2),
            "clicks":        clicks,
            "impressions":   r.metrics.impressions,
            "conversions":   round(conv, 2),
            "conv_value":    round(val, 2),
            "cpa":           round(safe_div(cost, conv), 2) if safe_div(cost, conv) else "",
            "has_conversion": "YES" if is_converting else "NO",
            "neg_suggestion": neg_suggestion,
            "neg_reason":     neg_reason,
            "risk_level":     risk_level,
            "suggested_match_type": match_type_rec,
        })

    fname = f"{REPORTS_DIR}/zaf_6_search_terms_{TIMESTAMP}.csv"
    if result:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(result[0].keys()))
            writer.writeheader()
            writer.writerows(result)

    neg_count = sum(1 for r in result if r["neg_suggestion"])
    print(f"  → {len(result)} search terms, {neg_count} negative suggestions saved to {fname}")
    return result


# ─────────────────────────────────────────────────────────────
# 7. POLICY / SUSPENSION REVIEW
# ─────────────────────────────────────────────────────────────
def section_policy(client):
    print("\n[7/7] Policy / Suspension review...")

    # 7a Ad approval status
    q_ads = """
        SELECT
            campaign.name,
            ad_group.name,
            ad_group_ad.ad.id,
            ad_group_ad.ad.type,
            ad_group_ad.status,
            ad_group_ad.policy_summary.approval_status,
            ad_group_ad.policy_summary.review_status,
            ad_group_ad.policy_summary.policy_topic_entries,
            ad_group_ad.ad.final_urls
        FROM ad_group_ad
        WHERE campaign.status != REMOVED
          AND ad_group_ad.status != REMOVED
        ORDER BY campaign.name
    """
    rows = run_query(client, q_ads, "policy_ads")

    policy_rows = []
    for r in rows:
        policy = r.ad_group_ad.policy_summary
        approval = policy.approval_status.name
        review   = policy.review_status.name
        topics   = []
        for entry in policy.policy_topic_entries:
            topic_type = entry.type_.name
            topic_name = entry.topic
            evidences  = []
            for ev in entry.evidences:
                for dest in ev.destination_mismatch_evidences:
                    evidences.append(f"DEST_MISMATCH:{dest.expand_type.name}")
                for text_list in ev.text_list_evidences:
                    for txt in text_list.texts:
                        evidences.append(f"TEXT:{txt}")
                for url in ev.http_code_evidences:
                    evidences.append(f"HTTP:{url.http_code}:{url.url}")
            topics.append({
                "topic": topic_name,
                "type": topic_type,
                "evidences": " | ".join(evidences)
            })

        final_urls = list(r.ad_group_ad.ad.final_urls) if r.ad_group_ad.ad.final_urls else []

        for t in topics:
            policy_rows.append({
                "campaign":        r.campaign.name,
                "ad_group":        r.ad_group.name,
                "ad_id":           r.ad_group_ad.ad.id,
                "ad_type":         r.ad_group_ad.ad.type.name,
                "ad_status":       r.ad_group_ad.status.name,
                "approval_status": approval,
                "review_status":   review,
                "policy_topic":    t["topic"],
                "violation_type":  t["type"],
                "evidence":        t["evidences"],
                "final_url":       final_urls[0] if final_urls else "",
            })
        if not topics and approval not in ("APPROVED", "APPROVED_LIMITED"):
            policy_rows.append({
                "campaign":        r.campaign.name,
                "ad_group":        r.ad_group.name,
                "ad_id":           r.ad_group_ad.ad.id,
                "ad_type":         r.ad_group_ad.ad.type.name,
                "ad_status":       r.ad_group_ad.status.name,
                "approval_status": approval,
                "review_status":   review,
                "policy_topic":    "",
                "violation_type":  "",
                "evidence":        "",
                "final_url":       final_urls[0] if final_urls else "",
            })

    # 7b Account-level status
    q_account = """
        SELECT
            customer.id,
            customer.descriptive_name,
            customer.status,
            customer.optimization_score
        FROM customer
    """
    acc_rows = run_query(client, q_account, "account_status")
    account_info = {}
    for r in acc_rows:
        account_info = {
            "id":     str(r.customer.id),
            "name":   r.customer.descriptive_name,
            "status": r.customer.status.name,
            "opt_score": r.customer.optimization_score,
        }

    fname = f"{REPORTS_DIR}/zaf_7_policy_{TIMESTAMP}.csv"
    if policy_rows:
        with open(fname, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(policy_rows[0].keys()))
            writer.writeheader()
            writer.writerows(policy_rows)

    disapproved = [r for r in policy_rows if r["approval_status"] == "DISAPPROVED"]
    ltd         = [r for r in policy_rows if r["approval_status"] == "APPROVED_LIMITED"]

    print(f"  → Account status: {account_info.get('status','?')}")
    print(f"  → {len(disapproved)} disapproved, {len(ltd)} limited approval ads")
    print(f"  → Policy rows saved to {fname}")
    return policy_rows, account_info


# ─────────────────────────────────────────────────────────────
# BUILD MARKDOWN REPORT
# ─────────────────────────────────────────────────────────────
def build_report(campaigns, qs_data, rsa_data, segmented, lp_data, st_data, policy_data, account_info):
    today_str = TODAY.strftime("%Y-%m-%d")
    lines = []

    # ── Header ──────────────────────────────────────────────
    lines += [
        f"# ZAF Group AB – Full Account Audit",
        f"**Customer ID:** 1648504493  |  **Date:** {today_str}",
        f"**Period:** {PERIOD_START} → {PERIOD_END} vs {PREV_START} → {PREV_END}",
        "",
    ]

    # ── Account status ───────────────────────────────────────
    acc_status = account_info.get("status", "UNKNOWN")
    opt_score  = account_info.get("opt_score", 0)
    lines += [
        "---",
        "## Account Status",
        f"- **Status:** `{acc_status}`",
        f"- **Optimization Score:** {round(opt_score * 100, 1) if opt_score else 'N/A'}%",
        "",
    ]

    # ── Campaign summary ─────────────────────────────────────
    total_cost_c = sum(c.get("cost_curr", 0) for c in campaigns)
    total_cost_p = sum(c.get("cost_prev", 0) for c in campaigns)
    total_clicks_c = sum(c.get("clicks_curr", 0) for c in campaigns)
    total_conv_c   = sum(c.get("conversions_curr", 0) for c in campaigns)
    total_val_c    = sum(c.get("conv_value_curr", 0) for c in campaigns)
    total_impr_c   = sum(c.get("impressions_curr", 0) for c in campaigns)

    cost_delta  = safe_div(total_cost_c - total_cost_p, total_cost_p) if total_cost_p else None
    delta_str   = f"{round(cost_delta*100,1):+.1f}%" if cost_delta is not None else "N/A"

    active_campaigns = [c for c in campaigns if c.get("status") == "ENABLED"]

    lines += [
        "---",
        "## 1. Campaign Performance",
        "",
        f"| Metric | Current 30d | Previous 30d | Δ |",
        f"|--------|------------|--------------|---|",
        f"| Spend | {round(total_cost_c,2):,} SEK | {round(total_cost_p,2):,} SEK | {delta_str} |",
        f"| Impressions | {total_impr_c:,} | - | - |",
        f"| Clicks | {total_clicks_c:,} | - | - |",
        f"| Conversions | {round(total_conv_c,2)} | - | - |",
        f"| Conv. Value | {round(total_val_c,2):,} SEK | - | - |",
        f"| ROAS | {round(total_val_c/total_cost_c,2) if total_cost_c else 'N/A'} | - | - |",
        f"| CPA | {round(total_cost_c/total_conv_c,2) if total_conv_c else 'N/A'} | - | - |",
        "",
        f"**Active campaigns:** {len(active_campaigns)} / {len(campaigns)}",
        "",
    ]

    # Per-campaign table
    if campaigns:
        lines += ["### Per Campaign (Current Period)", ""]
        lines.append("| Campaign | Status | Spend | Clicks | Conv | CPA | ROAS | IS | IS Lost Budget | IS Lost Rank |")
        lines.append("|----------|--------|-------|--------|------|-----|------|----|----------------|--------------|")
        for c in sorted(campaigns, key=lambda x: -x.get("cost_curr", 0))[:20]:
            is_pct   = f"{round(c.get('impression_share',0)*100,1)}%" if c.get('impression_share') else "N/A"
            isl_b    = f"{round(c.get('is_lost_budget',0)*100,1)}%" if c.get('is_lost_budget') else "N/A"
            isl_r    = f"{round(c.get('is_lost_rank',0)*100,1)}%" if c.get('is_lost_rank') else "N/A"
            lines.append(
                f"| {c['campaign_name'][:40]} | {c['status']} | {c['cost_curr']:,} | {c['clicks_curr']:,} | "
                f"{c['conversions_curr']} | {c['cpa_curr']} | {c['roas_curr']} | {is_pct} | {isl_b} | {isl_r} |"
            )
        lines.append("")

    # ── Quality Score ────────────────────────────────────────
    low_qs = [k for k in qs_data if k.get("quality_score") not in ("N/A", None, "") and isinstance(k.get("quality_score"), int) and k["quality_score"] < 5]
    avg_qs_vals = [k["quality_score"] for k in qs_data if isinstance(k.get("quality_score"), int)]
    avg_qs = round(sum(avg_qs_vals)/len(avg_qs_vals), 1) if avg_qs_vals else "N/A"

    lines += [
        "---",
        "## 2. Quality Score",
        "",
        f"- **Total keywords analyzed:** {len(qs_data)}",
        f"- **Average QS:** {avg_qs}",
        f"- **Keywords with QS < 5:** {len(low_qs)}",
        "",
    ]
    if low_qs:
        lines.append("### Low QS Keywords (< 5)")
        lines.append("")
        lines.append("| Keyword | Match | QS | Expected CTR | Ad Relevance | LP Experience | Cost | Campaign |")
        lines.append("|---------|-------|----|--------------|--------------|---------------|------|----------|")
        for k in sorted(low_qs, key=lambda x: x["quality_score"])[:30]:
            lines.append(
                f"| {k['keyword']} | {k['match_type']} | **{k['quality_score']}** | "
                f"{k['expected_ctr']} | {k['ad_relevance']} | {k['landing_page_exp']} | "
                f"{k['cost']} | {k['campaign'][:30]} |"
            )
        lines.append("")
        lines += [
            "**Improvement suggestions for low QS keywords:**",
            "- **Expected CTR = BELOW_AVERAGE**: Add keyword to headline 1. Check search term relevance.",
            "- **Ad Relevance = BELOW_AVERAGE**: Create dedicated ad groups per keyword theme. Mirror keyword in headline.",
            "- **LP Experience = BELOW_AVERAGE**: Align landing page copy with keyword intent. Improve page speed.",
            "",
        ]

    # ── RSA Assets ───────────────────────────────────────────
    disapproved_rsa = [r for r in rsa_data if r.get("approval_status") == "DISAPPROVED"]
    ltd_rsa         = [r for r in rsa_data if r.get("approval_status") == "APPROVED_LIMITED"]
    best_assets     = [r for r in rsa_data if r.get("performance") == "BEST"]
    low_assets      = [r for r in rsa_data if r.get("performance") in ("LOW", "POOR")]

    lines += [
        "---",
        "## 3. RSA Asset Performance",
        "",
        f"- **Total asset rows:** {len(rsa_data)}",
        f"- **BEST performing assets:** {len(best_assets)}",
        f"- **LOW/POOR performing assets:** {len(low_assets)}",
        f"- **Disapproved ads:** {len(disapproved_rsa)}",
        f"- **Limited approval ads:** {len(ltd_rsa)}",
        "",
    ]
    if best_assets:
        lines.append("### BEST Assets (keep these)")
        lines.append("")
        lines.append("| Type | Text | Campaign |")
        lines.append("|------|------|----------|")
        for a in best_assets[:15]:
            lines.append(f"| {a['asset_type']} | {a['asset_text'][:60]} | {a['campaign'][:30]} |")
        lines.append("")
    if low_assets:
        lines.append("### LOW/POOR Assets (replace or test)")
        lines.append("")
        lines.append("| Type | Text | Campaign |")
        lines.append("|------|------|----------|")
        for a in low_assets[:15]:
            lines.append(f"| {a['asset_type']} | {a['asset_text'][:60]} | {a['campaign'][:30]} |")
        lines.append("")
    if disapproved_rsa:
        lines.append("### Disapproved Ads – Policy Issues")
        lines.append("")
        lines.append("| Campaign | Ad Group | Asset Type | Text | Policy Issue |")
        lines.append("|----------|----------|------------|------|--------------|")
        seen = set()
        for a in disapproved_rsa:
            key = (a['ad_id'], a['policy_issues'])
            if key in seen: continue
            seen.add(key)
            lines.append(f"| {a['campaign'][:30]} | {a['ad_group'][:25]} | {a['asset_type']} | {a['asset_text'][:50]} | {a['policy_issues'][:60]} |")
        lines.append("")

    # ── Device / Hour / DOW ──────────────────────────────────
    device_rows = segmented.get("device", [])
    hour_rows   = segmented.get("hour", [])
    dow_rows    = segmented.get("dow", [])

    lines += [
        "---",
        "## 4. Device / Hour / Day-of-Week",
        "",
        "### 4a. Device Performance",
        "",
    ]
    if device_rows:
        device_agg = defaultdict(lambda: {"cost":0,"clicks":0,"impressions":0,"conversions":0,"conv_value":0})
        for r in device_rows:
            d = r["device"]
            device_agg[d]["cost"]        += r["cost"]
            device_agg[d]["clicks"]      += r["clicks"]
            device_agg[d]["impressions"] += r["impressions"]
            device_agg[d]["conversions"] += r["conversions"]
            device_agg[d]["conv_value"]  += r["conv_value"]
        lines.append("| Device | Cost | Clicks | CTR | Conv | CPA | ROAS |")
        lines.append("|--------|------|--------|-----|------|-----|------|")
        for dev, d in sorted(device_agg.items(), key=lambda x: -x[1]["cost"]):
            cost = d["cost"]; clicks = d["clicks"]; impr = d["impressions"]
            conv = d["conversions"]; val = d["conv_value"]
            ctr  = round(safe_div(clicks, impr)*100, 2) if safe_div(clicks, impr) else 0
            cpa  = round(safe_div(cost, conv), 2) if safe_div(cost, conv) else "N/A"
            roas = round(safe_div(val, cost), 2) if safe_div(val, cost) else "N/A"
            lines.append(f"| {dev} | {round(cost,2):,} | {clicks:,} | {ctr}% | {round(conv,2)} | {cpa} | {roas} |")
        lines.append("")

    lines.append("### 4b. Hour-of-Day Performance")
    lines.append("")
    if hour_rows:
        lines.append("| Hour | Cost | Clicks | Conv | CPA | ROAS |")
        lines.append("|------|------|--------|------|-----|------|")
        for h in hour_rows:
            lines.append(f"| {h['hour']:02d}:00 | {h['cost']:,} | {h['clicks']:,} | {h['conversions']} | {h['cpa']} | {h['roas']} |")
        lines.append("")

    lines.append("### 4c. Day-of-Week Performance")
    lines.append("")
    if dow_rows:
        lines.append("| Day | Cost | Clicks | Conv | CPA | ROAS |")
        lines.append("|-----|------|--------|------|-----|------|")
        for d in dow_rows:
            lines.append(f"| {d['day_of_week']} | {d['cost']:,} | {d['clicks']:,} | {d['conversions']} | {d['cpa']} | {d['roas']} |")
        lines.append("")

    # ── Landing Pages ────────────────────────────────────────
    low_cvr_lp = [l for l in lp_data if l.get("flag") == "LOW CVR"]
    lines += [
        "---",
        "## 5. Landing Page Comparison",
        "",
        f"- **Total URLs:** {len(lp_data)}",
        f"- **Low CVR pages (< 1%):** {len(low_cvr_lp)}",
        "",
    ]
    if lp_data:
        lines.append("| URL | Cost | Clicks | Conv | CVR | CPA | ROAS | Flag |")
        lines.append("|-----|------|--------|------|-----|-----|------|------|")
        for l in lp_data[:20]:
            url_short = l["final_url"][-60:] if len(l["final_url"]) > 60 else l["final_url"]
            lines.append(
                f"| ...{url_short} | {l['cost']:,} | {l['clicks']:,} | {l['conversions']} | "
                f"{l['conv_rate']}% | {l['cpa']} | {l['roas']} | {l['flag']} |"
            )
        lines.append("")

    # ── Search Terms ─────────────────────────────────────────
    neg_suggestions = [s for s in st_data if s.get("neg_suggestion")]
    converting_terms = [s for s in st_data if s.get("has_conversion") == "YES"]
    total_wasted = sum(s["cost"] for s in neg_suggestions)

    lines += [
        "---",
        "## 6. Search Terms Review",
        "",
        f"- **Total search terms:** {len(st_data)}",
        f"- **Converting terms (protect):** {len(converting_terms)}",
        f"- **Negative keyword suggestions:** {len(neg_suggestions)}",
        f"- **Estimated wasted spend:** {round(total_wasted, 2):,} SEK",
        "",
    ]
    if neg_suggestions:
        lines.append("### Negative Keyword Suggestions")
        lines.append("")
        lines.append("| Search Term | Match Type | Reason | Risk | Cost | Campaign |")
        lines.append("|-------------|------------|--------|------|------|----------|")
        for s in sorted(neg_suggestions, key=lambda x: -x["cost"])[:40]:
            lines.append(
                f"| {s['neg_suggestion'][:40]} | {s['suggested_match_type']} | "
                f"{s['neg_reason']} | {s['risk_level']} | {s['cost']} | {s['campaign'][:30]} |"
            )
        lines.append("")

    # ── Policy ───────────────────────────────────────────────
    policy_rows = policy_data
    disapproved_p = [r for r in policy_rows if r.get("approval_status") == "DISAPPROVED"]
    limited_p     = [r for r in policy_rows if r.get("approval_status") == "APPROVED_LIMITED"]

    # Group by topic
    topic_counts = defaultdict(int)
    for r in policy_rows:
        if r.get("policy_topic"):
            topic_counts[r["policy_topic"]] += 1

    lines += [
        "---",
        "## 7. Policy / Suspension Review",
        "",
        f"- **Account status:** `{account_info.get('status','?')}`",
        f"- **Disapproved ads/assets:** {len(disapproved_p)}",
        f"- **Limited approval ads/assets:** {len(limited_p)}",
        "",
    ]

    if topic_counts:
        lines.append("### Policy Topics Found")
        lines.append("")
        lines.append("| Policy Topic | Count |")
        lines.append("|--------------|-------|")
        for topic, cnt in sorted(topic_counts.items(), key=lambda x: -x[1]):
            lines.append(f"| {topic} | {cnt} |")
        lines.append("")

    if disapproved_p:
        lines.append("### Disapproved Ads (Detail)")
        lines.append("")
        lines.append("| Campaign | Ad Group | Policy Topic | Violation Type | Evidence | URL |")
        lines.append("|----------|----------|--------------|----------------|----------|-----|")
        seen = set()
        for r in disapproved_p[:30]:
            key = (r["ad_id"], r["policy_topic"])
            if key in seen: continue
            seen.add(key)
            url_s = r["final_url"][-40:] if r["final_url"] else ""
            lines.append(
                f"| {r['campaign'][:30]} | {r['ad_group'][:25]} | {r['policy_topic']} | "
                f"{r['violation_type']} | {r['evidence'][:40]} | ...{url_s} |"
            )
        lines.append("")

    # Policy action items
    lines += [
        "### Policy Action Plan",
        "",
        "#### Tobacco / Restricted Products",
        "- If any ad or landing page references tobacco, nicotine, or related products: remove or qualify claims",
        "- Use Google's approved language for restricted health/nicotine products",
        "- Verify landing page does not contain health claims, testimonials, or age-gating issues",
        "",
        "#### Destination Not Accessible / Landing Page Access",
        "- Test all final URLs from incognito mode",
        "- Check for geo-blocking, login walls, or 404/5xx errors",
        "- Use Google's Ad Preview Tool to simulate ad display",
        "",
        "#### Disapproved Ads – Immediate Steps",
        "1. Review each disapproved ad in Google Ads UI",
        "2. Edit the ad copy to remove policy-violating language",
        "3. If the policy is contestable, submit an appeal via the Policy Manager",
        "4. For landing page issues: fix the URL, then re-submit the ad for review",
        "",
        "#### Account Suspension Appeal (if applicable)",
        "1. Go to Google Ads → Help → Contact Support",
        "2. Select 'Account Access, Suspensions & Verification'",
        "3. Provide business verification documents",
        "4. Describe changes made to comply with policies",
        "5. Request re-review",
        "",
    ]

    # ── Health Score & Executive Summary ─────────────────────
    health_score = 10
    critical_issues = []
    high_priority   = []
    medium_priority = []
    scaling_ops     = []
    what_works      = []

    # Deduct for account status
    if acc_status in ("SUSPENDED", "CANCELED"):
        health_score -= 4
        critical_issues.append(f"Account is **{acc_status}** – no ads are serving")
    elif acc_status == "ENABLED" and len(disapproved_p) > 5:
        health_score -= 2
        critical_issues.append(f"{len(disapproved_p)} disapproved ads are blocking impressions")

    if len(low_qs) > 5:
        health_score -= 1
        high_priority.append(f"{len(low_qs)} keywords with Quality Score < 5 – wasting budget")

    if total_wasted > 100:
        health_score -= 1
        high_priority.append(f"{round(total_wasted,0):,} SEK estimated wasted spend on irrelevant search terms")

    if len(low_cvr_lp) > 0:
        health_score -= 0.5
        medium_priority.append(f"{len(low_cvr_lp)} landing pages with CVR < 1%")

    if len(low_assets) > 0:
        medium_priority.append(f"{len(low_assets)} low/poor RSA assets – replace with new copy variants")

    health_score = max(1, round(health_score))

    # Impression share signals
    for c in campaigns:
        if c.get("is_lost_budget") and c["is_lost_budget"] > 0.2:
            scaling_ops.append(f"Campaign '{c['campaign_name'][:30]}' loses {round(c['is_lost_budget']*100,0)}% IS by budget – increase budget for more volume")

    # What works
    for c in campaigns:
        if c.get("roas_curr") and isinstance(c["roas_curr"], (int, float)) and c["roas_curr"] > 3:
            what_works.append(f"Campaign '{c['campaign_name'][:30]}' has ROAS {c['roas_curr']} – do not change structure")

    if best_assets:
        what_works.append(f"{len(best_assets)} RSA assets rated BEST – keep and protect")

    lines_exec = [
        "---",
        "## Executive Summary",
        "",
        f"**Account:** ZAF Group AB (1648504493)  |  **Audit Date:** {today_str}",
        "",
        f"### Account Health Score: {health_score}/10",
        "",
    ]

    if critical_issues:
        lines_exec += ["### CRITICAL – Fix Today", ""]
        for i in critical_issues:
            lines_exec.append(f"- {i}")
        lines_exec.append("")

    if high_priority:
        lines_exec += ["### HIGH PRIORITY – Fix This Week", ""]
        for i in high_priority:
            lines_exec.append(f"- {i}")
        lines_exec.append("")

    if medium_priority:
        lines_exec += ["### MEDIUM PRIORITY – Fix This Month", ""]
        for i in medium_priority:
            lines_exec.append(f"- {i}")
        lines_exec.append("")

    if scaling_ops:
        lines_exec += ["### Scaling Opportunities (after policy resolved)", ""]
        for i in scaling_ops:
            lines_exec.append(f"- {i}")
        lines_exec.append("")

    if what_works:
        lines_exec += ["### What's Working – Do Not Change", ""]
        for i in what_works:
            lines_exec.append(f"- {i}")
        lines_exec.append("")

    lines_exec += [
        "### Concrete Action List for ZAF Group AB",
        "",
        "| # | Action | Priority | Owner |",
        "|---|--------|----------|-------|",
        "| 1 | Resolve all disapproved ads (edit copy, fix URLs, re-submit) | CRITICAL | Ads manager |",
        "| 2 | If account suspended: gather business docs and file appeal | CRITICAL | Account owner |",
        "| 3 | Audit all final URLs from incognito – fix broken/blocked pages | CRITICAL | Dev/Ads |",
        "| 4 | Review landing pages for policy-violating claims (health, tobacco) | CRITICAL | Content |",
        "| 5 | Add negative keywords from section 6 to campaign/ad-group level | HIGH | Ads manager |",
        "| 6 | Rewrite RSA headlines/descriptions with LOW performance | HIGH | Copywriter |",
        "| 7 | Fix keywords with QS < 5 (ad relevance + LP copy alignment) | HIGH | Ads manager |",
        "| 8 | Set device bid adjustments based on section 4a data | MEDIUM | Ads manager |",
        "| 9 | Set ad scheduling based on hour/day performance | MEDIUM | Ads manager |",
        "| 10 | A/B test new landing page variants for low-CVR URLs | MEDIUM | CRO/Dev |",
        "",
        "---",
        f"*Report generated: {today_str} | Data range: {PERIOD_START} – {PERIOD_END}*",
        "",
    ]

    return "\n".join(lines_exec + ["---", ""] + lines)


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
def main():
    print(f"=== ZAF Group AB Full Audit ===")
    print(f"Customer ID : {CUSTOMER_ID}")
    print(f"Period      : {PERIOD_START} to {PERIOD_END}")
    print(f"Prev period : {PREV_START} to {PREV_END}")
    print(f"Reports dir : {REPORTS_DIR}/")

    client = get_client()

    campaigns     = section_campaigns(client)
    qs_data       = section_quality_score(client)
    rsa_data      = section_rsa_assets(client)
    segmented     = section_segmented(client)
    lp_data       = section_landing_pages(client)
    st_data       = section_search_terms(client)
    policy_data, account_info = section_policy(client)

    print("\n[Building report...]")
    md = build_report(campaigns, qs_data, rsa_data, segmented, lp_data, st_data, policy_data, account_info)

    md_file = f"{REPORTS_DIR}/zaf_full_audit_{TIMESTAMP}.md"
    with open(md_file, "w", encoding="utf-8") as f:
        f.write(md)

    print(f"\n=== AUDIT COMPLETE ===")
    print(f"Markdown report : {md_file}")
    print(f"CSV files       : {REPORTS_DIR}/zaf_1_campaigns.csv – zaf_7_policy.csv")
    print("\n" + "="*60)
    # Print executive summary to console
    for line in md.split("\n")[:80]:
        print(line)


if __name__ == "__main__":
    main()
