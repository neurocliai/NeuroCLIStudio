import sqlite3
import psycopg2

import os
from dotenv import load_dotenv
load_dotenv()

SQLITE_DB_PATH = 'neurocli.db'
POSTGRES_URI = os.getenv("SUPABASE_POSTGRES_URI")

def migrate():
    print("Connecting to local SQLite database...")
    try:
        sqlite_conn = sqlite3.connect(SQLITE_DB_PATH)
        sqlite_c = sqlite_conn.cursor()
        
        # Ensure the history table exists in SQLite just in case
        sqlite_c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='history'")
        if not sqlite_c.fetchone():
            print("No history table found in SQLite. Nothing to migrate.")
            sqlite_conn.close()
            return
            
        sqlite_c.execute("SELECT prompt, image_base64 FROM history ORDER BY id ASC")
        rows = sqlite_c.fetchall()
        print(f"Found {len(rows)} records in local SQLite database.")
    except Exception as e:
        print(f"Error reading SQLite: {e}")
        return
        
    if not rows:
        print("No data to migrate.")
        return

    print("Connecting to Supabase PostgreSQL database...")
    try:
        pg_conn = psycopg2.connect(POSTGRES_URI)
        pg_c = pg_conn.cursor()
        
        # Create table in Postgres if it doesn't exist
        print("Creating table in Supabase if not exists...")
        pg_c.execute('''CREATE TABLE IF NOT EXISTS history (
                        id SERIAL PRIMARY KEY,
                        prompt TEXT NOT NULL,
                        image_base64 TEXT NOT NULL
                     )''')
                     
        print("Inserting records into Supabase...")
        # Optional: truncate existing to avoid duplicates if re-running
        # pg_c.execute("TRUNCATE TABLE history")
        
        count = 0
        for prompt, image_base64 in rows:
            pg_c.execute("INSERT INTO history (prompt, image_base64) VALUES (%s, %s)", (prompt, image_base64))
            count += 1
            if count % 5 == 0:
                print(f"Migrated {count}/{len(rows)} records...")
                
        pg_conn.commit()
        print(f"Successfully migrated {count} records to Supabase!")
        
        pg_c.close()
        pg_conn.close()
        sqlite_conn.close()
        
    except Exception as e:
        print(f"Error migrating to Supabase: {e}")

if __name__ == '__main__':
    migrate()
