import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    LLM_PROVIDER: str = "gemini"  # 'gemini' or 'mock'
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    MAX_REVIEWS: int = 15
    MAX_CHARS_PER_REVIEW: int = 600

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
