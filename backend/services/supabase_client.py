import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

_url = os.getenv("SUPABASE_URL", "").strip()
_key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

if not _url or not _key:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.")

supabase: Client = create_client(_url, _key)
