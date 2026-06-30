import os
import requests
from db_client import fetch_in_house_guests
from state_manager import get_previous_state, save_state, compute_diff

WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL", "http://localhost:3000/api/v1/webhooks/pms")
WEBHOOK_API_KEY = os.getenv("WEBHOOK_API_KEY", "default-secret-key-123")

def send_webhook(endpoint, payload):
    url = f"{WEBHOOK_BASE_URL}/{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": WEBHOOK_API_KEY
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            print(f"[Webhook] Successfully sent {endpoint} for room {payload.get('roomNumber')}")
        else:
            print(f"[Webhook] Failed to send {endpoint}: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"[Webhook Error] Exception while sending to {url}: {e}")

def run_sync():
    print("[Sync] Starting HMS Sync Job...")
    
    # 1. Fetch current guests from MS SQL
    current_guests = fetch_in_house_guests()
    
    # 2. Get previous state from SQLite
    previous_state = get_previous_state()
    
    # 3. Compute differences
    current_state, new_checkins, new_checkouts = compute_diff(current_guests, previous_state)
    
    # 4. Send webhooks for new Check-outs
    for guest in new_checkouts:
        print(f"[Sync] Detected Checkout for Room {guest.get('roomNumber')}")
        send_webhook("checkout", {"roomNumber": guest.get('roomNumber')})
        
    # 5. Send webhooks for new Check-ins
    for guest in new_checkins:
        print(f"[Sync] Detected Checkin for Room {guest.get('roomNumber')}")
        send_webhook("checkin", guest)
        
    # 6. Save current state
    save_state(current_state)
    print(f"[Sync] Finished Job. Current In-House count: {len(current_state)}")
