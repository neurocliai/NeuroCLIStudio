import requests
import time

url = "http://127.0.0.1:5000/generate"
payload = {
    "prompt": "A futuristic glowing crystal floating in space, high quality, 8k"
}

print("Sending request to generate image... (This may take a minute depending on your CPU)")
start_time = time.time()

try:
    response = requests.post(url, json=payload, timeout=120)
    
    if response.status_code == 200:
        data = response.json()
        print("\nSUCCESS! ✅")
        print(f"Time taken: {time.time() - start_time:.2f} seconds")
        print(f"Generated Chat ID: {data.get('chat_id')}")
        print("Image base64 successfully received. Check your Supabase 'images' bucket to confirm the physical file was uploaded!")
    else:
        print(f"\nFAILED! ❌")
        print(f"Status Code: {response.status_code}")
        print(f"Error: {response.text}")
        
except requests.exceptions.ConnectionError:
    print("FAILED: Could not connect to the server. Is app.py running on port 5000?")
except Exception as e:
    print(f"FAILED: {str(e)}")
