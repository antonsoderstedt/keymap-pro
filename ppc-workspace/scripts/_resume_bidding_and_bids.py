"""Resume from Step 6 — bidding + bids + validation (steps 1-5 already applied)."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from cleanup_au_campaign import (
    get_client, get_campaign_rn, fix_bidding_strategy,
    set_ad_group_bids, validate,
    CUSTOMER_ID, CAMPAIGN_NAME, DRY_RUN,
)

def main():
    print()
    print("=" * 70)
    print(f"  RESUME (Steps 6-8): {CAMPAIGN_NAME}")
    print(f"  ACCOUNT: ZAF Group AB ({CUSTOMER_ID})")
    print(f"  MODE: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print("=" * 70)

    client = get_client()
    print("\n[0]  Locating campaign...")
    campaign_rn = get_campaign_rn(client)

    print("\n[6/8]  Fixing bidding strategy -> MANUAL_CPC + eCPC...")
    fix_bidding_strategy(client, campaign_rn)

    print("\n[7/8]  Setting ad group CPC bids (SEK)...")
    set_ad_group_bids(client, campaign_rn)

    if DRY_RUN:
        print("\n  DRY RUN COMPLETE.")
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
    print("=" * 70)
    print()

if __name__ == "__main__":
    main()
