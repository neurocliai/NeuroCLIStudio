import os
import base64
import psycopg2
from dotenv import load_dotenv
from supabase import create_client, Client
import secrets

load_dotenv()

POSTGRES_URI = os.getenv("SUPABASE_POSTGRES_URI")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY or not POSTGRES_URI:
    print("Error: SUPABASE_URL, SUPABASE_KEY, and SUPABASE_POSTGRES_URI must be set in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = 'images'
FOLDER_NAME = 'image generation AI'

def create_bucket_if_not_exists(conn):
    try:
        c = conn.cursor()
        print(f"Checking/creating bucket '{BUCKET_NAME}' via SQL...")
        # Create bucket
        c.execute("INSERT INTO storage.buckets (id, name, public) VALUES (%s, %s, true) ON CONFLICT (id) DO NOTHING;", (BUCKET_NAME, BUCKET_NAME))
        
        # Create RLS policies to allow anon uploads if they don't exist
        try:
            c.execute(f"CREATE POLICY \"Public Access\" ON storage.objects FOR ALL USING (bucket_id = '{BUCKET_NAME}') WITH CHECK (bucket_id = '{BUCKET_NAME}');")
        except Exception:
            # Policy might already exist, rollback just the policy creation
            conn.rollback()
            
        conn.commit()
        print(f"Bucket '{BUCKET_NAME}' is ready.")
    except Exception as e:
        print(f"Error checking/creating bucket: {e}")

def migrate_database_base64_to_storage():
    print("Connecting to PostgreSQL database...")
    try:
        conn = psycopg2.connect(POSTGRES_URI)
        c = conn.cursor()
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        return

    # Fetch all history rows that contain base64 strings (i.e. not URLs)
    c.execute("SELECT id, chat_id, image_base64 FROM history WHERE image_base64 NOT LIKE 'http%'")
    rows = c.fetchall()
    
    if not rows:
        print("No base64 images found to migrate! Everything is already a URL.")
        conn.close()
        return

    print(f"Found {len(rows)} images to migrate to Supabase Storage.")
    
    for row in rows:
        history_id = row[0]
        chat_id = row[1]
        base64_data = row[2]
        
        file_name = f"{FOLDER_NAME}/migrated_{chat_id}_{history_id}_{secrets.token_hex(4)}.png"
        print(f"Migrating history ID {history_id} -> {file_name} ...")
        
        try:
            image_bytes = base64.b64decode(base64_data)
            
            # Upload to Storage
            supabase.storage.from_(BUCKET_NAME).upload(
                path=file_name,
                file=image_bytes,
                file_options={"content-type": "image/png"}
            )
            
            # Get Public URL
            public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_name)
            
            # Update Database
            update_cursor = conn.cursor()
            update_cursor.execute("UPDATE history SET image_base64 = %s WHERE id = %s", (public_url, history_id))
            conn.commit()
            print(f"  Successfully updated row {history_id} with URL.")
            
        except Exception as e:
            print(f"  Error migrating row {history_id}: {e}")
            conn.rollback()

    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    print("Starting DB Base64 -> Supabase Storage Migration...")
    try:
        conn = psycopg2.connect(POSTGRES_URI)
        create_bucket_if_not_exists(conn)
        conn.close()
    except Exception as e:
        print(f"Failed to connect to database for bucket creation: {e}")
        
    migrate_database_base64_to_storage()
