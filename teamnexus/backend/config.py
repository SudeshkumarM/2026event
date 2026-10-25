import os
import secrets
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

_DEFAULT_SECRET_KEY = secrets.token_hex(32)


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY") or _DEFAULT_SECRET_KEY
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or SECRET_KEY
    JWT_EVENT_SECRET = os.getenv("JWT_EVENT_SECRET") or SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.getenv("JWT_ACCESS_HOURS", 24)))
    
    # Set DATABASE_URL to the Supabase PostgreSQL connection string in production.
    # When unset, the backend uses SQLite for local development.
    DATABASE_URL = os.getenv("DATABASE_URL")
    
    # App Settings
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    VERIFY_BASE_URL = os.getenv("VERIFY_BASE_URL", "http://localhost:5173/verify")
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload
    
    # Registration Defaults
    REQUIRE_SAME_INSTITUTION = os.getenv("REQUIRE_SAME_INSTITUTION", "false").lower() == "true"
    REQUIRE_SAME_DEPARTMENT = os.getenv("REQUIRE_SAME_DEPARTMENT", "false").lower() == "true"
    DEFAULT_EVENT_NAME = "AI TARGET STRIKE 2026"
    REGISTRATION_GATE_PASSWORD = os.getenv("REGISTRATION_GATE_PASSWORD")
    INITIAL_ADMIN_USERNAME = os.getenv("INITIAL_ADMIN_USERNAME", "admin")
    INITIAL_ADMIN_PASSWORD = os.getenv("INITIAL_ADMIN_PASSWORD")
