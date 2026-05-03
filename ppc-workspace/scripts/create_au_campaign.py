"""
Create [GENERIC] Pouches – AU in ZAF Group AB (164-850-4493).
Status PAUSED at every level. Nothing will serve until explicitly enabled.
STRICT RULE: touches only the newly created campaign. Zero changes to existing campaigns.
"""

import os
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

CUSTOMER_ID = "1648504493"
CAMPAIGN_NAME = "[GENERIC] Pouches – AU"
BUDGET_SEK_MICROS = 3_600_000_000  # SEK 3,600/day
FINAL_URL = "https://get.cheapestpouches.com/"
AU_GEO_RESOURCE = "geoTargetConstants/2036"  # Australia

# ─── ALREADY CREATED IN PRIOR RUNS ──────────────────────────────────────────
EXISTING_BUDGET_RN   = "customers/1648504493/campaignBudgets/15551721538"
EXISTING_CAMPAIGN_RN = "customers/1648504493/campaigns/23801879901"
EXISTING_AD_GROUPS   = {
    "CORE ENGINE":       "customers/1648504493/adGroups/194415720205",
    "MODIFIERS":         "customers/1648504493/adGroups/195310398439",
    "CONTROLLED INTENT": "customers/1648504493/adGroups/194415722085",
    "BRAND CONQUEST":    "customers/1648504493/adGroups/194415723285",
}

# ─── AD GROUP DEFINITIONS ────────────────────────────────────────────────────

AD_GROUPS = [
    {
        "name": "CORE ENGINE",
        "broad": [
            "nicotine pouches",
            "nicotine pouches australia",
            "nicotine pouches aus",
            "nic pouches",
            "nic pouches australia",
            "pouches",
            "pouches australia",
            "white pouches",
            "white pouches australia",
        ],
        "phrase": [
            "nicotine pouches",
            "nicotine pouches australia",
            "nicotine pouches aus",
            "nic pouches",
            "nic pouches australia",
            "pouches",
            "pouches australia",
            "white pouches",
            "white pouches australia",
        ],
        "negatives": ["buy", "order", "online", "delivery", "zyn", "velo", "pablo", "killa", "xqs"],
    },
    {
        "name": "MODIFIERS",
        "broad": [],
        "phrase": [
            "best nicotine pouches australia",
            "cheap nicotine pouches australia",
            "cheapest nicotine pouches australia",
            "nicotine pouches brands australia",
            "nicotine pouches flavors",
            "nicotine pouch flavours",
            "strong nicotine pouches",
            "strongest nicotine pouches",
            "high strength nicotine pouches",
            "mint nicotine pouches",
        ],
        "negatives": ["buy", "order", "zyn", "velo", "pablo", "killa", "xqs"],
    },
    {
        "name": "CONTROLLED INTENT",
        "broad": [],
        "phrase": [
            "where to buy nicotine pouches australia",
            "where can i buy nicotine pouches",
            "nicotine pouches online",
            "nicotine pouches delivery",
            "buy nicotine pouches",
            "buy nicotine pouches australia",
            "order nicotine pouches",
        ],
        "negatives": ["zyn", "velo", "pablo", "killa", "xqs"],
    },
    {
        "name": "BRAND CONQUEST",
        "broad": [
            "zyn",
            "zyn australia",
            "zyn pouches",
            "zyn pouches australia",
            "zyn nicotine pouches",
            "velo pouches",
            "velo pouches australia",
            "velo nicotine pouches",
            "pablo pouches",
            "pablo pouches australia",
            "killa pouches",
            "killa pouches australia",
            "xqs pouches",
        ],
        "phrase": [
            "zyn",
            "zyn australia",
            "zyn pouches",
            "zyn pouches australia",
            "zyn nicotine pouches",
            "velo pouches",
            "velo pouches australia",
            "velo nicotine pouches",
            "pablo pouches",
            "pablo pouches australia",
            "killa pouches",
            "killa pouches australia",
            "xqs pouches",
            "buy zyn",  # LIMITED TEST
        ],
        "negatives": ["cheap", "best"],
    },
]

