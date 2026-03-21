import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import alerts, compliance, llm, scan

load_dotenv()

app = FastAPI(title="DevPulse API Security API", version="1.0.0")

_origins_raw = os.getenv("FRONTEND_URL", "http://localhost:5173")
_origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan.router)
app.include_router(llm.router)
app.include_router(alerts.router)
app.include_router(compliance.router)


@app.get("/health")
def health():
    return {"status": "ok"}
