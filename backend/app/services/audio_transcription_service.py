"""Background audio transcription job.

`POST /conversation/transcribe` persists the *original* upload to S3, commits the
`audio_recordings` row as ``processing`` and hands the temp file to
`start_transcription_job()`. The job transcodes to MP3, swaps the stored object,
transcribes in 20-minute chunks, categorises, finalises the row and runs journal
synthesis — all after the HTTP response has gone out, so recording length can no
longer push the request past Cloudflare's ~100s origin timeout.

Design notes (also summarised in CLAUDE.md, "Audio transcription"):

- Jobs are `asyncio.create_task`, not Starlette `BackgroundTasks`. On FastAPI 0.104 the
  `get_db` yield-teardown runs *after* background tasks, so a BackgroundTask would keep
  the request's pooled connection idle-in-transaction for the whole job.
- Every DB write is a query-update filtered on ``transcription_status = 'processing'``.
  A rowcount of 0 means the recording was deleted, or finalised by the shutdown hook,
  and the job stops without spending more on OpenAI. The per-chunk heartbeat
  (`transcription_updated_at`) doubles as the liveness signal for the stale rule in
  `effective_transcription_status()`.
- The CPU/memory-heavy stage (ffmpeg + chunk uploads to OpenAI) runs under a
  per-process semaphore. Legacy inline requests bypass it: they are bounded by the
  rate limit and would otherwise time out waiting behind background work.
- Temp files belong to the job from the moment `start_transcription_job()` returns.
- A job killed by SIGKILL / autoscale-down is not resumed (the temp MP3 is gone);
  the row is reported ``failed`` once its heartbeat is stale and can be retried via
  `POST /audio-recordings/{session_id}/{recording_id}/retranscribe`.
"""

import asyncio
import contextlib
import io
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import sentry_sdk
from fastapi import HTTPException

from app.core.config import settings
from app.models.audio_recording import AudioRecording, AudioRecordingCategory, TranscriptionStatus
from app.services.openai_service import openai_service
from app.services.s3_service import s3_service

logger = logging.getLogger(__name__)

# Byte size is a poor proxy for processing cost — 100MB of low-bitrate audio
# can be many hours long. The duration cap bounds transcription time/cost and
# temp-file disk usage.
MAX_AUDIO_DURATION_SECONDS = 4 * 60 * 60  # 4 hours

# OpenAI's transcription API rejects requests over ~1400 seconds of audio
MAX_CHUNK_DURATION_SECONDS = 1200  # 20 minutes (safely under the limit)

# The original upload is stored under this marker until the job swaps in the MP3
ORIGINAL_KEY_MARKER = ".original"

# Extensions the upload route accepts (matching conversation._AUDIO_CONTENT_TYPES),
# which is also everything a stored key's extension can legitimately be.
_TEMP_SUFFIX_WHITELIST = {".mp3", ".mpeg", ".mpga", ".m4a", ".mp4", ".wav", ".webm", ".ogg"}


def safe_temp_suffix(name: str, default: str = ".mp3") -> str:
    """A temp-file suffix derived from `name`, clamped to the known audio set.

    Uploaded filenames (and therefore stored S3 keys, which embed them) are
    attacker-controlled — a multipart filename can even contain path
    separators. Nothing user-influenced may reach a filesystem call
    unlaundered (CodeQL py/path-injection), so anything outside the whitelist
    falls back to `default`; ffmpeg detects the real container from content.

    Deliberately returns the *whitelist's* string, never a slice of the input:
    returning the input after an `in`-check keeps the value tainted as far as
    dataflow analysis is concerned, whereas a value drawn from a constant set
    provably isn't.
    """
    ext = os.path.splitext(os.path.basename(name))[1].lower()
    for allowed in _TEMP_SUFFIX_WHITELIST:
        if ext == allowed:
            return allowed
    return default

TRANSCRIPTION_FAILED_DETAIL = (
    "Transcription failed, but the recording was saved and can be played back from Audio Recordings."
)
TRANSCRIPTION_EMPTY_DETAIL = (
    "Failed to transcribe audio. The recording was saved and can be played back from Audio Recordings."
)


