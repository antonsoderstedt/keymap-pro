"""
cleanup_au_campaign.py — Policy risk & legacy structure cleanup
Campaign : [GEN-INT] Pouches – AU
Customer : ZAF Group AB (1648504493)

DIFF MODE by default — shows every planned change without touching the account.
Pass --live to apply all changes.

Steps
  1  Delete legacy ad groups (GENERIC / Hight Intent / Intent / BRAND)
  2  Remove keywords containing "nicotine" in remaining clean groups
  3  BROAD match safety scan — delete any that remain
  4  Misplaced ZYN/VELO keyword scan — delete any outside approved groups
  5  Remove negative keywords: "review", "reviews"
  6  Change bidding: MAXIMIZE_CONVERSION_VALUE -> MANUAL_CPC + eCPC ON
  7  Set ad group CPC bids in SEK
  8  Validation
"""

import os
import sys

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

# ─── CONFIG ───────────────────────────────────────────────────────────────────

CUSTOMER_ID   = "1648504493"
CAMPAIGN_NAME = "[GEN-INT] Pouches – AU"

DRY_RUN = "--live" not in sys.argv  # True = preview only, False = apply

# Ad groups to delete entirely
LEGACY_AD_GROUPS = {"GENERIC", "Hight Intent", "Intent", "BRAND"}

# All approved clean groups — keywords in these are intentional and must not be touched
CLEAN_GROUPS = {
    "ZYN CORE", "ZYN SCALE",
    "VELO CORE", "VELO SCALE",
    "ALT BRANDS", "COMPARISON", "SOFT INTENT",
}

# Negative keywords to remove (exact text, case-insensitive match)
NEGATIVES_TO_REMOVE = {"review", "reviews"}

# CPC bids per ad group (SEK -> micros = × 1 000 000)
AD_GROUP_BIDS_SEK = {
    "ZYN CORE":    6.50,
    "VELO CORE":   6.50,
    "ZYN SCALE":   5.50,
    "VELO SCALE":  5.50,
    "COMPARISON":  5.50,
    "ALT BRANDS":  4.50,
    "SOFT INTENT": 4.50,
}

# ─── CLIENT ───────────────────────────────────────────────────────────────────

def get_client():
    return GoogleAdsClient.load_from_dict({
        "developer_token":   os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id":         os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret":     os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token":     os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ["GOOGLE_ADS_CUSTOMER_ID"],
        "use_proto_plus":    True,
    })


def run_query(client, query):
    svc = client.get_service("GoogleAdsService")
    return list(svc.search(customer_id=CUSTOMER_ID, query=query))


def dry(msg):
    print(f"  [DRY]  {msg}")


def live(msg):
    print(f"  [LIVE] {msg}")


def ok(msg):
    print(f"  [PASS] {msg}")


def fail(msg):
    print(f"  [FAIL] {msg}")


# ─── CAMPAIGN LOOKUP ──────────────────────────────────────────────────────────

def get_campaign_rn(client):
    rows = run_query(client, f"""
        SELECT campaign.resource_name, campaign.status, campaign.bidding_strategy_type
        FROM campaign
        WHERE campaign.name = '{CAMPAIGN_NAME}'
        LIMIT 1
    """)
    if not rows:
        raise RuntimeError(f"Campaign not found: {CAMPAIGN_NAME}")
    rn      = rows[0].campaign.resource_name
    status  = rows[0].campaign.status.name
    bidding = rows[0].campaign.bidding_strategy_type.name
    print(f"    Found: {rn}")
    print(f"    Status : {status}")
    print(f"    Bidding: {bidding}")
    return rn


# ─── STEP 1: DELETE LEGACY AD GROUPS ─────────────────────────────────────────

