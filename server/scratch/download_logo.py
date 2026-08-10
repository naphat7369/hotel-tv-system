import sys
import os
import requests
from duckduckgo_search import DDGS
from urllib.parse import urlparse

def download_image(query, name):
    try:
        ddgs = DDGS()
        results = list(ddgs.images(
            query,
            max_results=3,
        ))
        
        if not results:
            print(f"ERROR: No results for {name}")
            return
            
        for result in results:
            url = result['image']
            try:
                headers = {'User-Agent': 'Mozilla/5.0'}
                response = requests.get(url, headers=headers, timeout=5)
                if response.status_code == 200:
                    ext = '.png' # Force save as png or keep original? We'll just save as png to standardize, though it might be jpg.
                    # It's better to get the actual extension
                    parsed = urlparse(url)
                    path = parsed.path
                    orig_ext = os.path.splitext(path)[1]
                    if not orig_ext:
                        orig_ext = '.png'
                        
                    filename = f"{name.replace(' ', '_').lower()}{orig_ext}"
                    filepath = os.path.join('/home/itadmin/hotel-tv-system/uploads/logos', filename)
                    
                    with open(filepath, 'wb') as f:
                        f.write(response.content)
                    
                    print(f"SUCCESS:/uploads/logos/{filename}")
                    return
            except Exception as e:
                continue
                
        print(f"ERROR: Failed to download any image for {name}")
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) > 2:
        query = sys.argv[1]
        name = sys.argv[2]
        download_image(query, name)
