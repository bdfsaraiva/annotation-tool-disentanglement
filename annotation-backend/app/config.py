from functools import lru_cache
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    
    # Security
    SECRET_KEY: str = Field(..., min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Password policy
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_DIGIT: bool = False
    PASSWORD_REQUIRE_LETTER: bool = True

    # Auth rate limiting
    AUTH_RATE_LIMIT_REQUESTS: int = 10
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = 60
    
    # CORS - explicit per environment
    CORS_ORIGINS: List[str]

    # Upload/import limits
    MAX_UPLOAD_MB: int = 10
    MAX_IMPORT_ROWS: int = 50000
    
    # Admin user (created on first run)
    FIRST_ADMIN_USERNAME: Optional[str] = None
    FIRST_ADMIN_PASSWORD: Optional[str] = None

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def SQLALCHEMY_DATABASE_URL(self) -> str:
        return self.DATABASE_URL



@lru_cache()
def get_settings() -> Settings:
    return Settings() 