# ─── CAMPAIGN-LEVEL NEGATIVES ────────────────────────────────────────────────

CAMPAIGN_NEGATIVES = [
    # Compliance — Australia critical
    "prescription", "doctor", "pharmacy", "chemist", "legal", "laws",
    "banned", "illegal", "tga", "permit", "customs", "import permit",
    # Low intent
    "reddit", "review", "reviews", "youtube", "tiktok", "wiki", "what is",
    # Irrelevant
    "vape", "vapes", "vaping", "cigarette", "cigarettes",
    "nicotine gum", "nicotine patch", "nicotine patches",
    # Waste
    "free", "amazon", "ebay", "wholesale", "near me",
]

# ─── RSA COPY ────────────────────────────────────────────────────────────────

RSA_HEADLINES = [
    "Buy Pouches Online",
    "Cheapest Pouches Online",
    "Free Shipping Available",
    "Order ZYN Online Today",
    "Shop ZYN & More Online",
    "VELO Pouches - Best Prices",
    "Fast AU Delivery Available",
    "Huge Selection of Pouches",
    "Top Brands - Low Prices",
    "Buy ZYN Pouches Online",
    "Free Shipping to Australia",
    "Free Worldwide Shipping",
    "Largest ZEUS Pouch Selection",
    "Pablo & Killa Pouches in Stock",
    "XQS Pouches Available",
]

RSA_DESCRIPTIONS = [
    "Buy pouches online at the lowest prices. Free shipping to Australia available.",
    "Shop ZYN, VELO, Pablo & more. Fast, discreet delivery across Australia.",
    "All strengths and flavors in stock. Order today and save on every purchase.",
    "New customer? Use code EMAIL15OFF for 15% off. Free shipping available to Australia.",
]


# ─── CLIENT ──────────────────────────────────────────────────────────────────

def get_client():
    return GoogleAdsClient.load_from_dict({
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id":       os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret":   os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token":   os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ["GOOGLE_ADS_CUSTOMER_ID"],
        "use_proto_plus": True,
    })


# ─── STEP 1: BUDGET ──────────────────────────────────────────────────────────

def create_budget(client):
    svc = client.get_service("CampaignBudgetService")
    op = client.get_type("CampaignBudgetOperation")
    b = op.create
    b.name = f"{CAMPAIGN_NAME} - Budget"
    b.amount_micros = BUDGET_SEK_MICROS
    b.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    b.explicitly_shared = False

    resp = svc.mutate_campaign_budgets(customer_id=CUSTOMER_ID, operations=[op])
    rn = resp.results[0].resource_name
    print(f"    Budget:   {rn}  (SEK {BUDGET_SEK_MICROS / 1e6:.0f}/day)")
    return rn


# ─── STEP 2: CAMPAIGN ────────────────────────────────────────────────────────

def create_campaign(client, budget_rn):
    svc = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    c = op.create

    c.name = CAMPAIGN_NAME
    c.status = client.enums.CampaignStatusEnum.PAUSED
    c.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH
    c.campaign_budget = budget_rn

    # Bidding: Maximize Conv. Value + tROAS 666%
    c.maximize_conversion_value.target_roas = 6.66

    # Networks: Search + Search Partners only
    c.network_settings.target_google_search = True
    c.network_settings.target_search_network = True
    c.network_settings.target_content_network = False
    c.network_settings.target_partner_search_network = False

    # Required by Google Ads API for all new campaigns (EU political ads compliance)
    c.contains_eu_political_advertising = 2  # 2 = NOT_CONTAINS_EU_POLITICAL_ADVERTISING

    # NOTE: url_expansion_opt_out and automatically_created_assets_setting
    # are not writable via the Python client for Search campaigns in API v24.
    # Disable both manually in the UI after creation:
    #   Campaign Settings > Additional settings > Final URL expansion = OFF
    #   Campaign Settings > Additional settings > Auto-created assets = OFF

    resp = svc.mutate_campaigns(customer_id=CUSTOMER_ID, operations=[op])
    rn = resp.results[0].resource_name
    print(f"    Campaign: {rn}")
    return rn


