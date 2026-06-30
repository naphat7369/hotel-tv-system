import sqlite3
import json

DB_FILE = "state.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS guest_state (
            id INTEGER PRIMARY KEY,
            data TEXT
        )
    """)
    conn.commit()
    conn.close()

def get_previous_state():
    """
    Returns the previous state as a dictionary where the key is roomNumber.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT data FROM guest_state WHERE id = 1")
    row = cursor.fetchone()
    conn.close()
    
    if row and row[0]:
        return json.loads(row[0])
    return {}

def save_state(guests_dict):
    """
    Saves the current state (a dictionary of guests) to the database.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    data_str = json.dumps(guests_dict)
    
    cursor.execute("SELECT id FROM guest_state WHERE id = 1")
    if cursor.fetchone():
        cursor.execute("UPDATE guest_state SET data = ? WHERE id = 1", (data_str,))
    else:
        cursor.execute("INSERT INTO guest_state (id, data) VALUES (1, ?)", (data_str,))
        
    conn.commit()
    conn.close()

def compute_diff(current_list, previous_dict):
    """
    Compares the current list of guests with the previous state.
    Returns (new_checkins, new_checkouts).
    """
    current_dict = {str(guest['roomNumber']): guest for guest in current_list if guest.get('roomNumber')}
    
    new_checkins = []
    new_checkouts = []
    
    # Find new checkins
    for room, guest in current_dict.items():
        if room not in previous_dict:
            new_checkins.append(guest)
        else:
            # Optionally check if it's a different guest in the same room
            prev_guest = previous_dict[room]
            if guest.get('guestName') != prev_guest.get('guestName'):
                # This could be treated as a checkout followed by a checkin
                new_checkouts.append(prev_guest)
                new_checkins.append(guest)

    # Find new checkouts
    for room, guest in previous_dict.items():
        if room not in current_dict:
            new_checkouts.append(guest)
            
    return current_dict, new_checkins, new_checkouts