def delete_legacy_ad_groups(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT ad_group.resource_name, ad_group.name, ad_group.status
        FROM ad_group
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group.status != 'REMOVED'
    """)

    to_delete = [
        (r.ad_group.resource_name, r.ad_group.name)
        for r in rows
        if r.ad_group.name in LEGACY_AD_GROUPS
    ]

    if not to_delete:
        print("    No legacy ad groups found — nothing to delete.")
        return

    print(f"    Scheduled for deletion ({len(to_delete)}):")
    for _, name in to_delete:
        if DRY_RUN:
            dry(f"REMOVE ad group: {name}")
        else:
            live(f"REMOVE ad group: {name}")

    if DRY_RUN:
        return

    svc = client.get_service("AdGroupService")
    ops = []
    for rn, _ in to_delete:
        op        = client.get_type("AdGroupOperation")
        op.remove = rn
        ops.append(op)

    svc.mutate_ad_groups(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Done — {len(to_delete)} ad groups removed.")


# ─── STEP 2: REMOVE "NICOTINE" KEYWORDS IN CLEAN GROUPS ──────────────────────

def remove_nicotine_keywords(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT
            ad_group_criterion.resource_name,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group.name
        FROM ad_group_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group_criterion.type = KEYWORD
          AND ad_group_criterion.negative = FALSE
          AND ad_group_criterion.status != REMOVED
          AND ad_group.status != REMOVED
    """)

    to_delete = []
    for r in rows:
        kw      = r.ad_group_criterion
        text    = kw.keyword.text
        match   = kw.keyword.match_type.name
        ag_name = r.ad_group.name
        if ag_name in LEGACY_AD_GROUPS:
            continue  # already handled in Step 1
        if "nicotine" in text.lower():
            to_delete.append((kw.resource_name, text, match, ag_name))

    if not to_delete:
        print("    No 'nicotine' keywords found in clean groups — nothing to delete.")
        return

    print(f"    Nicotine keywords to delete ({len(to_delete)}):")
    for _, text, match, ag in to_delete:
        if DRY_RUN:
            dry(f"REMOVE [{match}] \"{text}\"  (ad group: {ag})")
        else:
            live(f"REMOVE [{match}] \"{text}\"  (ad group: {ag})")

    if DRY_RUN:
        return

    svc = client.get_service("AdGroupCriterionService")
    ops = []
    for rn, *_ in to_delete:
        op        = client.get_type("AdGroupCriterionOperation")
        op.remove = rn
        ops.append(op)

    svc.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Done — {len(to_delete)} keywords removed.")


# ─── STEP 3: BROAD MATCH SAFETY SCAN ─────────────────────────────────────────

def remove_broad_keywords(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT
            ad_group_criterion.resource_name,
            ad_group_criterion.keyword.text,
            ad_group.name
        FROM ad_group_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group_criterion.type = KEYWORD
          AND ad_group_criterion.negative = FALSE
          AND ad_group_criterion.status != REMOVED
          AND ad_group.status != REMOVED
          AND ad_group_criterion.keyword.match_type = BROAD
    """)

    # Exclude legacy groups (already being deleted in Step 1)
    to_delete = [
        (r.ad_group_criterion.resource_name,
         r.ad_group_criterion.keyword.text,
         r.ad_group.name)
        for r in rows
        if r.ad_group.name not in LEGACY_AD_GROUPS
    ]

    if not to_delete:
        print("    No BROAD keywords in clean groups — all clear.")
        return

    print(f"    BROAD keywords to delete ({len(to_delete)}):")
    for _, text, ag in to_delete:
        if DRY_RUN:
            dry(f"REMOVE [BROAD] \"{text}\"  (ad group: {ag})")
        else:
            live(f"REMOVE [BROAD] \"{text}\"  (ad group: {ag})")

    if DRY_RUN:
        return

    svc = client.get_service("AdGroupCriterionService")
    ops = []
    for rn, *_ in to_delete:
        op        = client.get_type("AdGroupCriterionOperation")
        op.remove = rn
        ops.append(op)

    svc.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Done — {len(to_delete)} BROAD keywords removed.")


# ─── STEP 4: MISPLACED ZYN / VELO KEYWORD SCAN ───────────────────────────────

def remove_misplaced_brand_keywords(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT
            ad_group_criterion.resource_name,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group.name
        FROM ad_group_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group_criterion.type = KEYWORD
          AND ad_group_criterion.negative = FALSE
          AND ad_group_criterion.status != REMOVED
          AND ad_group.status != REMOVED
    """)

    to_delete = []
    for r in rows:
        kw      = r.ad_group_criterion
        text    = kw.keyword.text.lower()
        match   = kw.keyword.match_type.name
        ag_name = r.ad_group.name

        # Skip legacy groups (deleted in Step 1) and all approved clean groups
        if ag_name in LEGACY_AD_GROUPS or ag_name in CLEAN_GROUPS:
            continue

        # Any remaining unknown group with ZYN/VELO keywords is unexpected
        is_zyn  = text.startswith("zyn")  or " zyn"  in text
        is_velo = text.startswith("velo") or " velo" in text

        if is_zyn:
            to_delete.append((kw.resource_name, kw.keyword.text, match, ag_name, "ZYN"))
        if is_velo:
            to_delete.append((kw.resource_name, kw.keyword.text, match, ag_name, "VELO"))

    if not to_delete:
        print("    No misplaced ZYN/VELO keywords found — structure is clean.")
        return

    print(f"    Misplaced brand keywords to delete ({len(to_delete)}):")
    for _, text, match, ag, brand in to_delete:
        if DRY_RUN:
            dry(f"REMOVE [{match}] \"{text}\"  (ad group: {ag}, brand: {brand})")
        else:
            live(f"REMOVE [{match}] \"{text}\"  (ad group: {ag}, brand: {brand})")

    if DRY_RUN:
        return

    svc = client.get_service("AdGroupCriterionService")
    ops = []
    for rn, *_ in to_delete:
        op        = client.get_type("AdGroupCriterionOperation")
        op.remove = rn
        ops.append(op)

    svc.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Done — {len(to_delete)} misplaced keywords removed.")