def audio_too_long_error(duration_seconds: float) -> HTTPException:
    hours = duration_seconds / 3600
    max_hours = MAX_AUDIO_DURATION_SECONDS / 3600
    return HTTPException(
        status_code=400,
        detail=(
            f"Audio recording is too long ({hours:.1f} hours). "
            f"Maximum supported duration is {max_hours:.0f} hours."
        ),
    )


# ---------------------------------------------------------------------------
# ffmpeg / ffprobe helpers
#
# These shell out to subprocesses working on temp files, so peak memory stays
# flat regardless of recording length. (The previous pydub pipeline decoded the
# entire file to raw PCM in RAM — 1-2 GB for a multi-hour recording — which
# OOM-killed the container.) All are blocking and must run via asyncio.to_thread.
# ---------------------------------------------------------------------------

def probe_audio_duration(audio_path: str) -> Optional[float]:
    """Duration in seconds from container metadata, without decoding.

    Returns None when the container doesn't report one (e.g. streamed
    MediaRecorder webm) or the file is unreadable — callers fall back to
    probing the transcoded MP3, which always has a duration.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return None
        return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError):
        return None


def _transcode_to_mp3(input_path: str, output_path: str):
    """Transcode any supported audio container to 128 kbps MP3 on disk."""
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", input_path,
            "-vn", "-acodec", "libmp3lame", "-b:a", "128k",
            output_path,
        ],
        capture_output=True, text=True, timeout=900,
    )
    if result.returncode != 0:
        raise ValueError(f"ffmpeg transcode failed: {result.stderr.strip()[:500]}")


def _segment_mp3(input_path: str, output_dir: str, segment_seconds: int) -> list:
    """Split an MP3 into ~segment_seconds pieces without re-encoding.

    Uses the ffmpeg segment muxer with stream copy — MP3 frames are
    independently decodable, so cutting at frame boundaries is safe and the
    pass is I/O-bound.
    """
    pattern = os.path.join(output_dir, "chunk_%04d.mp3")
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", input_path,
            "-f", "segment", "-segment_time", str(segment_seconds),
            "-c", "copy", pattern,
        ],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise ValueError(f"ffmpeg segmentation failed: {result.stderr.strip()[:500]}")
    return sorted(
        os.path.join(output_dir, name)
        for name in os.listdir(output_dir)
        if name.startswith("chunk_") and name.endswith(".mp3")
    )


def _read_file_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


# ---------------------------------------------------------------------------
# S3 key layout
# ---------------------------------------------------------------------------

def build_audio_keys(session_id: str, original_name: str, file_ext: str) -> Tuple[str, str]:
    """(source_key, mp3_key) for a new upload.

    The original is stored as `<base>.original<ext>` and replaced by `<base>.mp3`
    once transcoded, so the two keys can never collide (an uploaded .mp3 would
    otherwise overwrite itself and then be deleted as the "original").
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    base = f"audio/{session_id}/{timestamp}_{unique_id}_{original_name}"
    return (
        s3_service.get_prefixed_key(f"{base}{ORIGINAL_KEY_MARKER}{file_ext}"),
        s3_service.get_prefixed_key(f"{base}.mp3"),
    )


def is_original_upload_key(s3_key: str) -> bool:
    root, _ext = os.path.splitext(os.path.basename(s3_key))
    return root.endswith(ORIGINAL_KEY_MARKER)


def mp3_key_for(s3_key: str) -> str:
    """The MP3 key a recording will end up under (identity for already-converted rows).

    Keys from before the background job (no `.original` marker, any container
    extension) map to a sibling `.mp3` key — mapping them to themselves would
    make the post-swap `delete_file(source_key)` delete the MP3 just uploaded.
    """
    if is_original_upload_key(s3_key):
        root, _ext = os.path.splitext(s3_key)
        return f"{root[:-len(ORIGINAL_KEY_MARKER)]}.mp3"
    root, ext = os.path.splitext(s3_key)
    if ext.lower() == ".mp3":
        return s3_key
    return f"{root}.mp3"


def stored_object_is_mp3(s3_key: str) -> bool:
    """Whether the stored object is already an MP3 container (no transcode needed).

    Decided by the actual extension, not the `.original` marker: rows from
    before the background job carry unmarked `.m4a`/`.webm`/`.wav` keys, and
    treating those as MP3 made a retry segment AAC with `-c copy` (which
    fails) or upload raw bytes to OpenAI labelled `audio/mpeg`.
    """
    return os.path.splitext(s3_key)[1].lower() == ".mp3"


