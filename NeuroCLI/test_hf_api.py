import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

HF_API_KEY = os.getenv("HUGGINGFACE_API_KEY") or os.getenv("HF_TOKEN")
MODEL_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"

def test_huggingface_api():
    if not HF_API_KEY:
        print("Error: No Hugging Face API key found in .env file.")
        return

    headers = {
        "Authorization": f"Bearer {HF_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "inputs": "A test image of a cute cat"
    }
    
    print("Sending test request to Hugging Face API...")
    
    try:
        response = requests.post(MODEL_URL, headers=headers, json=payload)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("Success! Your API key is working and has credits.")
        elif response.status_code == 402:
            print("Error 402: Payment Required.")
            print("Message:", response.json().get('error', response.text))
            print("\nDiagnosis: You have run out of free monthly credits on this Hugging Face account.")
        else:
            print(f"Other Error: {response.text}")
            
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    test_huggingface_api()
