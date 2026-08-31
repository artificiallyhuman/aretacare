import Foundation
import SwiftUI

// MARK: - Medication Categories

/// Matches the medication categories the backend's Health Profile prompt emits.
/// Single source for display order and labels — previously copied in
/// ProfileView, ProfileSectionEditView (order dict + Picker) and
/// ProfileComponents, which had already drifted once.
enum MedicationCategories {
    /// Display order for grouped lists and the category picker.
    static let displayOrder: [String] = [
        "multiple", "pain_management", "cardiovascular", "diabetes",
        "mental_health", "antibiotics", "respiratory", "gastrointestinal",
        "neurological", "endocrine", "oncology", "immunosuppressant",
        "vitamins_supplements", "other"
    ]

    /// Sort rank; unknown categories sort last.
    static let orderIndex: [String: Int] = Dictionary(
        uniqueKeysWithValues: displayOrder.enumerated().map { ($1, $0) }
    )

    static let labels: [String: String] = [
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
    ]

    static func label(_ category: String) -> String? {
        labels[category.lowercased()]
    }
}

// MARK: - Document Categories

/// Matches backend DocumentCategory enum in models/document.py
enum DocumentCategory: String, Codable, CaseIterable, Identifiable {
    case labResults = "lab_results"
    case imagingReports = "imaging_reports"
    case clinicNotes = "clinic_notes"
    case medicationRecords = "medication_records"
    case dischargeSummary = "discharge_summary"
    case treatmentPlan = "treatment_plan"
    case testResults = "test_results"
    case referral = "referral"
    case insuranceBilling = "insurance_billing"
    case consentForm = "consent_form"
    case careInstructions = "care_instructions"
    case identification = "identification"
    case correspondence = "correspondence"
    case other = "other"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .labResults: return "Lab Results"
        case .imagingReports: return "Imaging Reports"
        case .clinicNotes: return "Clinic Notes"
        case .medicationRecords: return "Medication Records"
        case .dischargeSummary: return "Discharge Summary"
        case .treatmentPlan: return "Treatment Plan"
        case .testResults: return "Test Results"
        case .referral: return "Referral"
        case .insuranceBilling: return "Insurance & Billing"
        case .consentForm: return "Consent Form"
        case .careInstructions: return "Care Instructions"
        case .identification: return "Identification"
        case .correspondence: return "Correspondence"
        case .other: return "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .labResults: return "flask"
        case .imagingReports: return "photo.on.rectangle"
        case .clinicNotes: return "doc.text"
        case .medicationRecords: return "pills"
        case .dischargeSummary: return "arrow.right.doc"
        case .treatmentPlan: return "list.clipboard"
        case .testResults: return "chart.bar.doc.horizontal"
        case .referral: return "arrow.triangle.branch"
        case .insuranceBilling: return "creditcard"
        case .consentForm: return "checkmark.shield"
        case .careInstructions: return "heart.text.clipboard"
        case .identification: return "person.text.rectangle"
        case .correspondence: return "envelope"
        case .other: return "doc"
        }
    }
}

// MARK: - Audio Recording Categories

/// Matches backend AudioRecordingCategory enum in models/audio_recording.py
enum AudioCategory: String, Codable, CaseIterable, Identifiable {
    case symptomUpdate = "symptom_update"
    case appointmentRecap = "appointment_recap"
    case medicationNote = "medication_note"
    case questionForDoctor = "question_for_doctor"
    case dailyReflection = "daily_reflection"
    case progressUpdate = "progress_update"
    case sideEffects = "side_effects"
    case careInstruction = "care_instruction"
    case emergencyNote = "emergency_note"
    case familyUpdate = "family_update"
    case treatmentObservation = "treatment_observation"
    case providerConversation = "provider_conversation"
    case other = "other"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .symptomUpdate: return "Symptom Update"
        case .appointmentRecap: return "Appointment Recap"
        case .medicationNote: return "Medication Note"
        case .questionForDoctor: return "Question for Doctor"
        case .dailyReflection: return "Daily Reflection"
        case .progressUpdate: return "Progress Update"
        case .sideEffects: return "Side Effects"
        case .careInstruction: return "Care Instruction"
        case .emergencyNote: return "Emergency Note"
        case .familyUpdate: return "Family Update"
        case .treatmentObservation: return "Treatment Observation"
        case .providerConversation: return "Provider Conversation"
        case .other: return "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .symptomUpdate: return "heart.text.square"
        case .appointmentRecap: return "calendar.badge.checkmark"
        case .medicationNote: return "pills"
        case .questionForDoctor: return "questionmark.bubble"
        case .dailyReflection: return "sun.and.horizon"
        case .progressUpdate: return "chart.line.uptrend.xyaxis"
        case .sideEffects: return "exclamationmark.triangle"
        case .careInstruction: return "heart.text.clipboard"
        case .emergencyNote: return "cross.circle"
        case .familyUpdate: return "person.2"
        case .treatmentObservation: return "eye"
        case .providerConversation: return "bubble.left.and.bubble.right"
        case .other: return "mic"
        }
    }
}

// MARK: - Journal Entry Types

/// Display helpers for EntryType (enum defined in JournalModels.swift)
extension EntryType {
    var systemImage: String {
        switch self {
        case .medicalUpdate: return "cross.case"
        case .treatmentChange: return "arrow.triangle.2.circlepath"
        case .appointment: return "calendar"
        case .insight: return "lightbulb"
        case .milestone: return "star"
        case .other: return "note.text"
        }
    }

    var themeColor: Color {
        switch self {
        case .medicalUpdate: return .blue
        case .treatmentChange: return .orange
        case .appointment: return .purple
        case .insight: return .green
        case .milestone: return .teal
        case .other: return .gray
        }
    }
}