# ---------------------------------------------------------------------------
# Status helpers
# ---------------------------------------------------------------------------

def effective_transcription_status(recording: AudioRecording) -> str:
    """What clients should see. A 'processing' row whose heartbeat has gone quiet
    belongs to a job that died (deploy, SIGKILL, autoscale-down) and is reported
    as 'failed' so the user gets the Retry action instead of an endless spinner."""
    status = recording.transcription_status or TranscriptionStatus.COMPLETED.value
    if status == TranscriptionStatus.PROCESSING.value:
        last_beat = recording.transcription_updated_at or recording.created_at
        if last_beat and datetime.utcnow() - last_beat > timedelta(seconds=settings.AUDIO_TRANSCRIPTION_STALE_SECONDS):
            return TranscriptionStatus.FAILED.value
    return status


def update_processing_recording(recording_id: int, values: dict) -> int:
    """Query-update the row while it is still 'processing'; returns the rowcount.

    0 means the recording was deleted (the DELETE route also removes its S3
    object) or finalised elsewhere — the caller must stop. Always stamps the
    heartbeat. Opens and closes its own session so no connection is held across
    the OpenAI calls that surround it. Raises on DB errors.
    """
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        count = (
            db.query(AudioRecording)
            .filter(
                AudioRecording.id == recording_id,
                AudioRecording.transcription_status == TranscriptionStatus.PROCESSING.value,
            )
            .update({**values, "transcription_updated_at": datetime.utcnow()}, synchronize_session=False)
        )
        db.commit()
        return count
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def mark_transcription_failed(recording_id: int) -> None:
    """Best-effort 'failed' write; a no-op if the row is no longer 'processing'."""
    try:
        update_processing_recording(recording_id, {"transcription_status": TranscriptionStatus.FAILED.value})
    except Exception as e:
        logger.error(f"Could not mark audio recording {recording_id} as failed: {e}")


# ---------------------------------------------------------------------------
# The job
# ---------------------------------------------------------------------------

class TranscriptionJobError(Exception):
    """The job failed; `detail` is safe to show to the user."""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


@dataclass
class TranscriptionJobResult:
    transcribed_text: str
    duration: Optional[float]
    mp3_key: Optional[str]
    stopped: bool = False  # recording deleted / finalised elsewhere before completion


_jobs: Dict[int, asyncio.Task] = {}
_semaphore: Optional[asyncio.Semaphore] = None


def _stage_limiter(use_semaphore: bool):
    global _semaphore
    if not use_semaphore:
        return contextlib.nullcontext()
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(settings.AUDIO_TRANSCRIPTION_CONCURRENCY)
    return _semaphore


def _stopped(recording_id: int, duration: Optional[float], mp3_key: Optional[str]) -> TranscriptionJobResult:
    logger.info(f"Audio recording {recording_id} is no longer processing (deleted or finalised elsewhere); stopping job")
    return TranscriptionJobResult(transcribed_text="", duration=duration, mp3_key=mp3_key, stopped=True)


def _log_job_error(error: Exception, user_id: str, session_id: str, recording_id: int, filename: str) -> None:
    # Parity with the synchronous route this replaced: there, a job failure surfaced as a
    # 500 that the Sentry Starlette integration captured. A background job has no response,
    # so capture explicitly — otherwise an OpenAI/S3 outage failing every transcription
    # would only show up in the admin error log.
    try:
        sentry_sdk.capture_exception(error)
    except Exception:
        pass
    try:
        from app.services.error_logger import log_error_standalone

        log_error_standalone(
            source="services.audio_transcription.job",
            error=error,
            level="ERROR",
            user_id=user_id,
            session_id=session_id,
            details={"filename": filename, "recording_id": recording_id},
        )
    except Exception:
        pass  # Don't let error logging crash the job


