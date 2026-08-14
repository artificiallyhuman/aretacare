FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    libpq-dev \
    tesseract-ocr \
    ffmpeg \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user for security
# Using UID 1000 which is standard for first non-root user
RUN useradd --create-home --shell /bin/bash --uid 1000 appuser \
    && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Run the application.
#
# Single worker, matching the root Dockerfile (which is what Render actually builds — no
# dockerfilePath is set in render.yaml, so it defaults to the repo root). This file is the
# one docker-compose builds, and compose overrides this CMD with --reload anyway.
#
# Do NOT raise the worker count here without first doing both of the following, or
# production will fall over:
#   1. Size the DB pool per cluster, not per process. core/database.py sets
#      pool_size=20 + max_overflow=40 = 60 connections PER WORKER PROCESS. Four workers
#      across five instances would be ~1,200 connections against a ~100-connection plan.
#   2. Put an advisory lock around run_migrations(). It is called at module scope in
#      main.py, so every worker process runs the migrations concurrently.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
