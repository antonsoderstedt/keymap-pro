from google.ads.googleads.client import GoogleAdsClient
import os

client = GoogleAdsClient.load_from_dict({
    "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
    "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
    "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
    "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
    "login_customer_id": os.environ["GOOGLE_ADS_CUSTOMER_ID"],
    "use_proto_plus": True
})

ga_service = client.get_service("GoogleAdsService")

query = """
    SELECT customer.descriptive_name
    FROM customer
    LIMIT 1
"""

response = ga_service.search(
    customer_id=os.environ["GOOGLE_ADS_CUSTOMER_ID"],
    query=query
)

for row in response:
    print(f"Connected! Account: {row.customer.descriptive_name}")