def _cleanup_temp_files(*paths: Optional[str], chunk_dir: Optional[str]) -> None:
    # Deliberately synchronous: this runs in `finally`, possibly during task
    # cancellation, where an extra await would not be safe.
    for path in paths:
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except OSError:
                pass
    if chunk_dir is not None:
        shutil.rmtree(chunk_dir, ignore_errors=True)


async def _synthesize_journal(
    *, recording_id: int, session_id: str, user_id: str, original_filename: str,
    transcribed_text: str, ai_summary: Optional[str], duration: float,
) -> None:
    from datetime import date as date_type

    from app.core.database import SessionLocal
    from app.services.journal_service import JournalService

    bg_db = SessionLocal()
    try:
        synthesis_result = await JournalService(bg_db).synthesize_from_audio(
            filename=original_filename,
            transcribed_text=transcribed_text,
            ai_summary=ai_summary or "",
            duration=duration,
            session_id=session_id,
            entry_date=date_type.today(),
            audio_id=recording_id,
            user_id=user_id,
        )
        if synthesis_result.should_create and len(synthesis_result.suggested_entries) > 0:
            logger.info(
                f"Created {len(synthesis_result.suggested_entries)} journal entries from audio recording {recording_id}"
            )
        else:
            logger.info(f"No journal entries created from audio recording {recording_id} (not journal-worthy)")
    except Exception as e:
        # The transcript is already saved; a synthesis failure must not undo that
        logger.warning(f"Failed to create journal entry from audio recording {recording_id}: {e}")
    finally:
        bg_db.close()


