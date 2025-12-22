"""Admin Report Service for generating AI-powered daily admin reports."""
from datetime import datetime, date, timedelta
from typing import Optional, Dict, List, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
import logging
import json

from app.models.admin_report import AdminReport
from app.models.security_log import SecurityLog
from app.models.error_log import ErrorLog
from app.models.api_log import ApiLog
from app.core.config import settings
from app.config.ai_config import ADMIN_REPORT_SYSTEM_PROMPT
from app.services.openai_service import openai_service

logger = logging.getLogger(__name__)


class AdminReportService:
    """Service for generating and managing admin reports."""

    async def generate_report(self, db: Session, report_date: date = None) -> AdminReport:
        """Generate a new admin report for the specified date.

        Args:
            db: Database session
            report_date: Date for the report (defaults to today in UTC if not provided)

        Returns:
            The generated AdminReport
        """
        today = report_date if report_date else date.today()

        # Check if report already exists for today
        existing_report = db.query(AdminReport).filter(
            AdminReport.date == today
        ).first()

        if existing_report:
            # Delete existing report to regenerate
            db.delete(existing_report)
            db.commit()

        # Get logs since last report
        logs_data = self._get_logs_since_last_report(db, today)

        # Generate AI analysis
        content, has_concerns = await self._analyze_logs(logs_data)

        # Create new report
        report = AdminReport(
            date=today,
            content=content,
            has_concerns=has_concerns,
            security_log_count=logs_data["security_count"],
            error_log_count=logs_data["error_count"],
            api_log_count=logs_data["api_count"]
        )

        db.add(report)
        db.commit()
        db.refresh(report)

        return report

    def _get_logs_since_last_report(self, db: Session, current_date: date) -> Dict[str, Any]:
        """Fetch logs since the last report was generated."""

        # Find the previous report to get the cutoff time
        previous_report = db.query(AdminReport).filter(
            AdminReport.date < current_date
        ).order_by(AdminReport.date.desc()).first()

        if previous_report:
            cutoff_time = previous_report.created_at
        else:
            # First report - look at last 24 hours
            cutoff_time = datetime.utcnow() - timedelta(hours=24)

        # Fetch security logs
        security_logs = db.query(SecurityLog).filter(
            SecurityLog.created_at >= cutoff_time
        ).all()

        # Fetch error logs
        error_logs = db.query(ErrorLog).filter(
            ErrorLog.timestamp >= cutoff_time
        ).all()

        # Fetch API logs
        api_logs = db.query(ApiLog).filter(
            ApiLog.created_at >= cutoff_time
        ).all()

        # Aggregate security events by type and IP
        security_by_type = {}
        security_by_ip = {}
        for log in security_logs:
            event_type = log.event_type
            security_by_type[event_type] = security_by_type.get(event_type, 0) + 1

            if log.ip_address and event_type == "failed_login":
                ip = log.ip_address
                if ip not in security_by_ip:
                    security_by_ip[ip] = {"count": 0, "emails": set()}
                security_by_ip[ip]["count"] += 1
                if log.email:
                    security_by_ip[ip]["emails"].add(log.email)

        # Aggregate errors by level and source
        errors_by_level = {}
        errors_by_source = {}
        for log in error_logs:
            level = log.level
            errors_by_level[level] = errors_by_level.get(level, 0) + 1

            source = log.source
            if source not in errors_by_source:
                errors_by_source[source] = {"count": 0, "messages": []}
            errors_by_source[source]["count"] += 1
            # Keep first 3 unique error messages per source
            if len(errors_by_source[source]["messages"]) < 3:
                msg = log.message[:200] if log.message else ""
                if msg and msg not in errors_by_source[source]["messages"]:
                    errors_by_source[source]["messages"].append(msg)

        # Aggregate API metrics
        api_total = len(api_logs)
        api_success = sum(1 for log in api_logs if log.success)
        api_by_feature = {}
        total_response_time = 0
        response_time_count = 0

        for log in api_logs:
            feature = log.feature
            if feature not in api_by_feature:
                api_by_feature[feature] = {"total": 0, "success": 0, "failures": []}
            api_by_feature[feature]["total"] += 1
            if log.success:
                api_by_feature[feature]["success"] += 1
            else:
                if len(api_by_feature[feature]["failures"]) < 3:
                    msg = log.error_message[:100] if log.error_message else "Unknown error"
                    api_by_feature[feature]["failures"].append(msg)

            if log.response_time_ms:
                total_response_time += log.response_time_ms
                response_time_count += 1

        avg_response_time = total_response_time / response_time_count if response_time_count > 0 else 0

        # Convert sets to lists for JSON serialization
        for ip_data in security_by_ip.values():
            ip_data["emails"] = list(ip_data["emails"])

        return {
            "security_count": len(security_logs),
            "error_count": len(error_logs),
            "api_count": api_total,
            "cutoff_time": cutoff_time.isoformat(),
            "security": {
                "by_type": security_by_type,
                "failed_logins_by_ip": {
                    ip: data for ip, data in security_by_ip.items()
                    if data["count"] >= 3  # Only include IPs with 3+ failures
                }
            },
            "errors": {
                "by_level": errors_by_level,
                "by_source": {
                    source: data for source, data in errors_by_source.items()
                    if data["count"] >= 3  # Only include sources with 3+ errors
                }
            },
            "api": {
                "total": api_total,
                "success_count": api_success,
                "success_rate": round(api_success / api_total * 100, 1) if api_total > 0 else 100,
                "avg_response_time_ms": round(avg_response_time),
                "by_feature": api_by_feature
            }
        }

    async def _analyze_logs(self, logs_data: Dict[str, Any]) -> Tuple[str, bool]:
        """Use AI to analyze logs and generate report content.

        Returns:
            Tuple of (markdown content, has_concerns)
        """
        today = date.today().strftime("%B %d, %Y")

        # Build the prompt with log data
        prompt = f"""Analyze the following system logs from {logs_data['cutoff_time']} to now and generate a security/operations report.

## Log Summary

### Security Events ({logs_data['security_count']} total)
Events by type: {json.dumps(logs_data['security']['by_type'], indent=2)}

IPs with 3+ failed logins: {json.dumps(logs_data['security']['failed_logins_by_ip'], indent=2)}

### Error Logs ({logs_data['error_count']} total)
Errors by level: {json.dumps(logs_data['errors']['by_level'], indent=2)}

Sources with 3+ errors: {json.dumps(logs_data['errors']['by_source'], indent=2)}

### API Calls ({logs_data['api_count']} total)
Success rate: {logs_data['api']['success_rate']}%
Average response time: {logs_data['api']['avg_response_time_ms']}ms

By feature: {json.dumps(logs_data['api']['by_feature'], indent=2)}

---

Based on this data, identify any genuine concerns that require investigation. Remember: be highly selective and only flag issues that truly need attention."""

        messages = [
            {"role": "system", "content": ADMIN_REPORT_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]

        try:
            response = await openai_service._create_chat_completion(
                messages,
                feature="admin_report",
                user_id=None
            )

            if response:
                # Parse the JSON response
                try:
                    # Strip markdown code blocks if present
                    cleaned = response.strip()
                    if cleaned.startswith("```"):
                        cleaned = cleaned.split("```")[1]
                        if cleaned.startswith("json"):
                            cleaned = cleaned[4:]
                        cleaned = cleaned.strip()

                    data = json.loads(cleaned)
                    has_concerns = data.get("has_concerns", False)

                    # Format the report as markdown
                    content = self._format_report_markdown(data, today)
                    return content, has_concerns

                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse AI response as JSON: {e}")
                    # Fall through to generate basic report

        except Exception as e:
            logger.error(f"AI analysis failed: {e}")

        # Fallback: generate basic report without AI analysis
        return self._generate_fallback_report(logs_data, today), False

    def _format_report_markdown(self, data: Dict[str, Any], today: str) -> str:
        """Format the AI analysis as a markdown report."""
        lines = [
            f"# Admin Report - {today}",
            "",
            f"## Summary",
            data.get("summary", "Report generated successfully."),
            ""
        ]

        concerns = data.get("concerns", [])
        if concerns:
            lines.append("## Concerns Requiring Investigation")
            lines.append("")

            for concern in concerns:
                severity = concern.get("severity", "medium")
                severity_emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(severity, "🟡")

                lines.append(f"### {severity_emoji} {concern.get('title', 'Unnamed Concern')}")
                lines.append(f"**Severity:** {severity.upper()}")
                lines.append("")
                lines.append(f"**What:** {concern.get('what', 'No description')}")
                lines.append("")
                lines.append(f"**Evidence:** {concern.get('evidence', 'No evidence provided')}")
                lines.append("")
                lines.append(f"**Recommendation:** {concern.get('recommendation', 'Review and investigate')}")
                lines.append("")
        else:
            lines.append("## Status")
            lines.append("")
            lines.append("✅ **All Clear** - No unusual activity detected. System operating normally.")
            lines.append("")

        # Add metrics
        metrics = data.get("metrics", {})
        security = metrics.get("security_events", {})
        errors = metrics.get("errors", {})
        api = metrics.get("api_calls", {})

        lines.append("## Metrics Overview")
        lines.append("")
        lines.append(f"- **Security Events:** {security.get('total', 0)} analyzed ({security.get('unusual', 0)} unusual)")
        lines.append(f"- **Errors:** {errors.get('total', 0)} logged ({errors.get('critical', 0)} critical)")
        lines.append(f"- **API Calls:** {api.get('total', 0)} total, {api.get('success_rate', 100)}% success rate")
        lines.append("")

        return "\n".join(lines)

    def _generate_fallback_report(self, logs_data: Dict[str, Any], today: str) -> str:
        """Generate a basic report when AI analysis fails."""
        security_count = logs_data["security_count"]
        error_count = logs_data["error_count"]
        api_count = logs_data["api_count"]
        api_success_rate = logs_data["api"]["success_rate"]

        lines = [
            f"# Admin Report - {today}",
            "",
            "## Summary",
            "Automated report generation (AI analysis unavailable).",
            "",
            "## Metrics Overview",
            "",
            f"- **Security Events:** {security_count} total",
            f"- **Errors:** {error_count} total",
            f"- **API Calls:** {api_count} total, {api_success_rate}% success rate",
            "",
            "## Notes",
            "",
            "AI analysis was unavailable for this report. Please review logs manually if needed.",
            ""
        ]

        return "\n".join(lines)

    def get_all_reports(self, db: Session, limit: int = 30) -> List[AdminReport]:
        """Get all reports within retention period."""
        cutoff_date = date.today() - timedelta(days=settings.ADMIN_REPORT_RETENTION_DAYS)

        return db.query(AdminReport).filter(
            AdminReport.date >= cutoff_date
        ).order_by(AdminReport.date.desc()).limit(limit).all()

    def get_latest_report(self, db: Session) -> Optional[AdminReport]:
        """Get the most recent report."""
        return db.query(AdminReport).order_by(
            AdminReport.date.desc()
        ).first()

    def get_report_by_id(self, db: Session, report_id: int) -> Optional[AdminReport]:
        """Get a specific report by ID."""
        return db.query(AdminReport).filter(AdminReport.id == report_id).first()

    def cleanup_old_reports(self, db: Session) -> int:
        """Delete reports older than retention period.

        Returns the number of deleted reports.
        """
        cutoff_date = date.today() - timedelta(days=settings.ADMIN_REPORT_RETENTION_DAYS)

        deleted = db.query(AdminReport).filter(
            AdminReport.date < cutoff_date
        ).delete()

        db.commit()
        return deleted


# Module-level instance
admin_report_service = AdminReportService()
