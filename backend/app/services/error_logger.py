"""
Error logging service for capturing application errors to database
"""
import traceback
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.error_log import ErrorLog
import logging

logger = logging.getLogger(__name__)


class DatabaseErrorLogger:
    """Logs errors to the database for admin visibility"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def log_error(
        self,
        source: str,
        message: str,
        level: str = "ERROR",
        exception: Optional[Exception] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Log an error to the database
        
        Args:
            source: Module/function name (e.g., "api.conversation", "services.openai")
            message: Error message
            level: ERROR, WARNING, or CRITICAL
            exception: Optional exception object (will extract stack trace)
            user_id: Optional user ID if error is user-specific
            session_id: Optional session ID if error is session-specific
            details: Optional additional context as JSON
        """
        try:
            stack_trace = None
            if exception:
                stack_trace = ''.join(traceback.format_exception(
                    type(exception), exception, exception.__traceback__
                ))
            
            error_log = ErrorLog(
                level=level,
                source=source,
                message=message,
                stack_trace=stack_trace,
                user_id=user_id,
                session_id=session_id,
                details=details
            )
            
            self.db.add(error_log)
            self.db.commit()
            
        except Exception as e:
            # Don't let error logging itself crash the app
            logger.error(f"Failed to log error to database: {e}")
            self.db.rollback()


def log_database_error(
    db: Session,
    source: str,
    error: Exception,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """Convenience function for logging database errors"""
    error_logger = DatabaseErrorLogger(db)
    error_logger.log_error(
        source=source,
        message=str(error),
        level="ERROR",
        exception=error,
        user_id=user_id,
        session_id=session_id,
        details=details
    )


def log_error_standalone(
    source: str,
    error: Exception,
    level: str = "ERROR",
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """
    Log error with its own database session.
    Use this in services that don't have db access.
    """
    try:
        from app.core.database import SessionLocal
        db = SessionLocal()
        try:
            error_logger = DatabaseErrorLogger(db)
            error_logger.log_error(
                source=source,
                message=str(error),
                level=level,
                exception=error,
                user_id=user_id,
                session_id=session_id,
                details=details
            )
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to log error standalone: {e}")
