"""Streaming upload helpers.

Multipart upload bodies must be size-capped *before* the full body is buffered
into memory, otherwise an attacker can OOM the worker with a single large POST
even when an application-level size limit is in place. FastAPI's `UploadFile.read()`
(no args) buffers the entire body before returning, so the size check happens
too late. These helpers stream the body in fixed-size chunks and abort early
once the configured maximum is exceeded.
"""
from fastapi import HTTPException, UploadFile

DEFAULT_CHUNK_SIZE = 1024 * 1024  # 1 MiB


async def read_upload_with_limit(
    file: UploadFile,
    max_size: int,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> bytes:
    """Stream-read an UploadFile into memory, aborting if it exceeds ``max_size``.

    Compared to ``await file.read()`` (which buffers the whole body before any
    application code runs), this raises HTTP 400 as soon as the running byte
    count exceeds the limit — bounding peak memory to roughly ``max_size +
    chunk_size`` bytes per upload regardless of the actual request body length.

    Args:
        file: FastAPI ``UploadFile`` (Starlette UploadFile under the hood).
        max_size: Maximum allowed size in bytes. Any upload whose accumulated
            bytes exceed this value triggers an HTTP 400 with a descriptive
            detail string.
        chunk_size: Read chunk size. Default 1 MiB balances allocation count
            against responsiveness.

    Returns:
        The full file contents as bytes. Caller owns the buffer.

    Raises:
        HTTPException(400): If the upload exceeds ``max_size``. We use 400
            rather than the HTTP-spec-correct 413 because the currently-shipped
            iOS APIClient only branches on 400/401/403/404/422/429/5xx and
            falls through to a generic "Unexpected error" for 413, which would
            hide the size-exceeded message from users on older iOS builds.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_size:
            max_mb = max_size / (1024 * 1024)
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed size of {max_mb:.0f}MB",
            )
        chunks.append(chunk)
    return b"".join(chunks)
