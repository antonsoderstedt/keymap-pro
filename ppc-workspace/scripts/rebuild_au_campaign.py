"""
rebuild_au_campaign.py — Full policy-compliant rebuild of [GEN-INT] Pouches – AU
Customer: ZAF Group AB (164-850-4493)

Campaign stays PAUSED throughout. Nothing will serve until you explicitly enable it.

Steps executed:
  1  Remove all BROAD match keywords + any keyword containing "nicotine pouches"
     or "nic pouches" (includes singular "nicotine pouch")
  2  Delete all existing RSAs
  3  Create 7 new ad groups
  4  Add new keywords (PHRASE + EXACT only)
  5  Create new compliant RSAs in each new ad group
  6  Update campaign-level negatives (remove legal/laws/prescription/tga, add new ones)
  7  Pause old ad groups (Generic / Hight Intent / Brand / Intent)
  8  Validate
"""

import os
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

CUSTOMER_ID  = "1648504493"
CAMPAIGN_NAME = "[GEN-INT] Pouches – AU"
FINAL_URL     = "https://get.cheapestpouches.com/"

# ─── NEW AD GROUP + KEYWORD DEFINITIONS ──────────────────────────────────────
# PHRASE = strings in "phrase" list
# EXACT  = strings in "exact" list

NEW_AD_GROUPS = {
    "ZYN CORE": {
        "phrase": ["zyn", "zyn australia", "zyn pouches", "zyn aus", "zyn nicotine"],
        "exact":  ["zyn", "zyn australia", "zyn pouches"],
    },
    "ZYN MODIFIERS": {
        "phrase": [
            "zyn flavours", "zyn flavors", "zyn strength", "zyn strengths",
            "zyn strength levels", "strongest zyn", "best zyn flavours",
            "best zyn flavors", "zyn types", "zyn options", "zyn range", "zyn selection",
        ],
        "exact": [],
    },
    "VELO CORE": {
        "phrase": ["velo", "velo australia", "velo pouches", "velo aus"],
        "exact":  ["velo", "velo australia", "velo pouches"],
    },
    "VELO MODIFIERS": {
        "phrase": [
            "velo flavours", "velo flavors", "velo strength", "velo strengths",
            "strongest velo", "best velo flavours", "velo types", "velo options",
        ],
        "exact": [],
    },
    "ALT BRANDS": {
        "phrase": [
            "pablo pouches", "killa pouches", "xqs pouches",
            "pablo australia", "killa australia", "xqs australia",
        ],
        "exact": [],
    },
    "COMPARISON": {
        "phrase": [
            "zyn vs velo", "velo vs zyn", "zyn alternative", "velo alternative",
            "best pouch brands", "top pouch brands", "popular pouch brands",
        ],
        "exact": [],
    },
    "SOFT INTENT": {
        "phrase": [
            "zyn online australia", "velo online australia",
            "zyn availability australia", "velo availability australia",
            "zyn in australia", "velo in australia",
        ],
        "exact": [],
    },
}

# ─── COMPLIANT RSA COPY ───────────────────────────────────────────────────────

NEW_HEADLINES = [
    "Explore Popular Pouch Brands",
    "Compare ZYN & VELO Options",
    "Find Your Preferred Strength",
    "Discover Popular Flavours",
    "Top Rated Pouch Brands",
    "Explore Options in AU",
    "Compare Strength & Flavours",
    "Find the Right Fit for You",
]

NEW_DESCRIPTIONS = [
    "Explore popular pouch brands, strengths, and flavour options available to adult users.",
    "Compare leading brands and discover different strengths and flavour profiles.",
    "Browse a range of options and find what suits your preferences best.",
    "View available brands and explore different formats, strengths, and flavours.",
]

# ─── NEGATIVE KEYWORD CHANGES ─────────────────────────────────────────────────

NEGATIVES_TO_REMOVE = {"legal", "laws", "prescription", "tga"}

NEGATIVES_TO_ADD = [
    "cheap", "diy", "how to make", "recipe", "homemade", "quit smoking",
]

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


# ─── FIND CAMPAIGN ────────────────────────────────────────────────────────────

def get_campaign_rn(client):
    rows = run_query(client, f"""
        SELECT campaign.resource_name, campaign.status
        FROM campaign
        WHERE campaign.name = '{CAMPAIGN_NAME}'
        LIMIT 1
    """)
    if not rows:
        raise RuntimeError(f"Campaign not found: {CAMPAIGN_NAME}")
    rn     = rows[0].campaign.resource_name
    status = rows[0].campaign.status.name
    print(f"    Found: {rn}  [{status}]")
    return rn