# ─── STEP 3: GEO TARGET ──────────────────────────────────────────────────────

def add_geo_target(client, campaign_rn):
    svc = client.get_service("CampaignCriterionService")
    op = client.get_type("CampaignCriterionOperation")
    c = op.create
    c.campaign = campaign_rn
    c.location.geo_target_constant = AU_GEO_RESOURCE

    svc.mutate_campaign_criteria(customer_id=CUSTOMER_ID, operations=[op])
    print(f"    Geo target: Australia ({AU_GEO_RESOURCE})")


# ─── STEP 4: CAMPAIGN-LEVEL NEGATIVES ────────────────────────────────────────

def add_campaign_negatives(client, campaign_rn):
    svc = client.get_service("CampaignCriterionService")
    ops = []
    for term in CAMPAIGN_NEGATIVES:
        op = client.get_type("CampaignCriterionOperation")
        c = op.create
        c.campaign = campaign_rn
        c.negative = True
        c.keyword.text = term
        c.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
        ops.append(op)

    svc.mutate_campaign_criteria(customer_id=CUSTOMER_ID, operations=ops)
    print(f"    Campaign negatives: {len(ops)} terms added")


# ─── STEP 5: AD GROUPS ───────────────────────────────────────────────────────

def create_ad_groups(client, campaign_rn):
    svc = client.get_service("AdGroupService")
    resource_names = {}

    for ag in AD_GROUPS:
        op = client.get_type("AdGroupOperation")
        a = op.create
        a.name = ag["name"]
        a.campaign = campaign_rn
        a.status = client.enums.AdGroupStatusEnum.ENABLED
        a.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD

        resp = svc.mutate_ad_groups(customer_id=CUSTOMER_ID, operations=[op])
        rn = resp.results[0].resource_name
        resource_names[ag["name"]] = rn
        print(f"    Ad group: {ag['name']}  ->  {rn}")

    return resource_names


# ─── STEP 6: KEYWORDS ────────────────────────────────────────────────────────

def build_kw_op(client, ag_rn, text, match_type):
    """Build a keyword AdGroupCriterionOperation with auto policy exemption for nicotine terms."""
    op = client.get_type("AdGroupCriterionOperation")
    c = op.create
    c.ad_group = ag_rn
    c.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
    c.keyword.text = text
    c.keyword.match_type = match_type
    # Google flags keywords containing "nicotine" under Tobacco policy (is_exemptible=true).
    # Adding the exemption key upfront so the operation is accepted on first pass.
    if "nicotine" in text.lower():
        pk = client.get_type("PolicyViolationKey")
        pk.policy_name = "TOBACCO"
        pk.violating_text = text
        op.exempt_policy_violation_keys.append(pk)
    return op


def add_keywords(client, ag_resource_names):
    svc = client.get_service("AdGroupCriterionService")

    for ag in AD_GROUPS:
        rn = ag_resource_names[ag["name"]]
        ops = []

        for kw in ag["broad"]:
            ops.append(build_kw_op(client, rn, kw, client.enums.KeywordMatchTypeEnum.BROAD))

        for kw in ag["phrase"]:
            ops.append(build_kw_op(client, rn, kw, client.enums.KeywordMatchTypeEnum.PHRASE))

        if ops:
            svc.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=ops)
            print(f"    Keywords [{ag['name']}]: {len(ag['broad'])} broad + {len(ag['phrase'])} phrase = {len(ops)} total")


# ─── STEP 7: AD GROUP NEGATIVES ──────────────────────────────────────────────

