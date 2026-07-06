import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.getenv("SUPABASE_POSTGRES_URI"))
c = conn.cursor()
try:
    c.execute('CREATE POLICY "public_read_gallery" ON live_gallery FOR SELECT USING (true);')
    conn.commit()
    print("Policy created successfully!")
except Exception as e:
    print(f"Error: {e}")
conn.close()