# ─── STEP 1: REMOVE RESTRICTED KEYWORDS ──────────────────────────────────────

def _is_deletable(text, match_type):
    t = text.lower()
    if match_type == "BROAD":              # No broad match allowed at all
        return True
    if "nicotine pouches" in t:            # Explicit policy trigger (plural)
        return True
    if "nic pouches" in t:                 # Explicit policy trigger (abbreviated)
        return True
    if "nicotine pouch" in t:              # Singular form — same policy risk
        return True
    return False


def remove_bad_keywords(client, campaign_rn):
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
    for row in rows:
        kw    = row.ad_group_criterion
        text  = kw.keyword.text
        match = kw.keyword.match_type.name
        if _is_deletable(text, match):
            to_delete.append((kw.resource_name, text, match, row.ad_group.name))

    if not to_delete:
        print("    No restricted keywords found — nothing to delete.")
        return

    print(f"    Deleting {len(to_delete)} keywords:")
    for _, text, match, ag in to_delete:
        print(f"      [{match}] \"{text}\"  ({ag})")

    svc = client.get_service("AdGroupCriterionService")
    ops = []
    for rn, *_ in to_delete:
        op        = client.get_type("AdGroupCriterionOperation")
        op.remove = rn
        ops.append(op)

    for i in range(0, len(ops), 5000):
        svc.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=ops[i:i+5000])

    print(f"    Done — {len(to_delete)} keywords removed.")


# ─── STEP 2: DELETE ALL EXISTING RSAs ────────────────────────────────────────

