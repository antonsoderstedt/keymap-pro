from google.ads.googleads.client import GoogleAdsClient
from datetime import date, datetime, timedelta
import os
import csv
import re


def clean_customer_id(customer_id):
    return re.sub(r"\D", "", str(customer_id))


def get_client():
    return GoogleAdsClient.load_from_dict({
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ["GOOGLE_ADS_CUSTOMER_ID"],  # MCC
        "use_proto_plus": True
    })


def list_customer_accounts(client, mcc_id):
    ga_service = client.get_service("GoogleAdsService")

    query = """
        SELECT
            customer_client.id,
            customer_client.descriptive_name,
            customer_client.status,
            customer_client.manager
        FROM customer_client
        WHERE customer_client.manager = FALSE
    """

    response = ga_service.search(customer_id=mcc_id, query=query)

    accounts = []

    for row in response:
        accounts.append({
            "id": str(row.customer_client.id),
            "name": row.customer_client.descriptive_name,
            "status": row.customer_client.status.name
        })

    return sorted(accounts, key=lambda x: x["name"].lower())


def choose_account(accounts):
    print("\nVälj kundkonto för audit:\n")

    for i, account in enumerate(accounts, start=1):
        print(f"{i}. {account['name']} — {account['id']} — {account['status']}")

    while True:
        choice = input("\nSkriv nummer på kunden: ")

        if choice.isdigit():
            index = int(choice) - 1
            if 0 <= index < len(accounts):
                return accounts[index]

        print("Ogiltigt val. Försök igen.")


def run_campaign_audit(client, customer_id):
    ga_service = client.get_service("GoogleAdsService")

    end_date = date.today()
    start_date = end_date - timedelta(days=30)

    query = f"""
        SELECT
            campaign.name,
            campaign.status,
            metrics.cost_micros,
            metrics.clicks,
            metrics.impressions,
            metrics.conversions,
            metrics.conversions_value
        FROM campaign
        WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
        ORDER BY metrics.cost_micros DESC
    """

    response = ga_service.search(customer_id=customer_id, query=query)

    rows = []

    for row in response:
        cost = row.metrics.cost_micros / 1_000_000
        clicks = row.metrics.clicks
        conversions = row.metrics.conversions
        conversion_value = row.metrics.conversions_value

        cpa = cost / conversions if conversions > 0 else None
        roas = conversion_value / cost if cost > 0 else None
        ctr = clicks / row.metrics.impressions if row.metrics.impressions > 0 else None
        cpc = cost / clicks if clicks > 0 else None

        rows.append({
            "campaign_name": row.campaign.name,
            "status": row.campaign.status.name,
            "cost": round(cost, 2),
            "impressions": row.metrics.impressions,
            "clicks": clicks,
            "ctr": round(ctr * 100, 2) if ctr is not None else 0,
            "avg_cpc": round(cpc, 2) if cpc is not None else 0,
            "conversions": round(conversions, 2),
            "cost_per_conversion": round(cpa, 2) if cpa is not None else "",
            "conversion_value": round(conversion_value, 2),
            "roas": round(roas, 2) if roas is not None else ""
        })

    return rows, start_date, end_date


def save_report(account, rows, start_date, end_date):
    os.makedirs("reports", exist_ok=True)

    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", account["name"])
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"reports/audit_{safe_name}_{account['id']}_{start_date}_to_{end_date}_{timestamp}.csv"

    fieldnames = [
        "campaign_name",
        "status",
        "cost",
        "impressions",
        "clicks",
        "ctr",
        "avg_cpc",
        "conversions",
        "cost_per_conversion",
        "conversion_value",
        "roas"
    ]

    with open(filename, mode="w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return filename


def print_summary(account, rows, filename):
    total_cost = sum(row["cost"] for row in rows)
    total_clicks = sum(row["clicks"] for row in rows)
    total_conversions = sum(row["conversions"] for row in rows)
    total_value = sum(row["conversion_value"] for row in rows)

    avg_cpa = total_cost / total_conversions if total_conversions > 0 else None
    roas = total_value / total_cost if total_cost > 0 else None

    print("\nAudit klar\n")
    print(f"Konto: {account['name']} — {account['id']}")
    print(f"Kampanjer: {len(rows)}")
    print(f"Kostnad: {round(total_cost, 2)}")
    print(f"Klick: {total_clicks}")
    print(f"Konverteringar: {round(total_conversions, 2)}")
    print(f"CPA: {round(avg_cpa, 2) if avg_cpa is not None else 'N/A'}")
    print(f"Konverteringsvärde: {round(total_value, 2)}")
    print(f"ROAS: {round(roas, 2) if roas is not None else 'N/A'}")
    print(f"\nRapport sparad här:\n{filename}")


def main():
    client = get_client()
    mcc_id = clean_customer_id(os.environ["GOOGLE_ADS_CUSTOMER_ID"])

    accounts = list_customer_accounts(client, mcc_id)

    if not accounts:
        print("Inga kundkonton hittades under MCC.")
        return

    selected_account = choose_account(accounts)
    customer_id = clean_customer_id(selected_account["id"])

    rows, start_date, end_date = run_campaign_audit(client, customer_id)
    filename = save_report(selected_account, rows, start_date, end_date)

    print_summary(selected_account, rows, filename)


if __name__ == "__main__":
    main()