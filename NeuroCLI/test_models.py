import asyncio
import os
from goblin import generate

MODELS = [
    "goblin-sd",
    "goblin-flux",
    "goblin-anime",
    "goblin-realistic",
    "goblin-pro"
]

async def test_single_model(model):
    try:
        output_file = f"test_{model}.png"
        print(f"[{model}] Started testing...")
        
        # Test generation
        await generate("a red cube", model=model, output=output_file)
        
        if os.path.exists(output_file):
            print(f"[SUCCESS] {model} is working perfectly!")
            os.remove(output_file) # Clean up
        else:
            print(f"[FAILED] {model} finished without errors, but the file was not saved.")
            
    except Exception as e:
        print(f"[ERROR] {model} failed with exception: {e}")

async def test_models():
    print("Starting concurrent model diagnostics...\n")
    # Run all model tests at the exact same time
    tasks = [test_single_model(model) for model in MODELS]
    await asyncio.gather(*tasks)
    print("\nAll diagnostics completed!")
        
if __name__ == "__main__":
    asyncio.run(test_models())