async def run_transcription_job(
    *,
    recording_id: int,
    session_id: str,
    user_id: str,
    source_key: str,
    mp3_key: str,
    original_name: str,
    original_filename: str,
    skip_synthesis: bool,
    use_semaphore: bool,
    source_temp_path: Optional[str] = None,
) -> TranscriptionJobResult:
    """Transcode → swap in the MP3 → transcribe → categorise → finalise → synthesise.

    The upload path hands over the request's temp file via `source_temp_path`;
    when it is None (retranscribe) the job downloads `source_key` itself, so the
    route can 202 without waiting on S3. Owns the temp file either way, plus
    everything it creates, and always removes them. Raises
    `TranscriptionJobError` (after marking the row 'failed') with a user-facing
    message; re-raises `CancelledError` after doing the same.
    """
    mp3_temp_path: Optional[str] = None
    chunk_dir: Optional[str] = None
    mp3_filename = f"{original_name}.mp3"
    duration_seconds: Optional[float] = None
    # Originals are always transcoded (user-supplied bytes, whatever the extension
    # claims); only an unmarked .mp3 — a key the swap itself produced — is trusted.
    needs_transcode = is_original_upload_key(source_key) or not stored_object_is_mp3(source_key)
    needs_swap = mp3_key != source_key

    try:
        async with _stage_limiter(use_semaphore):
            # Heartbeat now that a slot is held: the queue wait is unbounded, and a
            # queued row whose heartbeat went stale would be reported 'failed' and
            # invite a duplicate retry while this job is still alive.
            if update_processing_recording(recording_id, {}) == 0:
                return _stopped(recording_id, None, mp3_key)

            # 0. Retranscribe path: fetch the stored object back from S3
            if source_temp_path is None:
                source_fd, source_temp_path = tempfile.mkstemp(suffix=safe_temp_suffix(source_key))
                os.close(source_fd)
                if not await s3_service.download_file_to_path(source_key, source_temp_path):
                    raise ValueError(f"Could not download stored audio for recording {recording_id}")

            # 1. Transcode (a retry of an already-converted recording skips this)
            if needs_transcode:
                mp3_temp_fd, mp3_temp_path = tempfile.mkstemp(suffix=".mp3")
                os.close(mp3_temp_fd)
                await asyncio.to_thread(_transcode_to_mp3, source_temp_path, mp3_temp_path)
            else:
                mp3_temp_path = source_temp_path

            duration_seconds = await asyncio.to_thread(probe_audio_duration, mp3_temp_path)
            if duration_seconds is None:
                raise ValueError("Unable to determine audio duration after transcoding")
            if duration_seconds > MAX_AUDIO_DURATION_SECONDS:
                # Only reachable for containers without duration metadata (webm) —
                # the request phase rejects everything else before storing it
                raise TranscriptionJobError(audio_too_long_error(duration_seconds).detail)

            # 2. Replace the stored original with the browser-friendly MP3. Both
            # branches stamp the heartbeat, covering the transcode above.
            if needs_swap:
                uploaded = await s3_service.upload_file_from_path(mp3_temp_path, mp3_key, "audio/mpeg", mp3_filename)
                if not uploaded:
                    raise ValueError("S3 upload of transcoded MP3 failed")
                swapped = update_processing_recording(recording_id, {
                    "s3_key": mp3_key,
                    "filename": mp3_filename,
                    "duration": duration_seconds,
                })
                if swapped == 0:
                    # Row is gone — don't leave the MP3 we just uploaded as an orphan
                    await s3_service.delete_file(mp3_key)
                    return _stopped(recording_id, duration_seconds, mp3_key)
                await s3_service.delete_file(source_key)
                logger.info(f"Audio recording {recording_id}: stored MP3 at {mp3_key}")
            else:
                if update_processing_recording(recording_id, {"duration": duration_seconds}) == 0:
                    return _stopped(recording_id, duration_seconds, mp3_key)

            # 3. Transcribe, in chunks OpenAI will accept
            if duration_seconds > MAX_CHUNK_DURATION_SECONDS:
                chunk_dir = tempfile.mkdtemp(prefix="audio_chunks_")
                chunk_paths = await asyncio.to_thread(_segment_mp3, mp3_temp_path, chunk_dir, MAX_CHUNK_DURATION_SECONDS)
                logger.info(
                    f"Audio recording {recording_id}: split into {len(chunk_paths)} chunks "
                    f"of up to {MAX_CHUNK_DURATION_SECONDS}s each"
                )
                # Heartbeat after segmentation: its 300s plus a worst-case first
                # chunk (3 × 300s) would otherwise brush the 20-min stale window
                if update_processing_recording(recording_id, {}) == 0:
                    return _stopped(recording_id, duration_seconds, mp3_key)
            else:
                chunk_paths = [mp3_temp_path]

            transcribed_parts: List[str] = []
            for i, chunk_path in enumerate(chunk_paths):
                logger.info(f"Audio recording {recording_id}: transcribing chunk {i + 1}/{len(chunk_paths)}")
                chunk_buffer = io.BytesIO(await asyncio.to_thread(_read_file_bytes, chunk_path))
                chunk_filename = f"{original_name}_chunk_{i + 1}.mp3" if len(chunk_paths) > 1 else mp3_filename
                chunk_text = await openai_service.transcribe_audio(chunk_buffer, chunk_filename)
                del chunk_buffer
                if chunk_text is None:
                    # A failed chunk (retries exhausted) must fail the whole job — a
                    # transcript with a silent 20-minute hole saved as 'completed'
                    # would feed journal synthesis with gapped medical content.
                    raise TranscriptionJobError(TRANSCRIPTION_FAILED_DETAIL)
                transcribed_parts.append(chunk_text)

                # Chunk files are only needed once — free the disk early
                if chunk_dir is not None:
                    os.unlink(chunk_path)

                # Heartbeat: keeps the stale rule quiet and notices a deletion mid-job
                if update_processing_recording(recording_id, {}) == 0:
                    return _stopped(recording_id, duration_seconds, mp3_key)

            transcribed_text = " ".join(transcribed_parts).strip()

        # The rest is OpenAI/DB-bound, not CPU/memory-bound — release the slot first
        if not transcribed_text:
            raise TranscriptionJobError(TRANSCRIPTION_EMPTY_DETAIL)

        # 4. Categorise (best effort — the recording saves without a category if this fails)
        recording_category = None
        ai_summary = None
        try:
            categorization = await openai_service.categorize_audio_recording(
                transcribed_text, duration_seconds, user_id=user_id
            )
            try:
                recording_category = AudioRecordingCategory(categorization["category"])
            except (ValueError, KeyError):
                recording_category = AudioRecordingCategory.OTHER
            ai_summary = categorization.get("summary", "")
        except Exception as e:
            logger.warning(f"AI categorization failed for audio recording {recording_id}: {e}. Saving without category.")

        # 5. Finalise — clients polling the recording see the transcript from here on
        finalised = update_processing_recording(recording_id, {
            "transcribed_text": transcribed_text,
            "category": recording_category,
            "ai_summary": ai_summary,
            "transcription_status": TranscriptionStatus.COMPLETED.value,
        })
        if finalised == 0:
            return _stopped(recording_id, duration_seconds, mp3_key)
        logger.info(f"Audio recording {recording_id} transcribed ({len(transcribed_text)} chars)")

        # 6. Journal synthesis (management uploads only — conversation recordings
        # synthesise when the transcribed text is sent as a message)
        if skip_synthesis:
            logger.info(f"Audio recording {recording_id}: skipping journal synthesis (conversation recording)")
        else:
            await _synthesize_journal(
                recording_id=recording_id, session_id=session_id, user_id=user_id,
                original_filename=original_filename, transcribed_text=transcribed_text,
                ai_summary=ai_summary, duration=duration_seconds,
            )

        return TranscriptionJobResult(transcribed_text=transcribed_text, duration=duration_seconds, mp3_key=mp3_key)

    except TranscriptionJobError as e:
        logger.error(f"Transcription job for audio recording {recording_id} failed: {e.detail}")
        mark_transcription_failed(recording_id)
        raise
    except asyncio.CancelledError:
        logger.warning(f"Transcription job for audio recording {recording_id} cancelled; marked failed for retry")
        mark_transcription_failed(recording_id)
        raise
    except Exception as e:
        logger.error(f"Transcription job for audio recording {recording_id} errored: {e}", exc_info=True)
        _log_job_error(e, user_id, session_id, recording_id, original_filename)
        mark_transcription_failed(recording_id)
        raise TranscriptionJobError(TRANSCRIPTION_FAILED_DETAIL) from e
    finally:
        _cleanup_temp_files(source_temp_path, mp3_temp_path, chunk_dir=chunk_dir)


