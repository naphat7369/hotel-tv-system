import os
import pymssql
from dotenv import load_dotenv

load_dotenv()

DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_USER = os.getenv("DB_USER", "sa")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "hms_db")

def get_db_connection():
    try:
        conn = pymssql.connect(
            server=DB_SERVER,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        return conn
    except Exception as e:
        print(f"[DB Error] Failed to connect to MS SQL: {e}")
        return None

def fetch_in_house_guests():
    """
    Fetches the current In-House guests from the HMS database.
    Returns a list of dictionaries.
    """
    conn = get_db_connection()
    if not conn:
        return []

    try:
        cursor = conn.cursor(as_dict=True)
        # Mock Query: Replace with actual table and column names
        query = """
            SELECT 
                RoomNumber AS roomNumber, 
                GuestName AS guestName, 
                Language AS language, 
                VipStatus AS vipStatus
            FROM MockHmsTable 
            WHERE Status = 'In-House'
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        return rows
    except Exception as e:
        print(f"[DB Error] Failed to fetch guests: {e}")
        return []
    finally:
        conn.close()
