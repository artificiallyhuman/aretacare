import boto3
from botocore.exceptions import ClientError
from app.core.config import settings
from typing import Optional
import logging
import asyncio
import time
from urllib.parse import quote

logger = logging.getLogger(__name__)

# S3 retry configuration
S3_MAX_RETRIES = 3
S3_RETRY_DELAY = 0.5  # Initial delay in seconds
S3_MAX_RETRY_DELAY = 4  # Max delay between retries

# Max keys per delete_objects call — 1000 is the S3 API hard limit.
S3_DELETE_BATCH_SIZE = 1000

# Retryable S3 error codes (transient failures)
RETRYABLE_S3_ERROR_CODES = {
    'RequestTimeout',
    'ServiceUnavailable',
    'SlowDown',
    'InternalError',
    'RequestTimeTooSkewed',
}


def _is_retryable_s3_error(error: ClientError) -> bool:
    """Check if an S3 error is retryable (transient)."""
    error_code = error.response.get('Error', {}).get('Code', '')
    return error_code in RETRYABLE_S3_ERROR_CODES


class S3Service:
    def __init__(self):
        self.bucket_name = settings.S3_BUCKET_NAME
        self.key_prefix = settings.S3_KEY_PREFIX  # e.g., "dev/" or "prod/"
        # Shared client for synchronous operations (presigned URLs)
        self._sync_client = None

    def _get_sync_client(self):
        """Get shared client for main thread operations (presigned URLs)."""
        if self._sync_client is None:
            self._sync_client = boto3.client(
                's3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_REGION
            )
        return self._sync_client

    def _create_thread_client(self):
        """Create fresh S3 client for thread pool operations.

        Prevents SignatureDoesNotMatch errors during concurrent uploads
        by avoiding shared client state across threads.
        """
        return boto3.client(
            's3',
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION
        )

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

    # Content types that are safe to display inline (no XSS risk)
    INLINE_SAFE_CONTENT_TYPES = {
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
    }

    def _put_object_sync(self, key: str, file_content: bytes, content_type: str, filename: str = None):
        """Synchronous S3 put_object with retry logic (for thread pool)"""
        params = {
            'Bucket': self.bucket_name,
            'Key': key,
            'Body': file_content,
            'ContentType': content_type,
            'ServerSideEncryption': 'AES256'
        }

        # Use 'inline' for safe content types (images, PDFs, text) to allow preview
        # Use 'attachment' for everything else to prevent browser execution (XSS protection)
        disposition = 'inline' if content_type in self.INLINE_SAFE_CONTENT_TYPES else 'attachment'

        if filename:
            # Sanitize filename for Content-Disposition header
            # Handle non-ASCII characters using RFC 5987 encoding to prevent
            # AWS SignatureDoesNotMatch errors from special characters
            try:
                # Try ASCII-only filename first (fastest path)
                filename.encode('ascii')
                safe_filename = filename.replace('"', '\\"').replace('\n', '').replace('\r', '')
                params['ContentDisposition'] = f'{disposition}; filename="{safe_filename}"'
            except UnicodeEncodeError:
                # Filename contains non-ASCII characters - use RFC 5987 encoding
                # Provide both ASCII fallback and UTF-8 encoded version
                ascii_fallback = ''.join(c if ord(c) < 128 else '_' for c in filename)
                ascii_fallback = ascii_fallback.replace('"', '_').replace('\n', '').replace('\r', '')
                # RFC 5987: filename*=UTF-8''encoded_filename
                encoded_filename = quote(filename, safe='')
                params['ContentDisposition'] = f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_filename}"
        else:
            params['ContentDisposition'] = disposition

        last_exception = None
        for attempt in range(S3_MAX_RETRIES):
            try:
                client = self._create_thread_client()
                client.put_object(**params)
                return
            except ClientError as e:
                last_exception = e
                if _is_retryable_s3_error(e) and attempt < S3_MAX_RETRIES - 1:
                    retry_delay = min(S3_RETRY_DELAY * (2 ** attempt), S3_MAX_RETRY_DELAY)
                    logger.warning(
                        f"S3 put_object transient error (attempt {attempt + 1}/{S3_MAX_RETRIES}): "
                        f"{e.response.get('Error', {}).get('Code')}. Retrying in {retry_delay}s..."
                    )
                    time.sleep(retry_delay)
                    continue
                raise
        raise last_exception

    def _get_object_sync(self, key: str) -> bytes:
        """Synchronous S3 get_object with retry logic (for thread pool)"""
        last_exception = None
        for attempt in range(S3_MAX_RETRIES):
            try:
                client = self._create_thread_client()
                response = client.get_object(
                    Bucket=self.bucket_name,
                    Key=key
                )
                return response['Body'].read()
            except ClientError as e:
                last_exception = e
                if _is_retryable_s3_error(e) and attempt < S3_MAX_RETRIES - 1:
                    retry_delay = min(S3_RETRY_DELAY * (2 ** attempt), S3_MAX_RETRY_DELAY)
                    logger.warning(
                        f"S3 get_object transient error (attempt {attempt + 1}/{S3_MAX_RETRIES}): "
                        f"{e.response.get('Error', {}).get('Code')}. Retrying in {retry_delay}s..."
                    )
                    time.sleep(retry_delay)
                    continue
                raise
        raise last_exception

    def _delete_object_sync(self, key: str):
        """Synchronous S3 delete_object with retry logic (for thread pool)"""
        last_exception = None
        for attempt in range(S3_MAX_RETRIES):
            try:
                client = self._create_thread_client()
                client.delete_object(
                    Bucket=self.bucket_name,
                    Key=key
                )
                return
            except ClientError as e:
                last_exception = e
                if _is_retryable_s3_error(e) and attempt < S3_MAX_RETRIES - 1:
                    retry_delay = min(S3_RETRY_DELAY * (2 ** attempt), S3_MAX_RETRY_DELAY)
                    logger.warning(
                        f"S3 delete_object transient error (attempt {attempt + 1}/{S3_MAX_RETRIES}): "
                        f"{e.response.get('Error', {}).get('Code')}. Retrying in {retry_delay}s..."
                    )
                    time.sleep(retry_delay)
                    continue
                raise
        raise last_exception

    async def upload_file(self, file_content: bytes, key: str, content_type: str, filename: str = None) -> bool:
        """Upload file to S3 bucket with AES-256 encryption (runs in thread pool)

        Args:
            file_content: The file bytes to upload
            key: S3 key (path) for the file
            content_type: MIME type of the file
            filename: Optional original filename for Content-Disposition header
        """
        try:
            await asyncio.to_thread(self._put_object_sync, key, file_content, content_type, filename)
            logger.info(f"Successfully uploaded file to S3: {key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to upload file to S3: {e}")

            # Log to database for admin visibility
            try:
                from app.services.error_logger import log_error_standalone
                log_error_standalone(
                    source="services.s3.upload_file",
                    error=e,
                    level="ERROR",
                    details={"key": key, "content_type": content_type}
                )
            except Exception:
                pass  # Don't let error logging crash the app

            return False

    async def download_file(self, key: str) -> Optional[bytes]:
        """Download file from S3 bucket (runs in thread pool)"""
        try:
            return await asyncio.to_thread(self._get_object_sync, key)
        except ClientError as e:
            logger.error(f"Failed to download file from S3: {e}")

            # Log to database for admin visibility
            try:
                from app.services.error_logger import log_error_standalone
                log_error_standalone(
                    source="services.s3.download_file",
                    error=e,
                    level="ERROR",
                    details={"key": key}
                )
            except Exception:
                pass  # Don't let error logging crash the app

            return None

    async def delete_file(self, key: str) -> bool:
        """Delete file from S3 bucket (runs in thread pool)"""
        try:
            await asyncio.to_thread(self._delete_object_sync, key)
            logger.info(f"Successfully deleted file from S3: {key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete file from S3: {e}")

            # Log to database for admin visibility
            try:
                from app.services.error_logger import log_error_standalone
                log_error_standalone(
                    source="services.s3.delete_file",
                    error=e,
                    level="WARNING",  # Deletion failures are often less critical
                    details={"key": key}
                )
            except Exception:
                pass  # Don't let error logging crash the app

            return False

    def _delete_objects_sync(self, keys: list) -> list:
        """Delete up to S3_DELETE_BATCH_SIZE keys in one call. Returns the keys that failed.

        Uses a single client for the whole batch so the connection is reused, and reports
        per-key failures rather than raising — matching delete_file()'s "log and continue"
        contract, since orphaned objects are swept up by the admin S3 cleanup.
        """
        if not keys:
            return []

        client = self._create_thread_client()
        failed = []

        for start in range(0, len(keys), S3_DELETE_BATCH_SIZE):
            chunk = keys[start:start + S3_DELETE_BATCH_SIZE]
            try:
                response = client.delete_objects(
                    Bucket=self.bucket_name,
                    Delete={
                        "Objects": [{"Key": k} for k in chunk],
                        "Quiet": True,  # only report errors, not every success
                    },
                )
                # delete_objects reports per-key problems in Errors[] instead of raising.
                for error in response.get("Errors", []) or []:
                    failed.append(error.get("Key"))
                    logger.error(
                        f"Failed to delete S3 file {error.get('Key')}: "
                        f"{error.get('Code')} {error.get('Message')}"
                    )
            except ClientError as e:
                # Whole-chunk failure (auth, network, throttling). Record every key in it.
                failed.extend(chunk)
                logger.error(f"S3 batch delete failed for {len(chunk)} key(s): {e}")

        return failed

    async def delete_files(self, keys: list) -> int:
        """Delete many S3 objects in batched calls. Returns the number deleted.

        Deleting one key per request meant one round trip (and, because a fresh client was
        built each time, one TLS handshake) per file — so removing a care session cost
        2P + I + M sequential round trips. This collapses that to one call per 1000 keys.

        Never raises: failures are logged and reported via the return count, because callers
        delete the database rows first and orphaned objects are handled by admin cleanup.
        """
        if not keys:
            return 0

        # Drop any None/empty keys defensively — a null thumbnail_s3_key would otherwise
        # fail the whole chunk.
        clean_keys = [k for k in keys if k]
        if not clean_keys:
            return 0

        try:
            failed = await asyncio.to_thread(self._delete_objects_sync, clean_keys)
        except Exception as e:  # pragma: no cover - defensive; _delete_objects_sync catches
            logger.error(f"Unexpected error during S3 batch delete: {e}")
            return 0

        deleted = len(clean_keys) - len(failed)
        logger.info(
            f"S3 batch delete: {deleted}/{len(clean_keys)} object(s) deleted"
            + (f", {len(failed)} failed" if failed else "")
        )
        return deleted

    # Presigned URL expiration constants (seconds)
    PRESIGNED_URL_DOCUMENT = 900       # 15 min for document downloads (healthcare data)
    PRESIGNED_URL_THUMBNAIL = 21600    # 6 hours for thumbnail previews (low sensitivity)
    PRESIGNED_URL_AUDIO = 14400        # 4 hours for audio playback

    def generate_presigned_url(self, key: str, expiration: int = 900) -> Optional[str]:
        """Generate presigned URL for file download (CPU-bound, fast enough to be sync)

        Default expiration is 15 minutes (900 seconds) for healthcare data security.
        Use class constants for specific content types:
        - PRESIGNED_URL_DOCUMENT (900s) for documents
        - PRESIGNED_URL_THUMBNAIL (21600s) for thumbnails
        - PRESIGNED_URL_AUDIO (14400s) for audio playback
        """
        try:
            url = self._get_sync_client().generate_presigned_url(
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
