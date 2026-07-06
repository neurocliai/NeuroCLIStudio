import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
POSTGRES_URI = os.getenv('SUPABASE_POSTGRES_URI')
conn = psycopg2.connect(POSTGRES_URI)
c = conn.cursor()
c.execute('''CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             )''')
c.execute('''CREATE TABLE IF NOT EXISTS history (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
                prompt TEXT NOT NULL,
                image_base64 TEXT NOT NULL
             )''')
c.execute('''SELECT column_name FROM information_schema.columns 
             WHERE table_name='history' AND column_name='chat_id' ''')
if not c.fetchone():
    c.execute('ALTER TABLE history ADD COLUMN chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE')
    c.execute("INSERT INTO chats (title) VALUES ('Legacy Chat') RETURNING id")
    default_chat_id = c.fetchone()[0]
    c.execute('UPDATE history SET chat_id = %s WHERE chat_id IS NULL', (default_chat_id,))
conn.commit()
conn.close()
print('Success')