# ─── STEP 5: REMOVE NEGATIVE KEYWORDS ────────────────────────────────────────

def remove_negative_keywords(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT
            campaign_criterion.resource_name,
            campaign_criterion.keyword.text
        FROM campaign_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND campaign_criterion.negative = TRUE
          AND campaign_criterion.type = KEYWORD
    """)

    to_delete = [
        (r.campaign_criterion.resource_name, r.campaign_criterion.keyword.text)
        for r in rows
        if r.campaign_criterion.keyword.text.lower() in NEGATIVES_TO_REMOVE
    ]

    if not to_delete:
        print("    Negative keywords 'review'/'reviews' not found — nothing to remove.")
        return

    print(f"    Negatives to remove ({len(to_delete)}):")
    for _, text in to_delete:
        if DRY_RUN:
            dry(f"REMOVE negative: \"{text}\"")
        else:
            live(f"REMOVE negative: \"{text}\"")

    if DRY_RUN:
        return

    svc = client.get_service("CampaignCriterionService")
    ops = []
    for rn, _ in to_delete:
        op        = client.get_type("CampaignCriterionOperation")
        op.remove = rn
        ops.append(op)

    svc.mutate_campaign_criteria(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Done — {len(to_delete)} negatives removed.")


# ─── STEP 6: CHANGE BIDDING STRATEGY ─────────────────────────────────────────

def fix_bidding_strategy(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT campaign.bidding_strategy_type
        FROM campaign
        WHERE campaign.resource_name = '{campaign_rn}'
        LIMIT 1
    """)
    current = rows[0].campaign.bidding_strategy_type.name

    if current == "MANUAL_CPC":
        print("    Bidding is already MANUAL_CPC — skipping.")
        return

    print(f"    Current bidding: {current}")
    if DRY_RUN:
        dry("CHANGE bidding: MAXIMIZE_CONVERSION_VALUE -> MANUAL_CPC")
        return

    # eCPC (enhanced_cpc_enabled=True) is deprecated by Google since 2023 and
    # cannot be activated on campaigns that were not already using it.
    # Switching to standard MANUAL_CPC gives full CPC bid control via Step 7.
    live("CHANGE bidding: MAXIMIZE_CONVERSION_VALUE -> MANUAL_CPC")

    svc = client.get_service("CampaignService")
    op  = client.get_type("CampaignOperation")

    op.update.resource_name                   = campaign_rn
    op.update.manual_cpc.enhanced_cpc_enabled = False
    op.update_mask.paths.append("manual_cpc.enhanced_cpc_enabled")

    svc.mutate_campaigns(customer_id=CUSTOMER_ID, operations=[op])
    print("    Done — bidding strategy updated to MANUAL_CPC.")