def delete_all_rsa(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT ad_group_ad.resource_name, ad_group.name
        FROM ad_group_ad
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD
          AND ad_group_ad.status != REMOVED
    """)

    if not rows:
        print("    No RSAs found.")
        return

    print(f"    Deleting {len(rows)} RSAs:")
    for row in rows:
        print(f"      {row.ad_group_ad.resource_name}  ({row.ad_group.name})")

    svc = client.get_service("AdGroupAdService")
    ops = []
    for row in rows:
        op        = client.get_type("AdGroupAdOperation")
        op.remove = row.ad_group_ad.resource_name
        ops.append(op)

    svc.mutate_ad_group_ads(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Done — {len(rows)} RSAs deleted.")


# ─── STEP 3: CREATE NEW AD GROUPS ────────────────────────────────────────────

def create_new_ad_groups(client, campaign_rn):
    svc    = client.get_service("AdGroupService")
    ag_rns = {}

    # Fetch any already-created new ad groups (handles script re-runs)
    existing_rows = run_query(client, f"""
        SELECT ad_group.resource_name, ad_group.name
        FROM ad_group
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group.status != REMOVED
    """)
    existing_map = {row.ad_group.name: row.ad_group.resource_name for row in existing_rows}

    for ag_name in NEW_AD_GROUPS:
        if ag_name in existing_map:
            ag_rns[ag_name] = existing_map[ag_name]
            print(f"    Already exists: {ag_name}  ->  {existing_map[ag_name]}")
            continue

        op         = client.get_type("AdGroupOperation")
        a          = op.create
        a.name     = ag_name
        a.campaign = campaign_rn
        a.status   = client.enums.AdGroupStatusEnum.ENABLED
        a.type_    = client.enums.AdGroupTypeEnum.SEARCH_STANDARD

        resp            = svc.mutate_ad_groups(customer_id=CUSTOMER_ID, operations=[op])
        rn              = resp.results[0].resource_name
        ag_rns[ag_name] = rn
        print(f"    Created: {ag_name}  ->  {rn}")

    return ag_rns


# ─── STEP 4: ADD NEW KEYWORDS ─────────────────────────────────────────────────

def add_new_keywords(client, ag_rns):
    svc   = client.get_service("AdGroupCriterionService")
    total = 0

    # Fetch existing keywords in these ad groups to avoid duplicates on re-run
    ag_rn_list = "', '".join(ag_rns.values())
    existing_rows = run_query(client, f"""
        SELECT
            ad_group.resource_name,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type
        FROM ad_group_criterion
        WHERE ad_group.resource_name IN ('{ag_rn_list}')
          AND ad_group_criterion.type = KEYWORD
          AND ad_group_criterion.negative = FALSE
          AND ad_group_criterion.status != REMOVED
    """)
    existing_set = {
        (row.ad_group.resource_name, row.ad_group_criterion.keyword.text.lower(),
         row.ad_group_criterion.keyword.match_type.name)
        for row in existing_rows
    }

    for ag_name, kw_def in NEW_AD_GROUPS.items():
        ag_rn = ag_rns[ag_name]
        ops   = []

        for text in kw_def["phrase"]:
            if (ag_rn, text.lower(), "PHRASE") not in existing_set:
                op                   = client.get_type("AdGroupCriterionOperation")
                c                    = op.create
                c.ad_group           = ag_rn
                c.status             = client.enums.AdGroupCriterionStatusEnum.ENABLED
                c.keyword.text       = text
                c.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
                if "nicotine" in text.lower():
                    pk             = client.get_type("PolicyViolationKey")
                    pk.policy_name = "TOBACCO"
                    pk.violating_text = text
                    op.exempt_policy_violation_keys.append(pk)
                ops.append(op)

        for text in kw_def["exact"]:
            if (ag_rn, text.lower(), "EXACT") not in existing_set:
                op                   = client.get_type("AdGroupCriterionOperation")
                c                    = op.create
                c.ad_group           = ag_rn
                c.status             = client.enums.AdGroupCriterionStatusEnum.ENABLED
                c.keyword.text       = text
                c.keyword.match_type = client.enums.KeywordMatchTypeEnum.EXACT
                if "nicotine" in text.lower():
                    pk             = client.get_type("PolicyViolationKey")
                    pk.policy_name = "TOBACCO"
                    pk.violating_text = text
                    op.exempt_policy_violation_keys.append(pk)
                ops.append(op)

        if ops:
            svc.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=ops)
            total += len(ops)
            print(f"    [{ag_name}]: {len(ops)} added")
        else:
            print(f"    [{ag_name}]: already populated, skipped")

    print(f"    Total: {total} keywords added.")


# ─── STEP 5: CREATE COMPLIANT RSAs ───────────────────────────────────────────

def create_new_rsa(client, ag_rn, ag_name):
    svc = client.get_service("AdGroupAdService")
    op  = client.get_type("AdGroupAdOperation")

    aga          = op.create
    aga.ad_group = ag_rn
    aga.status   = client.enums.AdGroupAdStatusEnum.ENABLED

    ad = aga.ad
    ad.final_urls.append(FINAL_URL)

    rsa = ad.responsive_search_ad
    for text in NEW_HEADLINES:
        asset      = client.get_type("AdTextAsset")
        asset.text = text
        rsa.headlines.append(asset)

    for text in NEW_DESCRIPTIONS:
        asset      = client.get_type("AdTextAsset")
        asset.text = text
        rsa.descriptions.append(asset)

    svc.mutate_ad_group_ads(customer_id=CUSTOMER_ID, operations=[op])
    print(f"    RSA created: {ag_name}  ({len(NEW_HEADLINES)} headlines, {len(NEW_DESCRIPTIONS)} descriptions)")


# ─── STEP 6: UPDATE CAMPAIGN-LEVEL NEGATIVES ─────────────────────────────────

def update_campaign_negatives(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT
            campaign_criterion.resource_name,
            campaign_criterion.keyword.text,
            campaign_criterion.keyword.match_type
        FROM campaign_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND campaign_criterion.negative = TRUE
          AND campaign_criterion.type = KEYWORD
    """)

    existing_map  = {row.campaign_criterion.keyword.text.lower(): row.campaign_criterion.resource_name
                     for row in rows}

    svc = client.get_service("CampaignCriterionService")
    ops = []

    # Remove
    removed = []
    for term in NEGATIVES_TO_REMOVE:
        if term in existing_map:
            op        = client.get_type("CampaignCriterionOperation")
            op.remove = existing_map[term]
            ops.append(op)
            removed.append(term)

    print(f"    Removing: {removed if removed else 'none'}")

    # Add (skip if already present)
    added = []
    for term in NEGATIVES_TO_ADD:
        if term.lower() not in existing_map:
            op                   = client.get_type("CampaignCriterionOperation")
            c                    = op.create
            c.campaign           = campaign_rn
            c.negative           = True
            c.keyword.text       = term
            c.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
            ops.append(op)
            added.append(term)
        else:
            print(f"    Skipping add (already exists): {term}")

    print(f"    Adding:   {added if added else 'none'}")

    if ops:
        svc.mutate_campaign_criteria(customer_id=CUSTOMER_ID, operations=ops)
        print(f"    Done — {len(removed)} removed, {len(added)} added.")
    else:
        print("    No changes needed.")


