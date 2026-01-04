from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_TIMEOUT_SECONDS: int = 60  # Timeout for API requests
    OPENAI_MAX_RETRIES: int = 3  # Max retry attempts for transient failures
    OPENAI_RETRY_DELAY: int = 1  # Initial retry delay in seconds (doubles each attempt)
    OPENAI_MAX_RETRY_DELAY: int = 16  # Maximum retry delay in seconds

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

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._validate_secret_key()

    def _validate_secret_key(self):
        """Validate SECRET_KEY is secure for production use."""
        insecure_defaults = [
            "secret", "changeme", "your-secret-key", "your_secret_key",
            "development", "dev", "test", "password", "123456"
        ]
        key_lower = self.SECRET_KEY.lower()

        # Check for known insecure defaults
        if key_lower in insecure_defaults:
            raise ValueError(
                "SECRET_KEY is set to an insecure default value. "
                "Please set a secure random key (at least 32 characters) in production."
            )

        # Check minimum length (32 chars = 256 bits for HS256)
        if len(self.SECRET_KEY) < 32:
            raise ValueError(
                f"SECRET_KEY is too short ({len(self.SECRET_KEY)} chars). "
                "Please use at least 32 characters for secure JWT signing."
            )

    # Admin
    ADMIN_EMAILS: str = ""  # Comma-separated list of admin email addresses
    CONTROL_SIGNUPS: bool = True  # When True, registration requires admin invitation (waitlist mode)
    AUDIT_LOG_RETENTION_DAYS: int = 90  # Auto-delete audit logs older than this
    ERROR_LOG_RETENTION_DAYS: int = 30  # Auto-delete error logs older than this
    API_LOG_RETENTION_DAYS: int = 30  # Auto-delete API logs older than this
    SECURITY_LOG_RETENTION_DAYS: int = 90  # Auto-delete security logs older than this
    ADMIN_REPORT_RETENTION_DAYS: int = 30  # Auto-delete admin reports older than this

    @property
    def admin_emails_list(self) -> List[str]:
        if not self.ADMIN_EMAILS:
            return []
        return [email.strip().lower() for email in self.ADMIN_EMAILS.split(",") if email.strip()]

    # Email (for password reset and notifications)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "noreply@aretacare.com"
    SMTP_PASSWORD: str = ""  # Gmail App Password
    SMTP_FROM_EMAIL: str = "noreply@aretacare.com"
    SMTP_FROM_NAME: str = "AretaCare"
    FRONTEND_URL: str = "http://localhost:3001"
    FEEDBACK_EMAIL: str = "feedback@aretacare.com"  # Email address to receive feedback submissions

    # hCaptcha (for spam prevention)
    HCAPTCHA_SECRET_KEY: str = ""  # hCaptcha secret key

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()
