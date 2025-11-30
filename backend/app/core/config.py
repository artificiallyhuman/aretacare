from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # OpenAI
    OPENAI_API_KEY: str

    # AWS S3
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str
    S3_KEY_PREFIX: str = ""  # Environment prefix (e.g., "dev/" or "prod/") to separate files in shared bucket

    # Application
    SECRET_KEY: str
    DEBUG: bool = False
    CORS_ORIGINS: str = "http://localhost:3000"

    # Session
    SESSION_TIMEOUT_MINUTES: int = 60

    # Admin
    ADMIN_EMAILS: str = ""  # Comma-separated list of admin email addresses
    AUDIT_LOG_RETENTION_DAYS: int = 90  # GDPR compliance: auto-delete audit logs older than this

    @property
    def admin_emails_list(self) -> List[str]:
        if not self.ADMIN_EMAILS:
            return []
        return [email.strip().lower() for email in self.ADMIN_EMAILS.split(",") if email.strip()]

    # Email (for password reset)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "aretacare@gmail.com"
    SMTP_PASSWORD: str = ""  # Gmail App Password
    SMTP_FROM_EMAIL: str = "aretacare@gmail.com"
    SMTP_FROM_NAME: str = "AretaCare"
    FRONTEND_URL: str = "http://localhost:3001"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()
