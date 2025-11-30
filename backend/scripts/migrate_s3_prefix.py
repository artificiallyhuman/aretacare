#!/usr/bin/env python3
"""
S3 Key Prefix Migration Script

This script migrates existing S3 files and database records to use the S3_KEY_PREFIX.
Run this ONCE per environment after setting S3_KEY_PREFIX in your .env file.

Usage:
  # Dry run (preview changes, no modifications):
  python scripts/migrate_s3_prefix.py --dry-run

  # Execute migration:
  python scripts/migrate_s3_prefix.py

  # Force migration even if prefix is empty (for testing):
  python scripts/migrate_s3_prefix.py --force
"""

import sys
import os
import argparse
import logging

# Add the app directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models import Document, AudioRecording
from app.services.s3_service import s3_service

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def migrate_s3_files(dry_run: bool = True, force: bool = False):
    """
    Migrate existing S3 files and database records to use the configured prefix.

    Steps for each file:
    1. Copy S3 file to new prefixed location
    2. Update database record with new key
    3. Delete old S3 file (only after successful copy and DB update)
    """
    prefix = settings.S3_KEY_PREFIX

    if not prefix and not force:
        logger.error("S3_KEY_PREFIX is not set in your environment.")
        logger.error("Set S3_KEY_PREFIX in your .env file (e.g., S3_KEY_PREFIX=dev/)")
        logger.error("Or use --force to run anyway (not recommended).")
        return False

    if not prefix:
        logger.warning("S3_KEY_PREFIX is empty - running with --force flag")
        prefix = ""

    logger.info(f"{'[DRY RUN] ' if dry_run else ''}Starting S3 prefix migration")
    logger.info(f"Target prefix: '{prefix}'")

    # Connect to database
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        # Statistics
        stats = {
            'documents_migrated': 0,
            'thumbnails_migrated': 0,
            'audio_migrated': 0,
            'documents_skipped': 0,
            'thumbnails_skipped': 0,
            'audio_skipped': 0,
            'errors': 0
        }

        # Migrate documents
        logger.info("\n=== Migrating Documents ===")
        documents = db.query(Document).all()

        for doc in documents:
            # Migrate main document file
            if doc.s3_key and not doc.s3_key.startswith(prefix):
                new_key = f"{prefix}{doc.s3_key}"
                logger.info(f"Document {doc.id}: {doc.s3_key} -> {new_key}")

                if not dry_run:
                    success = migrate_single_file(doc.s3_key, new_key)
                    if success:
                        doc.s3_key = new_key
                        stats['documents_migrated'] += 1
                    else:
                        stats['errors'] += 1
                        continue
                else:
                    stats['documents_migrated'] += 1
            else:
                stats['documents_skipped'] += 1

            # Migrate thumbnail if exists
            if doc.thumbnail_s3_key and not doc.thumbnail_s3_key.startswith(prefix):
                new_thumb_key = f"{prefix}{doc.thumbnail_s3_key}"
                logger.info(f"Thumbnail {doc.id}: {doc.thumbnail_s3_key} -> {new_thumb_key}")

                if not dry_run:
                    success = migrate_single_file(doc.thumbnail_s3_key, new_thumb_key)
                    if success:
                        doc.thumbnail_s3_key = new_thumb_key
                        stats['thumbnails_migrated'] += 1
                    else:
                        stats['errors'] += 1
                else:
                    stats['thumbnails_migrated'] += 1
            elif doc.thumbnail_s3_key:
                stats['thumbnails_skipped'] += 1

        # Migrate audio recordings
        logger.info("\n=== Migrating Audio Recordings ===")
        recordings = db.query(AudioRecording).all()

        for recording in recordings:
            if recording.s3_key and not recording.s3_key.startswith(prefix):
                new_key = f"{prefix}{recording.s3_key}"
                logger.info(f"Audio {recording.id}: {recording.s3_key} -> {new_key}")

                if not dry_run:
                    success = migrate_single_file(recording.s3_key, new_key)
                    if success:
                        recording.s3_key = new_key
                        stats['audio_migrated'] += 1
                    else:
                        stats['errors'] += 1
                else:
                    stats['audio_migrated'] += 1
            else:
                stats['audio_skipped'] += 1

        # Commit database changes
        if not dry_run:
            db.commit()
            logger.info("\nDatabase changes committed successfully.")

        # Print summary
        logger.info("\n=== Migration Summary ===")
        logger.info(f"{'[DRY RUN] ' if dry_run else ''}Results:")
        logger.info(f"  Documents migrated: {stats['documents_migrated']}")
        logger.info(f"  Documents skipped (already prefixed): {stats['documents_skipped']}")
        logger.info(f"  Thumbnails migrated: {stats['thumbnails_migrated']}")
        logger.info(f"  Thumbnails skipped: {stats['thumbnails_skipped']}")
        logger.info(f"  Audio recordings migrated: {stats['audio_migrated']}")
        logger.info(f"  Audio recordings skipped: {stats['audio_skipped']}")
        logger.info(f"  Errors: {stats['errors']}")

        if dry_run:
            logger.info("\nThis was a dry run. No changes were made.")
            logger.info("Run without --dry-run to execute the migration.")

        return stats['errors'] == 0

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def migrate_single_file(old_key: str, new_key: str) -> bool:
    """
    Migrate a single S3 file from old_key to new_key.

    1. Copy to new location
    2. Verify copy succeeded
    3. Delete old file
    """
    try:
        # Copy object to new key
        s3_service.s3_client.copy_object(
            Bucket=s3_service.bucket_name,
            CopySource={'Bucket': s3_service.bucket_name, 'Key': old_key},
            Key=new_key
        )
        logger.debug(f"Copied {old_key} to {new_key}")

        # Verify the new object exists
        s3_service.s3_client.head_object(
            Bucket=s3_service.bucket_name,
            Key=new_key
        )
        logger.debug(f"Verified {new_key} exists")

        # Delete old object
        s3_service.s3_client.delete_object(
            Bucket=s3_service.bucket_name,
            Key=old_key
        )
        logger.debug(f"Deleted old file {old_key}")

        return True

    except Exception as e:
        logger.error(f"Failed to migrate {old_key}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Migrate S3 files to use environment prefix',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without modifying anything'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Run even if S3_KEY_PREFIX is empty'
    )

    args = parser.parse_args()

    success = migrate_s3_files(dry_run=args.dry_run, force=args.force)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
