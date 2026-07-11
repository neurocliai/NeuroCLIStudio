import os
import secrets
import time
from flask import Flask, request, jsonify, render_template
import requests
import urllib.request
from bs4 import BeautifulSoup

app = Flask(__name__, template_folder='.', static_folder='static')
# Ensure static directory exists
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__name__)), 'static')

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from supabase import create_client, Client

POSTGRES_URI = os.getenv("SUPABASE_POSTGRES_URI")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Initialize Supabase Python Client (for Storage)
supabase_client: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Failed to init Supabase Client: {e}")

def init_db():
    try:
        conn = psycopg2.connect(POSTGRES_URI)
        c = conn.cursor()
        
        # Try to automatically create the 'images' storage bucket via SQL 
        # (This bypasses Anon Key permission restrictions for bucket creation)
        try:
            c.execute("INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true) ON CONFLICT (id) DO NOTHING;")
            conn.commit()
        except Exception as bucket_err:
            print(f"Warning: Could not create bucket via SQL (may already exist or lack schema access): {bucket_err}")
            conn.rollback()

        # Try to automatically create RLS policies for the bucket to allow anon uploads
        try:
            c.execute("CREATE POLICY \"Public Access\" ON storage.objects FOR ALL USING (bucket_id = 'images') WITH CHECK (bucket_id = 'images');")
            conn.commit()
        except Exception:
            conn.rollback()
        
        # Create chats table
        c.execute('''CREATE TABLE IF NOT EXISTS chats (
                        id SERIAL PRIMARY KEY,
                        title TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        session_id VARCHAR(255)
                     )''')
        
        # Create history table with chat_id if not exists
        c.execute('''CREATE TABLE IF NOT EXISTS history (
                        id SERIAL PRIMARY KEY,
                        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
                        prompt TEXT NOT NULL,
                        image_base64 TEXT NOT NULL
                     )''')

        # Safely add chat_id column to existing history table if it was created before this feature
        c.execute('''SELECT column_name FROM information_schema.columns 
                     WHERE table_name='history' AND column_name='chat_id' ''')
        if not c.fetchone():
            c.execute("ALTER TABLE history ADD COLUMN chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE")
            # Create a default chat for legacy history
            c.execute("INSERT INTO chats (title) VALUES ('Legacy Chat') RETURNING id")
            default_chat_id = c.fetchone()[0]
            c.execute("UPDATE history SET chat_id = %s WHERE chat_id IS NULL", (default_chat_id,))
            
        # Safely add session_id to chats table if missing
        c.execute('''SELECT column_name FROM information_schema.columns 
                     WHERE table_name='chats' AND column_name='session_id' ''')
        if not c.fetchone():
            c.execute("ALTER TABLE chats ADD COLUMN session_id VARCHAR(255)")
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to connect to Supabase or init schema: {e}")

init_db()

HF_TOKEN = "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"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/auth')
def auth_page():
    return render_template('auth.html')

@app.route('/app')
def run_app():
    return render_template('app.html')

import io
import base64
from PIL import Image