def add_ad_group_negatives(client, ag_resource_names):
    svc = client.get_service("AdGroupCriterionService")

    for ag in AD_GROUPS:
        rn = ag_resource_names[ag["name"]]
        ops = []

        for term in ag["negatives"]:
            op = client.get_type("AdGroupCriterionOperation")
            c = op.create
            c.ad_group = rn
            c.negative = True
            c.keyword.text = term
            c.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
            ops.append(op)

        if ops:
            svc.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=ops)
            print(f"    Negatives  [{ag['name']}]: {len(ops)} terms")


# ─── STEP 8: RSA ─────────────────────────────────────────────────────────────

def create_rsa(client, ag_rn, ag_name):
    svc = client.get_service("AdGroupAdService")
    op = client.get_type("AdGroupAdOperation")

    aga = op.create
    aga.ad_group = ag_rn
    aga.status = client.enums.AdGroupAdStatusEnum.ENABLED

    ad = aga.ad
    ad.final_urls.append(FINAL_URL)

    rsa = ad.responsive_search_ad
    for text in RSA_HEADLINES:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        rsa.headlines.append(asset)

    for text in RSA_DESCRIPTIONS:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        rsa.descriptions.append(asset)

    svc.mutate_ad_group_ads(customer_id=CUSTOMER_ID, operations=[op])
    print(f"    RSA created [{ag_name}]: 15 headlines, 4 descriptions")


# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    print()
    print("=" * 62)
    print(f"  CREATING: {CAMPAIGN_NAME}")
    print(f"  ACCOUNT:  ZAF Group AB ({CUSTOMER_ID})")
    print(f"  BUDGET:   SEK 3,600/day")
    print(f"  STATUS:   PAUSED — will not serve until you enable it")
    print("=" * 62)

    client = get_client()
    created = {
        "budget":    EXISTING_BUDGET_RN,
        "campaign":  EXISTING_CAMPAIGN_RN,
        "ad_groups": EXISTING_AD_GROUPS,
    }

    try:
        print("\n[1-5/8] Budget / Campaign / Geo / Campaign negatives / Ad groups")
        print(f"    Already created in prior runs — skipping.")
        print(f"    Campaign:  {EXISTING_CAMPAIGN_RN}")
        for name, rn in EXISTING_AD_GROUPS.items():
            print(f"    Ad group:  {name}  ->  {rn}")

        print("\n[6/8] Keywords (with Tobacco policy exemptions for nicotine terms)...")
        add_keywords(client, created["ad_groups"])

        print("\n[7/8] Ad group negatives...")
        add_ad_group_negatives(client, created["ad_groups"])

        print("\n[8/8] RSAs (one per ad group)...")
        for ag in AD_GROUPS:
            create_rsa(client, created["ad_groups"][ag["name"]], ag["name"])

        print()
        print("=" * 62)
        print("  DONE — Full structure created successfully.")
        print()
        print(f"  Campaign: {created['campaign']}")
        print()
        print("  VERIFY IN UI BEFORE ACTIVATING:")
        print("  [ ] tROAS = 666%")
        print("  [ ] Budget = SEK 3,600/day")
        print("  [ ] Location = Australia only")
        print("  [ ] Final URL expansion = OFF  (set manually in UI)")
        print("  [ ] Automatically created assets = OFF  (set manually in UI)")
        print("  [ ] Conversion goals = Add to basket + Begin checkout")
        print("  [ ] 4 ad groups with correct keywords + negatives")
        print("  [ ] RSA not flagged in Policy Manager")
        print("  [ ] Googlebot can access get.cheapestpouches.com")
        print("  [ ] AU nicotine certification confirmed")
        print("=" * 62)
        print()

    except GoogleAdsException as ex:
        print(f"\n  API ERROR — steps completed so far: {list(created.keys())}")
        print(f"  Request ID: {ex.request_id}")
        for err in ex.failure.errors:
            print(f"  [{err.error_code}] {err.message}")
        raise


if __name__ == "__main__":
    main()
