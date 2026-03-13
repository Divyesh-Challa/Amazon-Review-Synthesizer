import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Ensure .env is loaded regardless of current working directory
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    LLM_PROVIDER: str = "gemini"  # 'gemini' or 'mock'
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    MAX_REVIEWS: int = 15
    MAX_CHARS_PER_REVIEW: int = 600

    class Config:
        env_file = os.path.join(BASE_DIR, ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
