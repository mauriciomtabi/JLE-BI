import urllib.request

RESEND_API_KEY = ""
email_ids = [
    # Run 1
    "fcee920e-f285-4bbd-8ce5-1ea9e3b375df",
    "991c0ec1-9e87-4388-a7bd-36e8b85cc76c",
    "d8a7709f-f43d-40f4-8524-e6ebd91fe6b2",
    "1789c8bf-6b9a-47e9-91a4-201996c8135b",
    # Run 2
    "5ea32bae-a5cd-48fd-af7e-6ec3927719fe",
    "e0940581-c827-4bd0-873f-cd8f7996ac0b",
    "d229b556-bef2-44b9-8182-31c9cb2870d8",
    "a5887466-0829-48ce-bb94-7ed04a736fc2",
    # Run 3
    "07d07b49-b563-4b68-a96a-fb065200bce0",
    "e90530cd-e676-489a-8d02-12af5e0c2e57",
    "d0a495b2-c641-4519-84be-4bea59791161",
    "6aa274d1-bcf0-466b-8a0b-22c6dbe28898"
]

print("Starting cancellation of duplicate scheduled test emails in Resend...")
for eid in email_ids:
    url = f"https://api.resend.com/emails/{eid}/cancel"
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    try:
        req = urllib.request.Request(url, headers=headers, method='POST')
        with urllib.request.urlopen(req) as response:
            print(f"SUCCESS: Cancelled email {eid}")
    except Exception as e:
        print(f"FAILED to cancel {eid}: {e}")