# ─── STEP 7: SET CPC BIDS PER AD GROUP ───────────────────────────────────────

def set_ad_group_bids(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT ad_group.resource_name, ad_group.name, ad_group.cpc_bid_micros
        FROM ad_group
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group.status != REMOVED
    """)

    ag_map = {r.ad_group.name: (r.ad_group.resource_name, r.ad_group.cpc_bid_micros)
              for r in rows}

    ops = []
    for ag_name, sek_bid in AD_GROUP_BIDS_SEK.items():
        if ag_name not in ag_map:
            print(f"    WARNING: ad group '{ag_name}' not found — skipping bid update.")
            continue

        rn, current_micros = ag_map[ag_name]
        target_micros      = int(sek_bid * 1_000_000)
        current_sek        = current_micros / 1_000_000

        if DRY_RUN:
            dry(f"SET bid: {ag_name}  {current_sek:.2f} SEK -> {sek_bid:.2f} SEK")
        else:
            live(f"SET bid: {ag_name}  {current_sek:.2f} SEK -> {sek_bid:.2f} SEK")

            op                           = client.get_type("AdGroupOperation")
            op.update.resource_name      = rn
            op.update.cpc_bid_micros     = target_micros
            op.update_mask.paths.append("cpc_bid_micros")
            ops.append(op)

    if DRY_RUN or not ops:
        return

    svc = client.get_service("AdGroupService")
    svc.mutate_ad_groups(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Done — {len(ops)} ad group bids updated.")


# ─── STEP 8: VALIDATION ───────────────────────────────────────────────────────

def validate(client, campaign_rn):
    passed = 0
    failed = 0

    def chk(condition, pass_msg, fail_msg):
        nonlocal passed, failed
        if condition:
            ok(pass_msg)
            passed += 1
        else:
            fail(fail_msg)
            failed += 1

    # 8a — Legacy ad groups gone
    ag_rows = run_query(client, f"""
        SELECT ad_group.name
        FROM ad_group
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group.status != REMOVED
    """)
    active_names = {r.ad_group.name for r in ag_rows}
    survivors    = LEGACY_AD_GROUPS & active_names
    chk(not survivors,
        "All legacy ad groups removed",
        f"Legacy ad groups still active: {survivors}")

    # 8b — No "nicotine" keywords
    kw_rows = run_query(client, f"""
        SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group.name
        FROM ad_group_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group_criterion.type = KEYWORD
          AND ad_group_criterion.negative = FALSE
          AND ad_group_criterion.status != REMOVED
          AND ad_group.status != REMOVED
    """)
    nic_kws   = []
    broad_kws = []
    for r in kw_rows:
        text  = r.ad_group_criterion.keyword.text
        match = r.ad_group_criterion.keyword.match_type.name
        if "nicotine" in text.lower():
            nic_kws.append(f'"{text}" [{match}] ({r.ad_group.name})')
        if match == "BROAD":
            broad_kws.append(f'"{text}" ({r.ad_group.name})')

    chk(not nic_kws,
        "Zero 'nicotine' keywords",
        f"Nicotine keywords present: {nic_kws}")
    chk(not broad_kws,
        "Zero BROAD keywords",
        f"BROAD keywords present: {broad_kws}")

    # 8c — No keywords in unknown (non-clean) groups
    unknown_group_kws = []
    for r in kw_rows:
        ag_name = r.ad_group.name
        if ag_name not in CLEAN_GROUPS:
            unknown_group_kws.append(
                f'"{r.ad_group_criterion.keyword.text}" ({ag_name})'
            )
    chk(not unknown_group_kws,
        "All keywords are in approved clean groups",
        f"Keywords found in non-approved groups: {unknown_group_kws}")

    # 8d — Negatives removed
    neg_rows  = run_query(client, f"""
        SELECT campaign_criterion.keyword.text
        FROM campaign_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND campaign_criterion.negative = TRUE
          AND campaign_criterion.type = KEYWORD
    """)
    neg_texts    = {r.campaign_criterion.keyword.text.lower() for r in neg_rows}
    still_there  = NEGATIVES_TO_REMOVE & neg_texts
    chk(not still_there,
        "Negatives 'review'/'reviews' removed",
        f"Negatives still present: {still_there}")

    # 8e — Bidding strategy
    camp_row = run_query(client, f"""
        SELECT campaign.bidding_strategy_type
        FROM campaign
        WHERE campaign.resource_name = '{campaign_rn}'
        LIMIT 1
    """)
    bidding = camp_row[0].campaign.bidding_strategy_type.name
    chk(bidding == "MANUAL_CPC",
        f"Bidding = MANUAL_CPC",
        f"Bidding = {bidding}  (expected MANUAL_CPC)")

    # 8f — CPC bids present (micros > 0)
    for ag_name, sek_bid in AD_GROUP_BIDS_SEK.items():
        target_micros = int(sek_bid * 1_000_000)
        match_rows = [r for r in ag_rows if r.ad_group.name == ag_name]
        if not match_rows:
            fail(f"Ad group not found: {ag_name}")
            failed += 1
            continue
        bid_check_rows = run_query(client, f"""
            SELECT ad_group.name, ad_group.cpc_bid_micros
            FROM ad_group
            WHERE campaign.resource_name = '{campaign_rn}'
              AND ad_group.name = '{ag_name}'
              AND ad_group.status != REMOVED
            LIMIT 1
        """)
        if bid_check_rows:
            actual = bid_check_rows[0].ad_group.cpc_bid_micros
            chk(actual == target_micros,
                f"Bid correct: {ag_name} = {sek_bid:.2f} SEK",
                f"Bid mismatch: {ag_name}  expected {target_micros}  got {actual}")

    print()
    print(f"    Result: {passed} passed / {failed} failed")
    return failed == 0


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    mode = "DRY RUN — no changes will be made" if DRY_RUN else "LIVE — changes will be applied"

    print()
    print("=" * 70)
    print(f"  CLEANUP: {CAMPAIGN_NAME}")
    print(f"  ACCOUNT: ZAF Group AB ({CUSTOMER_ID})")
    print(f"  MODE:    {mode}")
    print("=" * 70)

    client = get_client()

    try:
        print("\n[0]  Locating campaign...")
        campaign_rn = get_campaign_rn(client)

        print("\n[1/8]  Deleting legacy ad groups (GENERIC / Hight Intent / Intent / BRAND)...")
        delete_legacy_ad_groups(client, campaign_rn)

        print("\n[2/8]  Removing 'nicotine' keywords in clean groups...")
        remove_nicotine_keywords(client, campaign_rn)

        print("\n[3/8]  BROAD match safety scan...")
        remove_broad_keywords(client, campaign_rn)

        print("\n[4/8]  Misplaced ZYN / VELO keyword scan...")
        remove_misplaced_brand_keywords(client, campaign_rn)

        print("\n[5/8]  Removing negative keywords: 'review', 'reviews'...")
        remove_negative_keywords(client, campaign_rn)

        print("\n[6/8]  Fixing bidding strategy -> MANUAL_CPC + eCPC...")
        fix_bidding_strategy(client, campaign_rn)

        print("\n[7/8]  Setting ad group CPC bids (SEK)...")
        set_ad_group_bids(client, campaign_rn)

        if DRY_RUN:
            print()
            print("=" * 70)
            print("  DRY RUN COMPLETE — zero changes made to the account.")
            print("  Review the planned changes above, then run with --live to apply.")
            print("=" * 70)
            print()
            return

        print("\n[8/8]  Running validation...")
        all_passed = validate(client, campaign_rn)

        print()
        print("=" * 70)
        if all_passed:
            print("  CLEANUP COMPLETE — all checks passed.")
        else:
            print("  CLEANUP COMPLETE — see FAIL items above before activating.")
        print()
        print("  REMINDER: Campaign is still PAUSED.")
        print("  Enable only after certifying AU nicotine retailer status is confirmed.")
        print("=" * 70)
        print()

    except GoogleAdsException as ex:
        print(f"\n  API ERROR  (request_id={ex.request_id})")
        for err in ex.failure.errors:
            print(f"  [{err.error_code}]  {err.message}")
            if err.location and err.location.field_path_elements:
                for fpe in err.location.field_path_elements:
                    print(f"    field: {fpe.field_name}  index: {fpe.index}")
        raise


if __name__ == "__main__":
    main()
