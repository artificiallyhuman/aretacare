from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import json
import io

from ..core.database import get_db
from ..api.auth import get_current_user, require_ai_data_sharing_consent
from ..api.permissions import check_session_access
from ..models.user import User
from ..models.profile import Profile
from ..models.session import Session as UserSession
from ..schemas.profile import (
    ProfileResponse,
    ProfileUpdate,
    ProfileSectionUpdate,
    ProfileRegenerateRequest,
    ProfilePendingChangesResponse,
    ProfileCheckResponse,
    PendingChangesReview,
    ProfileExportFormat
)
from ..services.profile_service import ProfileService

router = APIRouter()


@router.get("/{session_id}", response_model=ProfileResponse)
async def get_profile(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the profile for a session"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    # Get or create profile
    profile = await ProfileService.get_or_create_profile(db, session_id)

    return profile


@router.get("/{session_id}/check", response_model=ProfileCheckResponse)
async def check_profile_status(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if profile needs an update based on new activity"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    return ProfileService.check_for_updates(db, session_id)


@router.post("/{session_id}/update", response_model=ProfileResponse)
async def update_profile_from_activity(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ai_data_sharing_consent)
):
    """
    Trigger AI update of the profile based on new activity.

    This processes new conversations and journal entries and:
    - Adds new information directly to the profile
    - Proposes changes to existing information as pending_changes
    """
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    try:
        profile, updated = await ProfileService.update_profile_from_activity(db, session_id, user_id=current_user.id)
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update profile. Please try again.")


@router.put("/{session_id}", response_model=ProfileResponse)
async def update_profile_manually(
    session_id: str,
    update: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Manually update the entire profile data.

    This is a full replacement of the profile data by the user.
    """
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    # Get existing profile
    profile = db.query(Profile).filter(Profile.session_id == session_id).first()

    if not profile:
        profile = await ProfileService.get_or_create_profile(db, session_id)

    # Update with user data
    profile = ProfileService.update_profile_manually(
        db, profile, update.profile_data.model_dump()
    )

    return profile


@router.patch("/{session_id}/section", response_model=ProfileResponse)
async def update_profile_section(
    session_id: str,
    update: ProfileSectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a specific section of the profile.

    Useful for editing individual sections without replacing the entire profile.
    """
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    # Get existing profile
    profile = db.query(Profile).filter(Profile.session_id == session_id).first()

    if not profile:
        profile = await ProfileService.get_or_create_profile(db, session_id)

    # Update the specific section
    profile_data = profile.profile_data or {}
    profile_data[update.section] = update.data

    profile = ProfileService.update_profile_manually(db, profile, profile_data)

    return profile


@router.get("/{session_id}/pending-changes", response_model=ProfilePendingChangesResponse)
async def get_pending_changes(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get pending changes that need user approval"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    profile = db.query(Profile).filter(Profile.session_id == session_id).first()

    if not profile:
        return ProfilePendingChangesResponse(pending_changes=[], has_changes=False)

    pending = profile.pending_changes or []

    return ProfilePendingChangesResponse(
        pending_changes=pending,
        has_changes=len(pending) > 0
    )


@router.post("/{session_id}/pending-changes/review", response_model=ProfileResponse)
async def review_pending_changes(
    session_id: str,
    review: PendingChangesReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Review and apply decisions on pending changes.

    For each change_id in decisions:
    - "accept": Apply the change as-is
    - "reject": Discard the change
    - Any other value: Use as the edited value
    """
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    profile = db.query(Profile).filter(Profile.session_id == session_id).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = await ProfileService.apply_pending_changes(db, profile, review.decisions)

    return profile


@router.post("/{session_id}/regenerate", response_model=ProfileResponse)
async def regenerate_profile(
    session_id: str,
    request: ProfileRegenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ai_data_sharing_consent)
):
    """
    Regenerate the profile from scratch.

    This deletes the existing profile and creates a new one from all available data.
    Requires confirmation (confirm=true) to proceed.
    """
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    if not request.confirm:
        raise HTTPException(
            status_code=400,
            detail="Regeneration requires confirmation. Set confirm=true to proceed."
        )

    try:
        profile = await ProfileService.regenerate_profile(db, session_id, user_id=current_user.id)
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to regenerate profile. Please try again.")


@router.delete("/{session_id}")
async def delete_profile(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete the profile for a session"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    profile = db.query(Profile).filter(Profile.session_id == session_id).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    db.delete(profile)
    db.commit()

    return {"message": "Profile deleted successfully"}


@router.get("/{session_id}/export")
async def export_profile(
    session_id: str,
    format: ProfileExportFormat = ProfileExportFormat.JSON,
    timezone: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export the profile in the specified format.

    Supported formats: json, pdf
    """
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")

    check_session_access(session, current_user.id, db)

    profile = db.query(Profile).filter(Profile.session_id == session_id).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if format == ProfileExportFormat.JSON:
        # Export as JSON
        content = json.dumps(profile.profile_data, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=profile_{session_id}.json"
            }
        )

    elif format == ProfileExportFormat.PDF:
        # Generate PDF
        pdf_content = await _generate_profile_pdf(profile, session, timezone)
        return StreamingResponse(
            io.BytesIO(pdf_content),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=profile_{session_id}.pdf"
            }
        )


async def _generate_profile_pdf(profile: Profile, session: UserSession, timezone: str = None) -> bytes:
    """Generate a PDF document from profile data"""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        from zoneinfo import ZoneInfo

        # Helper to convert UTC to local timezone
        def to_local_time(utc_dt):
            if not utc_dt:
                return None
            if timezone:
                try:
                    local_tz = ZoneInfo(timezone)
                    utc_dt = utc_dt.replace(tzinfo=ZoneInfo('UTC'))
                    return utc_dt.astimezone(local_tz)
                except Exception:
                    pass
            return utc_dt

        buffer = io.BytesIO()

        # Custom page template with footer
        def add_page_number(canvas, doc):
            canvas.saveState()
            canvas.setFont('Helvetica', 9)
            canvas.setFillColor(colors.HexColor('#9ca3af'))
            # Page number on right
            canvas.drawRightString(letter[0] - 0.75*inch, 0.5*inch, f"Page {doc.page}")
            # AretaCare on left
            canvas.drawString(0.75*inch, 0.5*inch, "AretaCare Health Profile")
            canvas.restoreState()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            topMargin=0.75*inch,
            bottomMargin=0.85*inch,
            leftMargin=0.75*inch,
            rightMargin=0.75*inch
        )
        styles = getSampleStyleSheet()

        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=6,
            textColor=colors.HexColor('#1f2937')
        )
        subtitle_style = ParagraphStyle(
            'Subtitle',
            parent=styles['Normal'],
            fontSize=11,
            textColor=colors.HexColor('#6b7280'),
            spaceAfter=4
        )
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=14,
            spaceBefore=20,
            spaceAfter=10,
            textColor=colors.HexColor('#1e40af'),
            borderPadding=0
        )
        item_title_style = ParagraphStyle(
            'ItemTitle',
            parent=styles['Normal'],
            fontSize=11,
            spaceBefore=8,
            spaceAfter=2,
            textColor=colors.HexColor('#1f2937')
        )
        item_detail_style = ParagraphStyle(
            'ItemDetail',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#4b5563'),
            leftIndent=12,
            spaceBefore=1,
            spaceAfter=1
        )
        label_style = ParagraphStyle(
            'Label',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#9ca3af')
        )
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#9ca3af'),
            alignment=TA_CENTER
        )
        alert_style = ParagraphStyle(
            'Alert',
            parent=styles['Normal'],
            fontSize=11,
            textColor=colors.HexColor('#991b1b'),
            backColor=colors.HexColor('#fef2f2'),
            borderPadding=8,
            spaceBefore=8,
            spaceAfter=8
        )
        disclaimer_style = ParagraphStyle(
            'Disclaimer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#9ca3af'),
            alignment=TA_LEFT,
            spaceBefore=4
        )

        # Helper to add section divider
        def add_section_divider(story_list):
            story_list.append(Spacer(1, 6))
            story_list.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e5e7eb')))

        story = []

        # Title Block
        story.append(Paragraph("Health Profile", title_style))
        story.append(Paragraph(f"{session.name}", subtitle_style))
        if profile.last_ai_update:
            local_update_time = to_local_time(profile.last_ai_update)
            story.append(Paragraph(
                f"Last updated: {local_update_time.strftime('%B %d, %Y at %I:%M %p')}",
                label_style
            ))
        story.append(Spacer(1, 8))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e5e7eb')))
        story.append(Spacer(1, 8))

        # Disclaimer at top so it travels with shared/printed copies
        story.append(Paragraph(
            "<i>This Health Profile was generated by AretaCare from information provided in the app and AI-assisted summaries. It is for informational purposes only and is not medical advice, diagnosis, or treatment. It may be incomplete or contain errors, so please verify with a healthcare provider before acting on it.</i>",
            disclaimer_style
        ))
        story.append(Spacer(1, 12))

        profile_data = profile.profile_data or {}

        # Helper to format status badges
        def format_status(status):
            if not status:
                return ""
            status_upper = status.upper()
            if status_upper == "ACTIVE":
                return f'<font color="#166534">[{status_upper}]</font>'
            elif status_upper == "RESOLVED":
                return f'<font color="#6b7280">[{status_upper}]</font>'
            elif status_upper in ["SEVERE", "LIFE-THREATENING"]:
                return f'<font color="#dc2626">[{status_upper}]</font>'
            else:
                return f'<font color="#1e40af">[{status_upper}]</font>'

        # Track if we've added any sections (for dividers)
        sections_added = []

        # Patient Information
        patient = profile_data.get("patient")
        if patient:
            if sections_added:
                add_section_divider(story)
            sections_added.append('patient')
            story.append(Paragraph("Patient Information", section_style))
            # Build patient info as a clean block
            if patient.get("full_name"):
                name_text = f"<b>{patient['full_name']}</b>"
                if patient.get("preferred_name"):
                    name_text += f' (goes by "{patient["preferred_name"]}")'
                story.append(Paragraph(name_text, item_title_style))
            details = []
            if patient.get("date_of_birth"):
                details.append(f"DOB: {patient['date_of_birth']}")
            if patient.get("age"):
                details.append(f"Age: {patient['age']}")
            if details:
                story.append(Paragraph(" · ".join(details), item_detail_style))
            if patient.get("location"):
                story.append(Paragraph(f"Location: {patient['location']}", item_detail_style))
            if patient.get("contact_info"):
                story.append(Paragraph(f"Contact: {patient['contact_info']}", item_detail_style))

        # Caregivers
        caregivers = profile_data.get("caregivers", [])
        if caregivers:
            if sections_added:
                add_section_divider(story)
            sections_added.append('caregivers')
            story.append(Paragraph("Caregivers", section_style))
            for cg in caregivers:
                title = f"<b>{cg.get('name', 'Unknown')}</b>"
                if cg.get("relationship"):
                    title += f" · {cg['relationship']}"
                story.append(Paragraph(title, item_title_style))
                if cg.get("role"):
                    story.append(Paragraph(cg['role'], item_detail_style))
                if cg.get("contact_info"):
                    story.append(Paragraph(f"Contact: {cg['contact_info']}", item_detail_style))
                if cg.get("location"):
                    story.append(Paragraph(f"Location: {cg['location']}", item_detail_style))

        # Providers
        providers = profile_data.get("providers", [])
        if providers:
            if sections_added:
                add_section_divider(story)
            sections_added.append('providers')
            story.append(Paragraph("Healthcare Providers", section_style))
            for p in providers:
                title = f"<b>{p.get('name', 'Unknown')}</b>"
                if p.get("specialty"):
                    title += f" · {p['specialty']}"
                story.append(Paragraph(title, item_title_style))
                if p.get("organization"):
                    story.append(Paragraph(p['organization'], item_detail_style))
                if p.get("contact_info"):
                    story.append(Paragraph(f"Contact: {p['contact_info']}", item_detail_style))

        # Conditions
        conditions = profile_data.get("conditions", [])
        if conditions:
            if sections_added:
                add_section_divider(story)
            sections_added.append('conditions')
            story.append(Paragraph("Conditions & Diagnoses", section_style))
            # Sort by status (active first) then by date
            status_order = {"active": 0, "monitoring": 1, "resolved": 2}
            sorted_conditions = sorted(
                conditions,
                key=lambda c: (status_order.get(c.get("status", ""), 3), c.get("diagnosis_date", "") or "")
            )
            for c in sorted_conditions:
                title = f"<b>{c.get('clinical_term', 'Unknown')}</b>"
                if c.get("status"):
                    title += f" {format_status(c['status'])}"
                story.append(Paragraph(title, item_title_style))
                if c.get("description"):
                    story.append(Paragraph(c['description'], item_detail_style))
                if c.get("diagnosis_date"):
                    story.append(Paragraph(f"Diagnosed: {c['diagnosis_date']}", item_detail_style))
                if c.get("details"):
                    story.append(Paragraph(c['details'], item_detail_style))

        # Medications - grouped by category
        medications = profile_data.get("medications", [])
        if medications:
            if sections_added:
                add_section_divider(story)
            sections_added.append('medications')
            story.append(Paragraph("Medications", section_style))

            # Category labels for medications
            medication_category_labels = {
                "multiple": "Multiple Uses",
                "pain_management": "Pain Relief",
                "cardiovascular": "Heart & Blood Pressure",
                "diabetes": "Diabetes & Blood Sugar",
                "mental_health": "Mental Health",
                "antibiotics": "Infection & Antibiotics",
                "respiratory": "Breathing & Lungs",
                "gastrointestinal": "Stomach & Digestion",
                "neurological": "Brain & Nerves",
                "endocrine": "Hormones",
                "oncology": "Cancer Treatment",
                "immunosuppressant": "Immune System",
                "vitamins_supplements": "Vitamins & Supplements",
                "other": "Other"
            }

            # Category order
            category_order = [
                "multiple", "pain_management", "cardiovascular", "diabetes",
                "mental_health", "antibiotics", "respiratory", "gastrointestinal",
                "neurological", "endocrine", "oncology", "immunosuppressant",
                "vitamins_supplements", "other"
            ]

            # Subsection style for categories
            category_style = ParagraphStyle(
                'CategorySubtitle',
                parent=styles['Normal'],
                fontSize=11,
                spaceBefore=12,
                spaceAfter=6,
                textColor=colors.HexColor('#4b5563'),
                fontName='Helvetica-Bold'
            )

            # Group medications by category, sorted by status (active first)
            status_order = {'active': 0, 'paused': 1, 'discontinued': 2}
            for category_key in category_order:
                meds_in_category = sorted(
                    [m for m in medications if m.get('category', 'other') == category_key],
                    key=lambda m: status_order.get(m.get('status', 'active'), 0)
                )

                if meds_in_category:
                    # Add category header
                    story.append(Paragraph(
                        medication_category_labels.get(category_key, category_key),
                        category_style
                    ))

                    # Add medications in this category
                    for m in meds_in_category:
                        title = f"<b>{m.get('name', 'Unknown')}</b>"
                        dosage_parts = []
                        if m.get("dose"):
                            dosage_parts.append(m['dose'])
                        if m.get("frequency"):
                            dosage_parts.append(m['frequency'])
                        if dosage_parts:
                            title += f" · {', '.join(dosage_parts)}"
                        if m.get("status"):
                            title += f" {format_status(m['status'])}"
                        story.append(Paragraph(title, item_title_style))
                        if m.get("description"):
                            story.append(Paragraph(m['description'], item_detail_style))
                        if m.get("prescriber"):
                            story.append(Paragraph(f"Prescribed by: {m['prescriber']}", item_detail_style))
                        if m.get("start_date"):
                            story.append(Paragraph(f"Started: {m['start_date']}", item_detail_style))
                        if m.get("notes"):
                            story.append(Paragraph(f"Note: {m['notes']}", item_detail_style))

        # Events/History
        events = profile_data.get("events", [])
        if events:
            if sections_added:
                add_section_divider(story)
            sections_added.append('events')
            story.append(Paragraph("Medical History & Events", section_style))
            # Event type labels for proper display
            event_type_labels = {
                'hospitalization': 'Hospitalization',
                'surgery': 'Surgery',
                'er_visit': 'ER Visit',
                'major_diagnosis': 'Major Diagnosis',
                'procedure': 'Procedure',
                'other': 'Other'
            }
            # Sort by date (newest first)
            sorted_events = sorted(events, key=lambda e: e.get("date", "") or "", reverse=True)
            for e in sorted_events:
                event_type = e.get('event_type', 'Event')
                event_label = event_type_labels.get(event_type, event_type.replace('_', ' ').title() if event_type else 'Event')
                title = f"<b>{event_label}</b>"
                if e.get("date"):
                    title += f" · {e['date']}"
                story.append(Paragraph(title, item_title_style))
                if e.get("description"):
                    story.append(Paragraph(e['description'], item_detail_style))
                if e.get("details"):
                    story.append(Paragraph(e['details'], item_detail_style))

        # Allergies
        allergies = profile_data.get("allergies", [])
        if allergies:
            if sections_added:
                add_section_divider(story)
            sections_added.append('allergies')
            story.append(Paragraph("Allergies & Sensitivities", section_style))
            # Sort by severity (severe first)
            severity_order = {"severe": 0, "moderate": 1, "mild": 2}
            sorted_allergies = sorted(
                allergies,
                key=lambda a: severity_order.get((a.get("severity") or "").lower(), 3)
            )
            for a in sorted_allergies:
                title = f"<b>{a.get('substance', 'Unknown')}</b>"
                severity = (a.get("severity") or "").lower()
                if severity:
                    if severity == "severe":
                        title += f' <font color="#dc2626"><b>[SEVERE]</b></font>'
                    elif severity == "moderate":
                        title += f' <font color="#d97706">[MODERATE]</font>'
                    else:
                        title += f' <font color="#6b7280">[{severity.upper()}]</font>'
                story.append(Paragraph(title, item_title_style))
                if a.get("reaction"):
                    story.append(Paragraph(f"Reaction: {a['reaction']}", item_detail_style))

        # Preferences
        preferences = profile_data.get("preferences")
        if preferences:
            if sections_added:
                add_section_divider(story)
            sections_added.append('preferences')
            story.append(Paragraph("Preferences & Guidelines", section_style))

            # Emergency Instructions first (highlighted with alert styling)
            if preferences.get("emergency_instructions"):
                story.append(Paragraph(
                    f"<b>⚠ EMERGENCY INSTRUCTIONS:</b> {preferences['emergency_instructions']}",
                    alert_style
                ))

            # Communication Preferences
            comm_prefs = preferences.get("communication_preferences", [])
            if comm_prefs:
                story.append(Paragraph("<b>Communication Preferences</b>", item_title_style))
                for pref in comm_prefs:
                    text = f"• {pref.get('preference', '')}"
                    if pref.get("category"):
                        text += f" ({pref['category'].replace('_', ' ')})"
                    story.append(Paragraph(text, item_detail_style))
                    if pref.get("details"):
                        story.append(Paragraph(pref['details'], item_detail_style))

            # Caregiving Guidelines
            guidelines = preferences.get("caregiving_guidelines", [])
            if guidelines:
                story.append(Paragraph("<b>Caregiving Guidelines</b>", item_title_style))
                for guide in guidelines:
                    text = f"• {guide.get('guideline', '')}"
                    if guide.get("importance"):
                        text += f" {format_status(guide['importance'])}"
                    story.append(Paragraph(text, item_detail_style))
                    if guide.get("details"):
                        story.append(Paragraph(guide['details'], item_detail_style))

            # Important Context
            contexts = preferences.get("important_context", [])
            if contexts:
                story.append(Paragraph("<b>Important Context</b>", item_title_style))
                for ctx in contexts:
                    text = f"• {ctx.get('context', '')}"
                    if ctx.get("category"):
                        text += f" ({ctx['category'].replace('_', ' ')})"
                    story.append(Paragraph(text, item_detail_style))
                    if ctx.get("details"):
                        story.append(Paragraph(ctx['details'], item_detail_style))

            # Additional Notes
            if preferences.get("additional_notes"):
                story.append(Paragraph("<b>Additional Notes</b>", item_title_style))
                story.append(Paragraph(preferences['additional_notes'], item_detail_style))

        # Footer with disclaimer
        story.append(Spacer(1, 30))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e5e7eb')))
        story.append(Spacer(1, 10))
        generated_time = to_local_time(datetime.utcnow())
        story.append(Paragraph(
            f"Generated by AretaCare on {generated_time.strftime('%B %d, %Y')}",
            footer_style
        ))

        doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
        return buffer.getvalue()

    except ImportError:
        # reportlab not available, return simple text
        raise HTTPException(
            status_code=501,
            detail="PDF generation not available. Please use JSON export."
        )
