import os
import psycopg2
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

POSTGRES_URI = os.getenv("SUPABASE_POSTGRES_URI")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

gallery_data = [
    {
        "category": "Anime",
        "prompt": "A high-quality anime style illustration of a futuristic cyberpunk city, neon lights, highly detailed, Studio Ghibli style, vibrant colors",
        "local_path": r"C:\Users\VISHWANATH\.gemini\antigravity-ide\brain\44245b63-a8f1-4a50-a624-6a94ceb62bbc\anime_city_1783045930020.png"
    },
    {
        "category": "Realistic",
        "prompt": "A photorealistic majestic snow leopard sitting on a mountain edge at sunset, hyper-detailed fur, 8k resolution, national geographic photography",
        "local_path": r"C:\Users\VISHWANATH\.gemini\antigravity-ide\brain\44245b63-a8f1-4a50-a624-6a94ceb62bbc\realistic_leopard_1783045939918.png"
    },
    {
        "category": "3D",
        "prompt": "A cute 3D Pixar style glowing magical mushroom in an enchanted forest, unreal engine 5 render, cinematic lighting, highly detailed",
        "local_path": r"C:\Users\VISHWANATH\.gemini\antigravity-ide\brain\44245b63-a8f1-4a50-a624-6a94ceb62bbc\3d_mushroom_1783045872249.png"
    },
    {
        "category": "Logos",
        "prompt": "A minimalist, modern, premium tech logo of a glowing geometric fox, dark background, vector art style, sleek and elegant",
        "local_path": r"C:\Users\VISHWANATH\.gemini\antigravity-ide\brain\44245b63-a8f1-4a50-a624-6a94ceb62bbc\logo_fox_1783045881406.png"
    },
    {
        "category": "Product",
        "prompt": "Professional product photography of a sleek futuristic perfume bottle made of glowing obsidian glass, water splashes, studio lighting, hyper-realistic",
        "local_path": r"C:\Users\VISHWANATH\.gemini\antigravity-ide\brain\44245b63-a8f1-4a50-a624-6a94ceb62bbc\product_perfume_1783045891643.png"
    },
    {
        "category": "Portraits",
        "prompt": "A stunning cinematic portrait of a wise old wizard with a glowing blue staff, highly detailed face, dramatic lighting, fantasy concept art",
        "local_path": r"C:\Users\VISHWANATH\.gemini\antigravity-ide\brain\44245b63-a8f1-4a50-a624-6a94ceb62bbc\portrait_wizard_1783045901942.png"
    },
    {
        "category": "Architecture",
        "prompt": "A majestic modern glass mansion built into a cliff over the ocean at sunset, hyper-realistic, architectural visualization, 8k",
        "local_path": r"C:\Users\VISHWANATH\.gemini\antigravity-ide\brain\44245b63-a8f1-4a50-a624-6a94ceb62bbc\architecture_mansion_1783045911529.png"
    }
]

def create_table_and_seed():
    print("Connecting to database...")
    conn = psycopg2.connect(POSTGRES_URI)
    c = conn.cursor()

    print("Creating live_gallery table...")
    c.execute('''
        CREATE TABLE IF NOT EXISTS live_gallery (
            id SERIAL PRIMARY KEY,
            category TEXT NOT NULL,
            prompt TEXT NOT NULL,
            image_url TEXT NOT NULL
        )
    ''')
    
    # Clear existing data if re-running
    c.execute('TRUNCATE TABLE live_gallery')
    conn.commit()

    bucket_name = 'images'
    folder_name = 'gallery'

    for item in gallery_data:
        category = item['category']
        local_path = item['local_path']
        prompt = item['prompt']
        
        file_name = f"{folder_name}/{category.lower()}.png"
        print(f"Uploading {category} image to Supabase Storage: {file_name}")
        
        try:
            with open(local_path, "rb") as f:
                image_bytes = f.read()
                
            # Attempt to upload, if exists we just get the URL
            try:
                supabase.storage.from_(bucket_name).upload(
                    path=file_name,
                    file=image_bytes,
                    file_options={"content-type": "image/png"}
                )
            except Exception as up_err:
                # If it already exists, update it or just ignore
                print(f"  Note: {up_err}. Proceeding to get public URL.")

            public_url = supabase.storage.from_(bucket_name).get_public_url(file_name)
            
            c.execute("INSERT INTO live_gallery (category, prompt, image_url) VALUES (%s, %s, %s)", 
                      (category, prompt, public_url))
            print(f"  Inserted {category} into database.")
            
        except Exception as e:
            print(f"Error processing {category}: {e}")
            conn.rollback()
            
    conn.commit()
    conn.close()
    print("Gallery seeding complete!")

if __name__ == "__main__":
    create_table_and_seed()