@app.route('/generate', methods=['POST'])
def generate_image():
    session_id = request.headers.get('X-Session-Id', 'anonymous')
    data = request.json
    original_prompt = data.get('prompt', '')
    chat_id = data.get('chat_id', None)
    style = data.get('style', 'none')
    input_image_b64 = data.get('image_base64', None)
    
    if not original_prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    try:
        if 'generated_b64' not in data:
            return jsonify({'error': 'No image data received from client'}), 400
            
        # Parse the base64 string
        b64_str = data['generated_b64']
        if b64_str.startswith('data:image'):
            b64_str = b64_str.split(',')[1]
            
        image_data = base64.b64decode(b64_str)
        image = Image.open(io.BytesIO(image_data))
        image = image.convert("RGB")
        
        
        # Add transparent NeuroCLI watermark to the bottom right
        try:
            watermark_path = os.path.join(STATIC_DIR, 'img', 'neurocli_logo_transparent.png')
            if not os.path.exists(watermark_path):
                watermark_path = os.path.join(STATIC_DIR, 'img', 'neurocli_logo.png')
            
            if os.path.exists(watermark_path):
                watermark = Image.open(watermark_path).convert("RGBA")
                
                # Resize watermark to be ~15% of the main image width
                wm_width = int(image.width * 0.15)
                wm_ratio = wm_width / float(watermark.width)
                wm_height = int(watermark.height * wm_ratio)
                watermark = watermark.resize((wm_width, wm_height), Image.LANCZOS)
                
                # Make it semi-transparent (40% opacity)
                alpha = watermark.split()[3]
                alpha = alpha.point(lambda p: p * 0.4)
                watermark.putalpha(alpha)
                
                # Calculate position (bottom right with 15px padding)
                position = (image.width - wm_width - 15, image.height - wm_height - 15)
                
                # Composite the images
                image = image.convert("RGBA")
                image.paste(watermark, position, mask=watermark)
                image = image.convert("RGB")
        except Exception as e:
            print(f"Failed to apply watermark: {e}")

        # Convert to Base64 in memory
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        # Generate a unique filename for Supabase Storage
        filename = f"generated_{int(time.time())}_{secrets.token_hex(4)}.png"
        
        # Upload to Supabase Storage ("image generation AI" folder/bucket)
        if supabase_client:
            try:
                # Use in-memory buffer instead of local file to support Vercel serverless functions
                file_bytes = buffered.getvalue()
                
                # Assuming the bucket is named "images" and folder is "image generation AI"
                bucket_name = "images" 
                folder_name = "image generation AI"
                supabase_path = f"{folder_name}/{filename}"
                
                res = supabase_client.storage.from_(bucket_name).upload(
                    file=file_bytes,
                    path=supabase_path,
                    file_options={"content-type": "image/png"}
                )
                print(f"Successfully uploaded to Supabase Storage: {supabase_path}")
                
                # Retrieve the public URL
                public_url = supabase_client.storage.from_(bucket_name).get_public_url(supabase_path)
                
                # IMPORTANT: Replace the img_str with the public_url so it gets saved in DB
                img_str = public_url
                
            except Exception as e:
                print(f"Failed to upload to Supabase Storage: {e}")
        
        # Manage Chat ID
        conn = psycopg2.connect(POSTGRES_URI)
        c = conn.cursor()
        is_new_chat = False
        
        if chat_id:
            c.execute("SELECT id FROM chats WHERE id = %s", (chat_id,))
            if not c.fetchone():
                chat_id = None
                
        if not chat_id:
            # Create new chat session if none provided
            title = original_prompt[:30] + '...' if len(original_prompt) > 30 else original_prompt
            c.execute("INSERT INTO chats (title, session_id) VALUES (%s, %s) RETURNING id", (title, session_id))
            chat_id = c.fetchone()[0]
            is_new_chat = True
            
        # Save history to Supabase DB
        # Note: img_str will be a public URL if Supabase upload succeeds, otherwise it will be base64.
        c.execute("INSERT INTO history (chat_id, prompt, image_base64) VALUES (%s, %s, %s)", (chat_id, original_prompt, img_str))
        conn.commit()
        conn.close()
        
        return jsonify({'image_base64': img_str, 'chat_id': chat_id, 'is_new_chat': is_new_chat, 'title': original_prompt[:30] + '...' if is_new_chat else None})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/history/<int:chat_id>', methods=['GET'])
def get_history(chat_id):
    session_id = request.headers.get('X-Session-Id', 'anonymous')
    try:
        conn = psycopg2.connect(POSTGRES_URI)
        c = conn.cursor()
        
        # Verify ownership
        c.execute("SELECT id FROM chats WHERE id = %s AND session_id = %s", (chat_id, session_id))
        if not c.fetchone():
            conn.close()
            return jsonify({'error': 'Unauthorized or Chat not found'}), 403
            
        c.execute("SELECT prompt, image_base64 FROM history WHERE chat_id = %s ORDER BY id ASC", (chat_id,))
        rows = c.fetchall()
        conn.close()
        
        history = [{'prompt': r[0], 'image_base64': r[1]} for r in rows]
        return jsonify({'history': history})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/chats', methods=['GET'])
def get_chats():
    session_id = request.headers.get('X-Session-Id', 'anonymous')
    try:
        conn = psycopg2.connect(POSTGRES_URI)
        c = conn.cursor()
        c.execute("SELECT id, title, created_at FROM chats WHERE session_id = %s ORDER BY created_at DESC", (session_id,))
        rows = c.fetchall()
        conn.close()
        chats = [{'id': r[0], 'title': r[1], 'created_at': r[2].isoformat() if r[2] else None} for r in rows]
        return jsonify({'chats': chats})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/chats', methods=['POST'])