# ─── STEP 7: PAUSE OLD AD GROUPS ─────────────────────────────────────────────

def pause_old_ad_groups(client, campaign_rn):
    rows = run_query(client, f"""
        SELECT ad_group.resource_name, ad_group.name, ad_group.status
        FROM ad_group
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group.status = ENABLED
    """)

    new_names = set(NEW_AD_GROUPS.keys())
    to_pause  = [(row.ad_group.resource_name, row.ad_group.name)
                 for row in rows if row.ad_group.name not in new_names]

    if not to_pause:
        print("    No old ad groups to pause.")
        return

    svc = client.get_service("AdGroupService")
    ops = []
    for rn, name in to_pause:
        op                        = client.get_type("AdGroupOperation")
        op.update.resource_name   = rn
        op.update.status          = client.enums.AdGroupStatusEnum.PAUSED
        op.update_mask.paths.append("status")
        ops.append(op)
        print(f"    Pausing: {name}")

    svc.mutate_ad_groups(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Done — {len(to_pause)} old ad groups paused.")


# ─── STEP 8: VALIDATE ─────────────────────────────────────────────────────────

def validate(client, campaign_rn):
    passed = 0
    failed = 0

    def ok(msg):
        nonlocal passed
        print(f"  [PASS] {msg}")
        passed += 1

    def fail(msg):
        nonlocal failed
        print(f"  [FAIL] {msg}")
        failed += 1

    # Campaign status
    rows   = run_query(client, f"""
        SELECT campaign.status FROM campaign
        WHERE campaign.resource_name = '{campaign_rn}'
    """)
    status = rows[0].campaign.status.name
    if status == "PAUSED":
        ok(f"Campaign status = PAUSED")
    else:
        fail(f"Campaign status = {status} (expected PAUSED)")

    # Zero restricted keywords
    kw_rows = run_query(client, f"""
        SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type
        FROM ad_group_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group_criterion.type = KEYWORD
          AND ad_group_criterion.negative = FALSE
          AND ad_group_criterion.status != REMOVED
          AND ad_group.status != REMOVED
    """)

    restricted    = []
    broad_present = []
    for row in kw_rows:
        kw    = row.ad_group_criterion
        text  = kw.keyword.text
        match = kw.keyword.match_type.name
        t     = text.lower()
        if "nicotine pouches" in t or "nic pouches" in t or "nicotine pouch" in t:
            restricted.append(f'"{text}" [{match}]')
        if match == "BROAD":
            broad_present.append(f'"{text}" [{match}]')

    if not restricted:
        ok("Zero nicotine pouches / nic pouches keywords")
    else:
        fail(f"Restricted keywords still present: {restricted}")

    if not broad_present:
        ok("Zero BROAD match keywords")
    else:
        fail(f"BROAD match keywords still present: {broad_present}")

    # RSA copy — banned terms
    ad_rows = run_query(client, f"""
        SELECT
            ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.responsive_search_ad.descriptions,
            ad_group.name
        FROM ad_group_ad
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD
          AND ad_group_ad.status != REMOVED
          AND ad_group.status != REMOVED
    """)

    BANNED = {"buy", "order", "cheap", "cheapest", "delivery", "shipping", "free"}
    violations = []
    for row in ad_rows:
        rsa  = row.ad_group_ad.ad.responsive_search_ad
        text = " ".join(
            [a.text.lower() for a in rsa.headlines] +
            [a.text.lower() for a in rsa.descriptions]
        )
        found = [b for b in BANNED if b in text.split()]
        if found:
            violations.append(f"{row.ad_group.name}: {found}")

    if not violations:
        ok("Ad copy contains no banned terms")
    else:
        fail(f"Banned terms in ad copy: {violations}")

    # 7 new ad groups populated
    ag_rows = run_query(client, f"""
        SELECT ad_group.name, ad_group.status
        FROM ad_group
        WHERE campaign.resource_name = '{campaign_rn}'
          AND ad_group.status = ENABLED
    """)
    enabled = {row.ad_group.name for row in ag_rows}
    expected = set(NEW_AD_GROUPS.keys())
    missing  = expected - enabled

    if not missing:
        ok(f"All 7 new ad groups enabled: {sorted(enabled)}")
    else:
        fail(f"Missing ad groups: {missing}")

    # Each new ad group has an RSA
    for ag_name, ag_rn in {r.ad_group.name: r.ad_group.resource_name for r in ag_rows
                            if r.ad_group.name in expected}.items():
        has_rsa = any(row.ad_group.name == ag_name for row in ad_rows)
        if has_rsa:
            ok(f"RSA present: {ag_name}")
        else:
            fail(f"No RSA in: {ag_name}")

    # Negatives: removed ones gone, new ones present
    neg_rows = run_query(client, f"""
        SELECT campaign_criterion.keyword.text
        FROM campaign_criterion
        WHERE campaign.resource_name = '{campaign_rn}'
          AND campaign_criterion.negative = TRUE
          AND campaign_criterion.type = KEYWORD
    """)
    neg_texts = {row.campaign_criterion.keyword.text.lower() for row in neg_rows}

    still_present = NEGATIVES_TO_REMOVE & neg_texts
    if not still_present:
        ok(f"Removed negatives confirmed gone: {NEGATIVES_TO_REMOVE}")
    else:
        fail(f"Negatives not removed: {still_present}")

    missing_new = [t for t in NEGATIVES_TO_ADD if t.lower() not in neg_texts]
    if not missing_new:
        ok(f"New negatives all present")
    else:
        fail(f"New negatives missing: {missing_new}")

    print()
    print(f"  Result: {passed} passed / {failed} failed")
    return failed == 0


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print()
    print("=" * 65)
    print(f"  REBUILD: {CAMPAIGN_NAME}")
    print(f"  ACCOUNT: ZAF Group AB ({CUSTOMER_ID})")
    print(f"  MODE:    PAUSED — will not serve until manually enabled")
    print("=" * 65)

    client = get_client()

    try:
        print("\n[0]  Locating campaign...")
        campaign_rn = get_campaign_rn(client)

        print("\n[1/8]  Removing all BROAD match + nicotine/nic pouches keywords...")
        remove_bad_keywords(client, campaign_rn)

        print("\n[2/8]  Deleting all existing RSAs...")
        delete_all_rsa(client, campaign_rn)

        print("\n[3/8]  Creating 7 new ad groups...")
        ag_rns = create_new_ad_groups(client, campaign_rn)

        print("\n[4/8]  Adding new keywords (PHRASE + EXACT only)...")
        add_new_keywords(client, ag_rns)

        print("\n[5/8]  Creating compliant RSAs (one per ad group)...")
        # Check which new ad groups already have an RSA (re-run safety)
        ag_rn_list   = "', '".join(ag_rns.values())
        existing_ads = run_query(client, f"""
            SELECT ad_group.resource_name
            FROM ad_group_ad
            WHERE ad_group.resource_name IN ('{ag_rn_list}')
              AND ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD
              AND ad_group_ad.status != REMOVED
        """)
        already_has_rsa = {row.ad_group.resource_name for row in existing_ads}

        for ag_name, ag_rn in ag_rns.items():
            if ag_rn in already_has_rsa:
                print(f"    RSA already exists: {ag_name} - skipped")
            else:
                create_new_rsa(client, ag_rn, ag_name)

        print("\n[6/8]  Updating campaign-level negatives...")
        update_campaign_negatives(client, campaign_rn)

        print("\n[7/8]  Pausing old ad groups...")
        pause_old_ad_groups(client, campaign_rn)

        print("\n[8/8]  Running validation...")
        all_passed = validate(client, campaign_rn)

        print("=" * 65)
        print("  REBUILD COMPLETE" if all_passed else "  REBUILD COMPLETE — SEE FAILURES ABOVE")
        print()
        print("  MANUAL CHECKS BEFORE ACTIVATING:")
        print("  [ ] Final URL expansion = OFF  (Campaign Settings > Additional settings)")
        print("  [ ] Auto-created assets = OFF  (same location)")
        print("  [ ] Conversion goals = Add to basket + Begin checkout")
        print("  [ ] AU nicotine retailer certification confirmed")
        print("  [ ] Googlebot can access get.cheapestpouches.com")
        print("  [ ] Policy Manager shows no ad-level flags")
        print("=" * 65)
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
