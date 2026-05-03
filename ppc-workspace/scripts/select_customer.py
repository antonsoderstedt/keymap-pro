from google.ads.googleads.client import GoogleAdsClient
import os

def get_client():
    return GoogleAdsClient.load_from_dict({
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ["GOOGLE_ADS_CUSTOMER_ID"],  # MCC
        "use_proto_plus": True
    })

client = get_client()
ga_service = client.get_service("GoogleAdsService")

mcc_id = os.environ["GOOGLE_ADS_CUSTOMER_ID"]

query = """
    SELECT
        customer_client.client_customer,
        customer_client.descriptive_name,
        customer_client.id,
        customer_client.manager,
        customer_client.status
    FROM customer_client
    WHERE customer_client.manager = FALSE
"""

response = ga_service.search(
    customer_id=mcc_id,
    query=query
)

accounts = []

for row in response:
    accounts.append({
        "name": row.customer_client.descriptive_name,
        "id": str(row.customer_client.id),
        "status": row.customer_client.status.name
    })

accounts = sorted(accounts, key=lambda x: x["name"].lower())

print("\nVälj kundkonto för audit:\n")

for i, account in enumerate(accounts, start=1):
    print(f"{i}. {account['name']} — {account['id']} — {account['status']}")

choice = int(input("\nSkriv nummer: "))

selected = accounts[choice - 1]

print("\nValt konto:")
print(f"Namn: {selected['name']}")
print(f"Customer ID: {selected['id']}")
print(f"Status: {selected['status']}")