def create_chat():
    session_id = request.headers.get('X-Session-Id', 'anonymous')
    try:
        conn = psycopg2.connect(POSTGRES_URI)
        c = conn.cursor()
        c.execute("INSERT INTO chats (title, session_id) VALUES ('New Chat', %s) RETURNING id, title", (session_id,))
        new_chat = c.fetchone()
        conn.commit()
        conn.close()
        return jsonify({'id': new_chat[0], 'title': new_chat[1]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/chats/<int:chat_id>', methods=['PUT'])
def update_chat(chat_id):
    session_id = request.headers.get('X-Session-Id', 'anonymous')
    data = request.json
    title = data.get('title')
    if not title:
        return jsonify({'error': 'Title required'}), 400
    try:
        conn = psycopg2.connect(POSTGRES_URI)
        c = conn.cursor()
        # Verify ownership through the update clause itself
        c.execute("UPDATE chats SET title = %s WHERE id = %s AND session_id = %s", (title, chat_id, session_id))
        if c.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Unauthorized or Chat not found'}), 403
            
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/chats/<int:chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    session_id = request.headers.get('X-Session-Id', 'anonymous')
    try:
        conn = psycopg2.connect(POSTGRES_URI)
        c = conn.cursor()
        # History is deleted automatically via CASCADE
        c.execute("DELETE FROM chats WHERE id = %s AND session_id = %s", (chat_id, session_id))
        if c.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Unauthorized or Chat not found'}), 403
            
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/live-gallery', methods=['GET'])
def get_live_gallery():
    try:
        # Use Supabase client so Row Level Security (RLS) is respected
        if not supabase_client:
            raise Exception("Supabase client not initialized")
            
        response = supabase_client.table("live_gallery").select("id, category, prompt, image_url").order("id").execute()
        
        gallery = response.data
        return jsonify(gallery)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Live Coupon Scraper ---
COUPON_CACHE = {
    'timestamp': 0,
    'coupons': []
}

def scrape_couponzguru():
    try:
        req = urllib.request.Request('https://www.couponzguru.com/top-offers/', headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req, timeout=10).read()
        soup = BeautifulSoup(html, 'html.parser')
        
        coupons = []
        lists = soup.find_all('div', class_='coupon-list')
        for item in lists[:20]:
            store_name = "Exclusive Deal"
            desc = "Special Offer"
            code = "CLICK2REVEAL"
            
            # Extract basic info safely
            desc_elem = item.find('div', class_='coupon-description')
            if desc_elem:
                title_elem = desc_elem.find('h3')
                if title_elem:
                    desc = title_elem.text.strip()
                    # Try to infer store from description if possible
                    words = desc.split()
                    if words: store_name = words[0].upper()
            
            btn_elem = item.find('div', class_='coupon-button-outer')
            if btn_elem:
                a_tag = btn_elem.find('a')
                if a_tag and a_tag.text:
                    txt = a_tag.text.strip()
                    if txt.upper() not in ["GET DEAL", "ACTIVATE DEAL"]:
                        code = txt.upper()
                        
            coupons.append({
                "store": store_name,
                "discount": desc,
                "code": code
            })
            
        if len(coupons) >= 4:
            COUPON_CACHE['coupons'] = coupons
            COUPON_CACHE['timestamp'] = time.time()
            return True
            
    except Exception as e:
        print(f"Coupon scrape failed: {e}")
    return False

@app.route('/api/coupons', methods=['GET'])
def get_live_coupons():
    now = time.time()
    # Cache for 1 minute (60 seconds)
    if not COUPON_CACHE['coupons'] or (now - COUPON_CACHE['timestamp']) > 60:
        success = scrape_couponzguru()
            
    import random
    if not COUPON_CACHE['coupons']:
        return jsonify([])
        
    shuffled = random.sample(COUPON_CACHE['coupons'], min(4, len(COUPON_CACHE['coupons'])))
    return jsonify(shuffled)

if __name__ == '__main__':
    # Use use_reloader=False so it doesn't load the model twice into memory!
    app.run(debug=True, host='0.0.0.0', use_reloader=False)
