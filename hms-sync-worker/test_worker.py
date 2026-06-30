import os
import json
import sqlite3
import pytest
import responses
from unittest.mock import patch
import sync_job
import state_manager

# Override DB path for tests
state_manager.DB_FILE = "test_state.db"

@pytest.fixture(autouse=True)
def setup_teardown():
    # Setup
    state_manager.init_db()
    
    # Ensure fresh start
    conn = sqlite3.connect(state_manager.DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM guest_state")
    conn.commit()
    conn.close()
    
    yield
    # Teardown
    if os.path.exists(state_manager.DB_FILE):
        os.remove(state_manager.DB_FILE)

@responses.activate
@patch('sync_job.fetch_in_house_guests')
def test_sync_job_checkin(mock_fetch):
    # Setup mock webhook receiver
    responses.add(
        responses.POST, 
        f"{sync_job.WEBHOOK_BASE_URL}/checkin",
        json={"message": "success"}, status=200
    )

    # 1. Start with Empty State, Mock MS SQL returning 1 Check-in
    mock_guest = {
        "roomNumber": "101",
        "guestName": "Jane Doe",
        "language": "EN",
        "vipStatus": "Gold"
    }
    mock_fetch.return_value = [mock_guest]

    # Run sync
    sync_job.run_sync()

    # Verify webhook was called for check-in
    assert len(responses.calls) == 1
    assert responses.calls[0].request.url == f"{sync_job.WEBHOOK_BASE_URL}/checkin"
    assert json.loads(responses.calls[0].request.body) == mock_guest
    
    # Verify state was saved
    saved = state_manager.get_previous_state()
    assert "101" in saved
    assert saved["101"]["guestName"] == "Jane Doe"

@responses.activate
@patch('sync_job.fetch_in_house_guests')
def test_sync_job_checkout(mock_fetch):
    # Setup initial state with 1 guest
    initial_guest = {
        "roomNumber": "102",
        "guestName": "Mark Smith",
        "language": "EN",
        "vipStatus": "Standard"
    }
    state_manager.save_state({"102": initial_guest})

    # Setup mock webhook receiver
    responses.add(
        responses.POST, 
        f"{sync_job.WEBHOOK_BASE_URL}/checkout",
        json={"message": "success"}, status=200
    )

    # Mock MS SQL returning Empty list (everyone checked out)
    mock_fetch.return_value = []

    # Run sync
    sync_job.run_sync()

    # Verify webhook was called for check-out
    assert len(responses.calls) == 1
    assert responses.calls[0].request.url == f"{sync_job.WEBHOOK_BASE_URL}/checkout"
    assert json.loads(responses.calls[0].request.body) == {"roomNumber": "102"}
    
    # Verify state was cleared
    saved = state_manager.get_previous_state()
    assert "102" not in saved
    assert len(saved) == 0
