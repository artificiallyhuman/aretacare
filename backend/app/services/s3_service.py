import boto3
from botocore.exceptions import ClientError
from app.core.config import settings
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class S3Service:
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION
        )
        self.bucket_name = settings.S3_BUCKET_NAME
        self.key_prefix = settings.S3_KEY_PREFIX  # e.g., "dev/" or "prod/"

    def get_prefixed_key(self, key: str) -> str:
        """Add environment prefix to S3 key for multi-environment bucket sharing."""
        if self.key_prefix:
            return f"{self.key_prefix}{key}"
        return key

    def get_prefixed_path(self, path: str) -> str:
        """Add environment prefix to S3 path/prefix for listing operations."""
        if self.key_prefix:
            return f"{self.key_prefix}{path}"
        return path

    async def upload_file(self, file_content: bytes, key: str, content_type: str) -> bool:
        """Upload file to S3 bucket"""
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=file_content,
                ContentType=content_type
            )
            logger.info(f"Successfully uploaded file to S3: {key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to upload file to S3: {e}")
            return False

    async def download_file(self, key: str) -> Optional[bytes]:
        """Download file from S3 bucket"""
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=key
            )
            return response['Body'].read()
        except ClientError as e:
            logger.error(f"Failed to download file from S3: {e}")
            return None

    async def delete_file(self, key: str) -> bool:
        """Delete file from S3 bucket"""
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=key
            )
            logger.info(f"Successfully deleted file from S3: {key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete file from S3: {e}")
            return False

    def generate_presigned_url(self, key: str, expiration: int = 3600) -> Optional[str]:
        """Generate presigned URL for file download"""
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': key
                },
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None


s3_service = S3Service()
