import os
import time
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from state_manager import init_db
from sync_job import run_sync

# Load environment variables
load_dotenv()

if __name__ == "__main__":
    print("Initializing HMS Sync Worker...")
    
    # Initialize the local state database
    init_db()
    
    # Setup scheduler
    scheduler = BackgroundScheduler()
    
    # Add the sync job to run every 1 minute
    scheduler.add_job(run_sync, 'interval', minutes=1)
    
    # Start the scheduler
    scheduler.start()
    print("Scheduler started. Polling HMS database every 1 minute.")
    
    # Initial run right away
    run_sync()
    
    try:
        # Keep the main thread alive
        while True:
            time.sleep(2)
    except (KeyboardInterrupt, SystemExit):
        print("Shutting down HMS Sync Worker...")
        scheduler.shutdown()