def _on_job_done(recording_id: int, task: asyncio.Task) -> None:
    # A retry may have registered a newer task for the same recording
    if _jobs.get(recording_id) is task:
        _jobs.pop(recording_id, None)
    if task.cancelled():
        return
    exc = task.exception()  # also marks the exception as retrieved
    if exc is None or isinstance(exc, TranscriptionJobError):
        return  # handled and logged inside the job
    logger.error(f"Unhandled error in transcription job for audio recording {recording_id}: {exc}", exc_info=exc)
    try:
        sentry_sdk.capture_exception(exc)
    except Exception:
        pass


def has_active_job(recording_id: int) -> bool:
    """Whether this instance already runs a live job for the recording."""
    task = _jobs.get(recording_id)
    return task is not None and not task.done()


def start_transcription_job(**job_kwargs) -> asyncio.Task:
    """Launch `run_transcription_job` detached from the current request.

    Returns the task so the legacy synchronous path can wait on it (shielded).
    Refuses a recording this instance is already processing: overwriting the
    registry entry would orphan the first task (uncancellable on shutdown,
    uncounted, and racing the second over the same S3 keys).
    """
    recording_id = job_kwargs["recording_id"]
    if has_active_job(recording_id):
        raise RuntimeError(f"A transcription job for recording {recording_id} is already running")
    task = asyncio.create_task(run_transcription_job(**job_kwargs), name=f"transcribe-{recording_id}")
    _jobs[recording_id] = task
    task.add_done_callback(lambda t: _on_job_done(recording_id, t))
    return task


def inflight_transcription_count() -> int:
    return len(_jobs)


async def fail_inflight_transcriptions() -> None:
    """Shutdown hook: cancel every in-flight job and mark its recording 'failed'.

    Render redeploys on every push; without this a recording uploaded during a
    deploy would show "Transcribing…" until the stale rule flips it. uvicorn runs
    lifespan shutdown before asyncio.run() cancels stray tasks, so these writes land.
    """
    tasks = dict(_jobs)
    if not tasks:
        return
    logger.warning(
        f"Shutdown: cancelling {len(tasks)} in-flight transcription job(s); "
        "they can be retried from Audio Recordings"
    )
    for task in tasks.values():
        task.cancel()
    await asyncio.wait(list(tasks.values()), timeout=5)
    for recording_id in tasks:
        mark_transcription_failed(recording_id)  # no-op when the job already did it
