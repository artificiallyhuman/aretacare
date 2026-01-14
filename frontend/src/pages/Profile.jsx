import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSessionContext } from '../contexts/SessionContext';
import { profileAPI } from '../services/api';
import { markdownToHtml } from '../utils/markdownUtils';

// Editable field component - defined outside to prevent re-creation on each render
const EditableField = ({ label, value, path, multiline = false, editedData, setEditedData }) => {
  const updateValue = (newValue) => {
    const pathParts = path.split('.');
    const newData = JSON.parse(JSON.stringify(editedData));
    let current = newData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = newValue || null;
    setEditedData(newData);
  };

  const currentValue = path.split('.').reduce((obj, key) => obj?.[key], editedData) || '';

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={currentValue}
          onChange={(e) => updateValue(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={currentValue}
          onChange={(e) => updateValue(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
        />
      )}
    </div>
  );
};

// Inline field for compact editing within list items
const InlineField = ({ label, value, onChange, multiline = false, options = null }) => (
  <div className="mb-2">
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
    {options ? (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
      >
        <option value="">Select...</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ) : multiline ? (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        rows={2}
      />
    ) : (
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
      />
    )}
  </div>
);

// Delete button for list items
const DeleteItemButton = ({ onClick }) => (
  <button
    onClick={onClick}
    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
    title="Delete"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
);

// Add item button
const AddItemButton = ({ onClick, label }) => (
  <button
    onClick={onClick}
    className="mt-3 flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
    {label}
  </button>
);

// Event type display labels
const EVENT_TYPE_LABELS = {
  hospitalization: 'Hospitalization',
  surgery: 'Surgery',
  er_visit: 'ER Visit',
  major_diagnosis: 'Major Diagnosis',
  procedure: 'Procedure',
  other: 'Other'
};

// Medication category labels and display order
const MEDICATION_CATEGORY_LABELS = {
  multiple: 'Multiple Uses',
  pain_management: 'Pain Relief',
  cardiovascular: 'Heart & Blood Pressure',
  diabetes: 'Diabetes & Blood Sugar',
  mental_health: 'Mental Health',
  antibiotics: 'Infection & Antibiotics',
  respiratory: 'Breathing & Lungs',
  gastrointestinal: 'Stomach & Digestion',
  neurological: 'Brain & Nerves',
  endocrine: 'Hormones',
  oncology: 'Cancer Treatment',
  immunosuppressant: 'Immune System',
  vitamins_supplements: 'Vitamins & Supplements',
  other: 'Other'
};

// Display order: multiple first, other last, rest alphabetically by label
const MEDICATION_CATEGORY_ORDER = [
  'multiple',
  'pain_management',
  'cardiovascular',
  'diabetes',
  'mental_health',
  'antibiotics',
  'respiratory',
  'gastrointestinal',
  'neurological',
  'endocrine',
  'oncology',
  'immunosuppressant',
  'vitamins_supplements',
  'other'
];

// Section configuration with icons and colors
const SECTION_CONFIG = {
  patient: {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    gradient: 'from-purple-500 to-indigo-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-200 dark:border-purple-800'
  },
  caregivers: {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    gradient: 'from-green-500 to-emerald-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  providers: {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    gradient: 'from-teal-500 to-cyan-600',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    borderColor: 'border-teal-200 dark:border-teal-800'
  },
  conditions: {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    gradient: 'from-orange-500 to-red-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-200 dark:border-orange-800'
  },
  medications: {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    gradient: 'from-pink-500 to-rose-600',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20',
    borderColor: 'border-pink-200 dark:border-pink-800'
  },
  allergies: {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    gradient: 'from-red-500 to-pink-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800'
  },
  events: {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    gradient: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  preferences: {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    gradient: 'from-indigo-500 to-purple-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800'
  }
};

// Calculate profile completeness
const calculateCompleteness = (profileData) => {
  if (!profileData) return 0;

  let totalSections = 8;
  let completedSections = 0;

  // Patient info
  if (profileData.patient && (profileData.patient.full_name || profileData.patient.preferred_name)) {
    completedSections++;
  }

  // Caregivers
  if (profileData.caregivers && profileData.caregivers.length > 0) {
    completedSections++;
  }

  // Providers
  if (profileData.providers && profileData.providers.length > 0) {
    completedSections++;
  }

  // Conditions
  if (profileData.conditions && profileData.conditions.length > 0) {
    completedSections++;
  }

  // Medications
  if (profileData.medications && profileData.medications.length > 0) {
    completedSections++;
  }

  // Allergies
  if (profileData.allergies && profileData.allergies.length > 0) {
    completedSections++;
  }

  // Events
  if (profileData.events && profileData.events.length > 0) {
    completedSections++;
  }

  // Preferences
  if (profileData.preferences && (
    profileData.preferences.emergency_instructions ||
    profileData.preferences.communication_preferences?.length > 0 ||
    profileData.preferences.caregiving_guidelines?.length > 0 ||
    profileData.preferences.important_context?.length > 0 ||
    profileData.preferences.additional_notes
  )) {
    completedSections++;
  }

  return Math.round((completedSections / totalSections) * 100);
};

const Profile = () => {
  const { activeSessionId: sessionId } = useSessionContext();
  const [profile, setProfile] = useState(null);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [editingSection, setEditingSection] = useState(null); // Track which section is being edited
  const [editedData, setEditedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showPendingChanges, setShowPendingChanges] = useState(false);
  const [changeDecisions, setChangeDecisions] = useState({});
  const [activityCounts, setActivityCounts] = useState({ conversations: 0, journal: 0 });
  const [expandedSections, setExpandedSections] = useState({
    patient: true,
    caregivers: true,
    providers: true,
    conditions: true,
    medications: true,
    allergies: true,
    events: true,
    preferences: true
  });

  // Track if new activity is available (don't auto-trigger AI)
  const [newActivityAvailable, setNewActivityAvailable] = useState(false);

  // Load profile on mount and when session changes
  const loadProfile = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError(null);

      // Check if update is needed (but don't auto-trigger AI)
      const checkResponse = await profileAPI.check(sessionId);
      const { needs_update, has_profile, new_conversation_count, new_journal_count } = checkResponse.data;

      // Store activity counts for display
      setActivityCounts({ conversations: new_conversation_count || 0, journal: new_journal_count || 0 });
      setNewActivityAvailable(needs_update);

      // Get existing profile (or empty one if none exists)
      const response = await profileAPI.get(sessionId);
      setProfile(response.data);
      setPendingChanges(response.data.pending_changes || []);
    } catch (err) {
      console.error('Error loading profile:', err);
      setError(err.response?.data?.detail || 'Failed to load profile');
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Auto-show pending changes modal when there are changes after loading
  useEffect(() => {
    if (!loading && !updating && pendingChanges.length > 0 && profile) {
      setShowPendingChanges(true);
    }
  }, [loading, updating, pendingChanges.length, profile]);

  // Handle manual refresh/update
  const handleRefresh = async () => {
    try {
      setUpdating(true);
      setError(null);
      const response = await profileAPI.update(sessionId);
      setProfile(response.data);
      setPendingChanges(response.data.pending_changes || []);
      setNewActivityAvailable(false);
      setActivityCounts({ conversations: 0, journal: 0 });
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };

  // Handle edit mode for a specific section
  const handleEditSection = (section) => {
    setEditingSection(section);
    setEditedData(JSON.parse(JSON.stringify(profile?.profile_data || {})));
  };

  const handleCancelEdit = () => {
    setEditingSection(null);
    setEditedData(null);
  };

  const handleSaveEdit = async () => {
    try {
      setUpdating(true);
      const response = await profileAPI.save(sessionId, editedData);
      setProfile(response.data);
      setEditingSection(null);
      setEditedData(null);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError(err.response?.data?.detail || 'Failed to save profile');
    } finally {
      setUpdating(false);
    }
  };

  // Handle pending changes review
  const handleReviewPendingChanges = async () => {
    try {
      setUpdating(true);
      const response = await profileAPI.reviewPendingChanges(sessionId, changeDecisions);
      setProfile(response.data);
      setPendingChanges(response.data.pending_changes || []);
      setShowPendingChanges(false);
      setChangeDecisions({});
    } catch (err) {
      console.error('Error reviewing changes:', err);
      setError(err.response?.data?.detail || 'Failed to apply changes');
    } finally {
      setUpdating(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    try {
      setUpdating(true);
      await profileAPI.delete(sessionId);
      setProfile(null);
      setPendingChanges([]);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Error deleting profile:', err);
      setError(err.response?.data?.detail || 'Failed to delete profile');
    } finally {
      setUpdating(false);
    }
  };

  // Handle regenerate
  const handleRegenerate = async () => {
    try {
      setShowRegenerateConfirm(false);
      setRegenerating(true);
      setUpdating(true);
      const response = await profileAPI.regenerate(sessionId, true);
      setProfile(response.data);
      setPendingChanges(response.data.pending_changes || []);
    } catch (err) {
      console.error('Error regenerating profile:', err);
      setError(err.response?.data?.detail || 'Failed to regenerate profile');
    } finally {
      setRegenerating(false);
      setUpdating(false);
    }
  };

  // Handle copy to clipboard
  const handleCopy = async () => {
    try {
      const content = generateProfileText(profile.profile_data);
      const html = markdownToHtml(content);

      const blob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([content], { type: 'text/plain' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob,
          'text/plain': textBlob
        })
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      try {
        const content = generateProfileText(profile.profile_data);
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr);
      }
    }
  };

  // Handle PDF export
  const handleExportPdf = async () => {
    try {
      const response = await profileAPI.exportPdf(sessionId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `profile_${sessionId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError(err.response?.data?.detail || 'Failed to export PDF');
    }
  };

  // Generate profile text for clipboard
  const generateProfileText = (data) => {
    let text = '# Health Profile\n\n';

    if (data?.patient) {
      text += '## Patient Information\n';
      if (data.patient.full_name) text += `- **Name:** ${data.patient.full_name}\n`;
      if (data.patient.preferred_name) text += `- **Preferred Name:** ${data.patient.preferred_name}\n`;
      if (data.patient.date_of_birth) text += `- **Date of Birth:** ${data.patient.date_of_birth}\n`;
      if (data.patient.age) text += `- **Age:** ${data.patient.age}\n`;
      if (data.patient.contact_info) text += `- **Contact:** ${data.patient.contact_info}\n`;
      if (data.patient.location) text += `- **Location:** ${data.patient.location}\n`;
      text += '\n';
    }

    if (data?.caregivers?.length > 0) {
      text += '## Caregivers\n';
      data.caregivers.forEach(cg => {
        text += `- **${cg.name || 'Unknown'}**`;
        if (cg.relationship) text += ` (${cg.relationship})`;
        if (cg.role) text += ` - ${cg.role}`;
        text += '\n';
      });
      text += '\n';
    }

    if (data?.providers?.length > 0) {
      text += '## Healthcare Providers\n';
      data.providers.forEach(p => {
        text += `- **${p.name || 'Unknown'}**`;
        if (p.specialty) text += `, ${p.specialty}`;
        if (p.organization) text += ` at ${p.organization}`;
        text += '\n';
      });
      text += '\n';
    }

    if (data?.conditions?.length > 0) {
      text += '## Conditions & Diagnoses\n';
      data.conditions.forEach(c => {
        text += `- **${c.clinical_term || 'Unknown'}**`;
        if (c.status) text += ` [${c.status.toUpperCase()}]`;
        if (c.description) text += `: ${c.description}`;
        text += '\n';
      });
      text += '\n';
    }

    if (data?.medications?.length > 0) {
      text += '## Medications\n\n';

      // Group medications by category
      MEDICATION_CATEGORY_ORDER.forEach(categoryKey => {
        const medsInCategory = data.medications
          .filter(m => (m.category || 'other') === categoryKey)
          .sort((a, b) => {
            const statusOrder = { active: 0, paused: 1, discontinued: 2 };
            return (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
          });

        if (medsInCategory.length > 0) {
          text += `### ${MEDICATION_CATEGORY_LABELS[categoryKey]}\n`;
          medsInCategory.forEach(m => {
            text += `- **${m.name || 'Unknown'}**`;
            if (m.dose) text += ` ${m.dose}`;
            if (m.frequency) text += `, ${m.frequency}`;
            if (m.description) text += ` - ${m.description}`;
            text += '\n';
          });
          text += '\n';
        }
      });
    }

    if (data?.events?.length > 0) {
      text += '## Medical History & Events\n';
      data.events.forEach(e => {
        text += `- **${EVENT_TYPE_LABELS[e.event_type] || e.event_type || 'Event'}**`;
        if (e.date) text += ` (${e.date})`;
        if (e.description) text += `: ${e.description}`;
        text += '\n';
      });
      text += '\n';
    }

    if (data?.allergies?.length > 0) {
      text += '## Allergies & Sensitivities\n';
      data.allergies.forEach(a => {
        text += `- **${a.substance || 'Unknown'}**`;
        if (a.severity) text += ` [${a.severity.toUpperCase()}]`;
        if (a.reaction) text += `: ${a.reaction}`;
        text += '\n';
      });
      text += '\n';
    }

    if (data?.preferences) {
      text += '## Preferences & Guidelines\n\n';

      // Emergency Instructions first
      if (data.preferences.emergency_instructions) {
        text += '### Emergency Instructions\n';
        text += `${data.preferences.emergency_instructions}\n\n`;
      }

      // Communication Preferences
      if (data.preferences.communication_preferences?.length > 0) {
        text += '### Communication Preferences\n';
        data.preferences.communication_preferences.forEach(pref => {
          text += `- ${pref.preference}`;
          if (pref.category) text += ` *(${pref.category.replace('_', ' ')})*`;
          text += '\n';
          if (pref.details) text += `  - ${pref.details}\n`;
        });
        text += '\n';
      }

      // Caregiving Guidelines
      if (data.preferences.caregiving_guidelines?.length > 0) {
        text += '### Caregiving Guidelines\n';
        data.preferences.caregiving_guidelines.forEach(guide => {
          text += `- ${guide.guideline}`;
          if (guide.importance) text += ` **[${guide.importance.toUpperCase()}]**`;
          if (guide.category) text += ` *(${guide.category.replace('_', ' ')})*`;
          text += '\n';
          if (guide.details) text += `  - ${guide.details}\n`;
        });
        text += '\n';
      }

      // Important Context
      if (data.preferences.important_context?.length > 0) {
        text += '### Important Context\n';
        data.preferences.important_context.forEach(ctx => {
          text += `- ${ctx.context}`;
          if (ctx.category) text += ` *(${ctx.category.replace('_', ' ')})*`;
          text += '\n';
          if (ctx.details) text += `  - ${ctx.details}\n`;
        });
        text += '\n';
      }

      // Additional Notes
      if (data.preferences.additional_notes) {
        text += '### Additional Notes\n';
        text += `${data.preferences.additional_notes}\n`;
      }
    }

    return text;
  };

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const expandAll = () => {
    setExpandedSections({
      patient: true,
      caregivers: true,
      providers: true,
      conditions: true,
      medications: true,
      allergies: true,
      events: true,
      preferences: true
    });
  };

  const collapseAll = () => {
    setExpandedSections({
      patient: false,
      caregivers: false,
      providers: false,
      conditions: false,
      medications: false,
      allergies: false,
      events: false,
      preferences: false
    });
  };

  const allExpanded = Object.values(expandedSections).every(v => v);
  const allCollapsed = Object.values(expandedSections).every(v => !v);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Sort items by date in reverse chronological order (newest first)
  const sortByDateDesc = (items, dateField) => {
    if (!items || items.length === 0) return items;
    return [...items].sort((a, b) => {
      const dateA = a[dateField] ? new Date(a[dateField]) : new Date(0);
      const dateB = b[dateField] ? new Date(b[dateField]) : new Date(0);
      return dateB - dateA; // Newest first
    });
  };

  // Helper to update a list item in editedData
  const updateListItem = (section, index, field, value) => {
    const newData = JSON.parse(JSON.stringify(editedData));
    if (!newData[section]) newData[section] = [];
    if (!newData[section][index]) newData[section][index] = {};
    newData[section][index][field] = value;
    setEditedData(newData);
  };

  // Helper to add a new item to a list
  const addListItem = (section, template) => {
    const newData = JSON.parse(JSON.stringify(editedData));
    if (!newData[section]) newData[section] = [];
    newData[section].push({ ...template, id: `new_${Date.now()}` });
    setEditedData(newData);
  };

  // Helper to delete an item from a list
  const deleteListItem = (section, index) => {
    const newData = JSON.parse(JSON.stringify(editedData));
    if (newData[section]) {
      newData[section].splice(index, 1);
      setEditedData(newData);
    }
  };

  // Helper to update nested preference items
  const updatePreferenceItem = (prefSection, index, field, value) => {
    const newData = JSON.parse(JSON.stringify(editedData));
    if (!newData.preferences) newData.preferences = {};
    if (!newData.preferences[prefSection]) newData.preferences[prefSection] = [];
    if (!newData.preferences[prefSection][index]) newData.preferences[prefSection][index] = {};
    newData.preferences[prefSection][index][field] = value;
    setEditedData(newData);
  };

  const addPreferenceItem = (prefSection, template) => {
    const newData = JSON.parse(JSON.stringify(editedData));
    if (!newData.preferences) newData.preferences = {};
    if (!newData.preferences[prefSection]) newData.preferences[prefSection] = [];
    newData.preferences[prefSection].push({ ...template, id: `new_${Date.now()}` });
    setEditedData(newData);
  };

  const deletePreferenceItem = (prefSection, index) => {
    const newData = JSON.parse(JSON.stringify(editedData));
    if (newData.preferences?.[prefSection]) {
      newData.preferences[prefSection].splice(index, 1);
      setEditedData(newData);
    }
  };

  const updatePreferenceField = (field, value) => {
    const newData = JSON.parse(JSON.stringify(editedData));
    if (!newData.preferences) newData.preferences = {};
    newData.preferences[field] = value;
    setEditedData(newData);
  };

  // Render section header with expand/collapse, icon, and edit controls
  const SectionHeader = ({ title, section, count }) => {
    const config = SECTION_CONFIG[section];
    const isEditingThis = editingSection === section;

    return (
      <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r rounded-t-lg">
        <button
          onClick={() => toggleSection(section)}
          className="flex items-center space-x-2 sm:space-x-3 flex-1 hover:opacity-80 transition-opacity"
        >
          {/* Icon with gradient background */}
          <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center text-white shadow-sm`}>
            {config.icon}
          </div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
            {count !== undefined && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                {count}
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-gray-400 transition-transform ${expandedSections[section] ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Edit/Save/Cancel buttons */}
        {expandedSections[section] && (
          <div className="flex items-center gap-1 sm:gap-2 ml-2">
            {isEditingThis ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  disabled={updating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={updating}
                >
                  {updating ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={() => handleEditSection(section)}
                className="px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                disabled={editingSection !== null} // Disable if another section is being edited
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            {updating ? 'Updating profile...' : 'Loading profile...'}
          </p>
          {updating && (activityCounts.conversations > 0 || activityCounts.journal > 0) && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
              Analyzing {activityCounts.conversations > 0 && `${activityCounts.conversations} conversation message${activityCounts.conversations !== 1 ? 's' : ''}`}
              {activityCounts.conversations > 0 && activityCounts.journal > 0 && ' and '}
              {activityCounts.journal > 0 && `${activityCounts.journal} journal entr${activityCounts.journal !== 1 ? 'ies' : 'y'}`}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Helper to get data for a section (edited if editing that section, otherwise normal)
  const getSectionData = (section) => {
    if (editingSection === section && editedData) {
      return editedData[section];
    }
    return profile?.profile_data?.[section];
  };

  const profileData = profile?.profile_data;
  const isEmpty = !profileData || (
    !profileData.patient &&
    (!profileData.caregivers || profileData.caregivers.length === 0) &&
    (!profileData.providers || profileData.providers.length === 0) &&
    (!profileData.conditions || profileData.conditions.length === 0) &&
    (!profileData.medications || profileData.medications.length === 0) &&
    (!profileData.allergies || profileData.allergies.length === 0) &&
    (!profileData.events || profileData.events.length === 0) &&
    !profileData.preferences
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      {/* Warning */}
      <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-4 rounded-r-lg">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1.5">Important</h3>
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              This summary is generated from your conversations and journal entries. It may be incomplete or contain errors. Please review and edit it before sharing with healthcare providers or others.
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">Health Profile</h1>
            <p className="mt-3 text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
              A living summary of patient, caregiver, provider, and care details. You stay in control at all times, with full ability to edit, copy, download, or reset it, and nothing is changed without your approval.
            </p>
            {profile?.last_ai_update && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                Last updated: {formatDate(profile.last_ai_update)}
              </p>
            )}
          </div>
        </div>

        {/* Progress Indicator */}
        {!isEmpty && (
          <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-purple-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Profile Completeness</span>
              </div>
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {calculateCompleteness(profileData)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${calculateCompleteness(profileData)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {calculateCompleteness(profileData) === 100
                ? '🎉 Your profile is complete!'
                : 'Continue chatting to grow your profile, or edit it directly'
              }
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* New Activity Available Banner - only show when profile has data */}
      {(newActivityAvailable || updating) && !isEmpty && (
        <div className="mb-6 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            {updating ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Updating profile...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  New activity available
                  {(activityCounts.conversations > 0 || activityCounts.journal > 0) && (
                    <span className="text-sm ml-1">
                      ({activityCounts.conversations > 0 && `${activityCounts.conversations} conversation${activityCounts.conversations !== 1 ? 's' : ''}`}
                      {activityCounts.conversations > 0 && activityCounts.journal > 0 && ', '}
                      {activityCounts.journal > 0 && `${activityCounts.journal} journal entr${activityCounts.journal !== 1 ? 'ies' : 'y'}`})
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
          {!updating && (
            <button
              onClick={handleRefresh}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
            >
              Update Profile
            </button>
          )}
        </div>
      )}

      {/* Action Buttons - only show when profile has data */}
      {!isEmpty && (
      <div className="mb-6 space-y-3">
        {/* Review Changes - prominent when present */}
        {pendingChanges.length > 0 && (
          <button
            onClick={() => setShowPendingChanges(true)}
            className="w-full btn-primary flex items-center justify-center space-x-2"
          >
            <span className="w-5 h-5 flex items-center justify-center bg-white text-primary-600 rounded-full text-xs font-bold">
              {pendingChanges.length}
            </span>
            <span>Review Suggested Changes</span>
          </button>
        )}

        {/* Desktop: single row */}
        <div className="hidden sm:flex sm:flex-wrap sm:gap-2">
          <button
            onClick={handleCopy}
            disabled={isEmpty || updating}
            className="btn-secondary flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isEmpty || updating}
            className="btn-secondary flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>PDF</span>
          </button>
          <div className="flex-1"></div>
          <button
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={updating}
            className="btn-secondary text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Regenerate</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isEmpty || updating}
            className="btn-secondary text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
        </div>

        {/* Mobile: grid with icons and labels */}
        <div className="grid grid-cols-4 gap-2 sm:hidden">
          <button
            onClick={handleCopy}
            disabled={isEmpty || updating}
            className="btn-secondary flex flex-col items-center justify-center py-2"
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {copied ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              )}
            </svg>
            <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isEmpty || updating}
            className="btn-secondary flex flex-col items-center justify-center py-2"
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs">PDF</span>
          </button>
          <button
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={updating}
            className="btn-secondary text-orange-700 dark:text-orange-400 flex flex-col items-center justify-center py-2"
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-xs">Regen</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isEmpty || updating}
            className="btn-secondary text-red-700 dark:text-red-400 flex flex-col items-center justify-center py-2"
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="text-xs">Delete</span>
          </button>
        </div>
      </div>
      )}

      {/* Empty State */}
      {isEmpty && editingSection === null && (
        <div className="text-center py-12">
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border-2 border-primary-200 dark:border-gray-700 px-6 py-8 max-w-2xl mx-auto">
            <svg className="w-16 h-16 text-primary-600 dark:text-primary-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Profile Data Yet</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your profile will be automatically populated as you have conversations and add journal entries.
            </p>
            <button
              onClick={handleRefresh}
              disabled={updating}
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              {updating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Checking for data...</span>
                </>
              ) : (
                'Check for Data'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Profile Content */}
      {!isEmpty && (
        <div className="space-y-6">
          {/* Expand/Collapse All */}
          <div className="flex justify-end space-x-3 text-sm">
            <button
              onClick={expandAll}
              disabled={allExpanded}
              className="px-3 py-1.5 rounded-md font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Expand all
            </button>
            <button
              onClick={collapseAll}
              disabled={allCollapsed}
              className="px-3 py-1.5 rounded-md font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Collapse all
            </button>
          </div>

          {/* Patient Information */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <SectionHeader title="Patient Information" section="patient" />
            {expandedSections.patient && (
              <div className="p-4">
                {editingSection === 'patient' ? (
                  <>
                    <EditableField label="Full Name" path="patient.full_name" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Preferred Name" path="patient.preferred_name" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Date of Birth" path="patient.date_of_birth" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Age" path="patient.age" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Contact Information" path="patient.contact_info" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Location" path="patient.location" editedData={editedData} setEditedData={setEditedData} />
                  </>
                ) : profileData?.patient ? (
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-5 border-l-4 border-purple-500 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {profileData.patient.full_name && (
                        <div>
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Full Name</span>
                          <p className="text-gray-900 dark:text-white font-bold text-lg mt-1">{profileData.patient.full_name}</p>
                        </div>
                      )}
                      {profileData.patient.preferred_name && (
                        <div>
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Preferred Name</span>
                          <p className="text-gray-900 dark:text-white font-bold text-lg mt-1">{profileData.patient.preferred_name}</p>
                        </div>
                      )}
                      {profileData.patient.date_of_birth && (
                        <div>
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Date of Birth</span>
                          <p className="text-gray-900 dark:text-white font-medium mt-1">{profileData.patient.date_of_birth}</p>
                        </div>
                      )}
                      {profileData.patient.age && (
                        <div>
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Age</span>
                          <p className="text-gray-900 dark:text-white font-medium mt-1">{profileData.patient.age}</p>
                        </div>
                      )}
                      {profileData.patient.contact_info && (
                        <div>
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Contact</span>
                          <p className="text-gray-900 dark:text-white font-medium mt-1">{profileData.patient.contact_info}</p>
                        </div>
                      )}
                      {profileData.patient.location && (
                        <div>
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Location</span>
                          <p className="text-gray-900 dark:text-white font-medium mt-1">{profileData.patient.location}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No patient information yet</p>
                )}
              </div>
            )}
          </div>

          {/* Caregivers */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <SectionHeader title="Caregivers" section="caregivers" count={profileData?.caregivers?.length || 0} />
            {expandedSections.caregivers && (
              <div className="p-4">
                {editingSection === 'caregivers' ? (
                  <>
                    <div className="space-y-4">
                      {(editedData?.caregivers || []).map((cg, index) => (
                        <div key={cg.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <DeleteItemButton onClick={() => deleteListItem('caregivers', index)} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                            <InlineField label="Name" value={cg.name} onChange={(v) => updateListItem('caregivers', index, 'name', v)} />
                            <InlineField label="Relationship" value={cg.relationship} onChange={(v) => updateListItem('caregivers', index, 'relationship', v)} />
                            <InlineField label="Role" value={cg.role} onChange={(v) => updateListItem('caregivers', index, 'role', v)} />
                            <InlineField label="Contact Info" value={cg.contact_info} onChange={(v) => updateListItem('caregivers', index, 'contact_info', v)} />
                            <InlineField label="Location" value={cg.location} onChange={(v) => updateListItem('caregivers', index, 'location', v)} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <AddItemButton onClick={() => addListItem('caregivers', { name: '', relationship: '', role: '', contact_info: '', location: '' })} label="Add caregiver" />
                  </>
                ) : profileData?.caregivers?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profileData.caregivers.map((cg, index) => (
                      <div
                        key={cg.id || index}
                        className="p-4 rounded-lg shadow-sm transition-all hover:shadow-md border-l-4 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="font-bold text-gray-900 dark:text-white text-base">
                                {cg.name || 'Unknown'}
                              </h4>
                            </div>
                            {cg.relationship && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                {cg.relationship}
                              </p>
                            )}
                          </div>
                        </div>
                        {cg.role && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                            {cg.role}
                          </p>
                        )}
                        {cg.contact_info && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                            {cg.contact_info}
                          </p>
                        )}
                        {cg.location && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            📍 {cg.location}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No caregivers added yet</p>
                )}
              </div>
            )}
          </div>

          {/* Providers */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <SectionHeader title="Healthcare Providers" section="providers" count={profileData?.providers?.length || 0} />
            {expandedSections.providers && (
              <div className="p-4">
                {editingSection === 'providers' ? (
                  <>
                    <div className="space-y-4">
                      {(editedData?.providers || []).map((p, index) => (
                        <div key={p.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <DeleteItemButton onClick={() => deleteListItem('providers', index)} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                            <InlineField label="Name" value={p.name} onChange={(v) => updateListItem('providers', index, 'name', v)} />
                            <InlineField label="Specialty" value={p.specialty} onChange={(v) => updateListItem('providers', index, 'specialty', v)} />
                            <InlineField label="Organization" value={p.organization} onChange={(v) => updateListItem('providers', index, 'organization', v)} />
                            <InlineField label="Contact Info" value={p.contact_info} onChange={(v) => updateListItem('providers', index, 'contact_info', v)} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <AddItemButton onClick={() => addListItem('providers', { name: '', specialty: '', organization: '', contact_info: '' })} label="Add provider" />
                  </>
                ) : profileData?.providers?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profileData.providers.map((p, index) => (
                      <div
                        key={p.id || index}
                        className="p-4 rounded-lg shadow-sm transition-all hover:shadow-md border-l-4 border-teal-500 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-900 dark:text-white text-base mb-1">
                              {p.name || 'Unknown'}
                            </h4>
                            {p.specialty && (
                              <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300">
                                {p.specialty}
                              </span>
                            )}
                          </div>
                        </div>
                        {p.organization && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 font-medium">
                            🏥 {p.organization}
                          </p>
                        )}
                        {p.contact_info && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                            {p.contact_info}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No providers added yet</p>
                )}
              </div>
            )}
          </div>

          {/* Conditions */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <SectionHeader title="Conditions & Diagnoses" section="conditions" count={profileData?.conditions?.length || 0} />
            {expandedSections.conditions && (
              <div className="p-4">
                {editingSection === 'conditions' ? (
                  <>
                    <div className="space-y-4">
                      {(editedData?.conditions || []).map((c, index) => (
                        <div key={c.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <DeleteItemButton onClick={() => deleteListItem('conditions', index)} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                            <InlineField label="Clinical Term" value={c.clinical_term} onChange={(v) => updateListItem('conditions', index, 'clinical_term', v)} />
                            <InlineField label="Status" value={c.status} onChange={(v) => updateListItem('conditions', index, 'status', v)} options={[
                              { value: 'active', label: 'Active' },
                              { value: 'monitoring', label: 'Monitoring' },
                              { value: 'resolved', label: 'Resolved' }
                            ]} />
                            <div className="md:col-span-2">
                              <InlineField label="Description (plain language)" value={c.description} onChange={(v) => updateListItem('conditions', index, 'description', v)} multiline />
                            </div>
                            <InlineField label="Diagnosis Date" value={c.diagnosis_date} onChange={(v) => updateListItem('conditions', index, 'diagnosis_date', v)} />
                            <InlineField label="Details" value={c.details} onChange={(v) => updateListItem('conditions', index, 'details', v)} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <AddItemButton onClick={() => addListItem('conditions', { clinical_term: '', description: '', status: 'active', diagnosis_date: '', details: '' })} label="Add condition" />
                  </>
                ) : profileData?.conditions?.length > 0 ? (
                  <div className="space-y-4">
                    {[...profileData.conditions]
                      .sort((a, b) => {
                        const statusOrder = { active: 0, monitoring: 1, resolved: 2 };
                        const statusA = statusOrder[a.status] ?? 1;
                        const statusB = statusOrder[b.status] ?? 1;
                        if (statusA !== statusB) return statusA - statusB;
                        const dateA = a.diagnosis_date ? new Date(a.diagnosis_date) : new Date(0);
                        const dateB = b.diagnosis_date ? new Date(b.diagnosis_date) : new Date(0);
                        return dateB - dateA;
                      })
                      .map((c, index) => {
                        const statusColors = {
                          active: 'border-red-500 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20',
                          monitoring: 'border-yellow-500 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20',
                          resolved: 'border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                        };
                        const borderColor = statusColors[c.status] || 'border-gray-300 bg-gray-50 dark:bg-gray-700';

                        return (
                          <div
                            key={c.id || index}
                            className={`p-4 rounded-lg shadow-sm transition-all hover:shadow-md border-l-4 ${borderColor}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h4 className="font-bold text-gray-900 dark:text-white text-base mb-1">
                                  {c.clinical_term || 'Unknown'}
                                </h4>
                                {c.status && (
                                  <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${
                                    c.status === 'active' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                                    c.status === 'resolved' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' :
                                    'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                  }`}>
                                    {c.status.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </div>
                            {c.description && (
                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">
                                {c.description}
                              </p>
                            )}
                            {c.diagnosis_date && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                                📅 Diagnosed: <span className="font-medium">{c.diagnosis_date}</span>
                              </p>
                            )}
                            {c.details && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                {c.details}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No conditions recorded yet</p>
                )}
              </div>
            )}
          </div>

          {/* Medications */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <SectionHeader title="Medications" section="medications" count={profileData?.medications?.length || 0} />
            {expandedSections.medications && (
              <div className="p-4">
                {editingSection === 'medications' ? (
                  <>
                    <div className="space-y-4">
                      {(editedData?.medications || []).map((m, index) => (
                        <div key={m.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <DeleteItemButton onClick={() => deleteListItem('medications', index)} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                            <InlineField label="Name" value={m.name} onChange={(v) => updateListItem('medications', index, 'name', v)} />
                            <InlineField label="Dose" value={m.dose} onChange={(v) => updateListItem('medications', index, 'dose', v)} />
                            <InlineField label="Frequency" value={m.frequency} onChange={(v) => updateListItem('medications', index, 'frequency', v)} />
                            <InlineField label="Prescriber" value={m.prescriber} onChange={(v) => updateListItem('medications', index, 'prescriber', v)} />
                            <InlineField label="Start Date" value={m.start_date} onChange={(v) => updateListItem('medications', index, 'start_date', v)} />
                            <InlineField label="Status" value={m.status || 'active'} onChange={(v) => updateListItem('medications', index, 'status', v)} options={[
                              { value: 'active', label: 'Active' },
                              { value: 'paused', label: 'Paused' },
                              { value: 'discontinued', label: 'Discontinued' }
                            ]} />
                            <InlineField label="Category" value={m.category || 'other'} onChange={(v) => updateListItem('medications', index, 'category', v)} options={MEDICATION_CATEGORY_ORDER.map(key => ({ value: key, label: MEDICATION_CATEGORY_LABELS[key] }))} />
                            <div className="md:col-span-2">
                              <InlineField label="Description" value={m.description} onChange={(v) => updateListItem('medications', index, 'description', v)} />
                            </div>
                            <div className="md:col-span-2">
                              <InlineField label="Notes" value={m.notes} onChange={(v) => updateListItem('medications', index, 'notes', v)} multiline />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <AddItemButton onClick={() => addListItem('medications', { name: '', dose: '', frequency: '', prescriber: '', start_date: '', description: '', notes: '', status: 'active', category: 'other' })} label="Add medication" />
                  </>
                ) : profileData?.medications?.length > 0 ? (
                  <div className="space-y-6">
                    {/* Group medications by category */}
                    {MEDICATION_CATEGORY_ORDER.map(categoryKey => {
                      const medsInCategory = profileData.medications
                        .filter(m => (m.category || 'other') === categoryKey)
                        .sort((a, b) => {
                          // Sort: Active first, then Paused, then Discontinued
                          const statusOrder = { active: 0, paused: 1, discontinued: 2 };
                          const aOrder = statusOrder[a.status] ?? 0;
                          const bOrder = statusOrder[b.status] ?? 0;
                          return aOrder - bOrder;
                        });

                      if (medsInCategory.length === 0) return null;

                      return (
                        <div key={categoryKey}>
                          {/* Category header */}
                          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3 flex items-center">
                            <span className="flex-1">{MEDICATION_CATEGORY_LABELS[categoryKey]}</span>
                            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                              {medsInCategory.length} {medsInCategory.length === 1 ? 'medication' : 'medications'}
                            </span>
                          </h4>

                          {/* Medications in this category */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {medsInCategory.map((m, index) => {
                              // Determine if medication is active (default to active if not specified)
                              const isActive = m.status !== 'discontinued' && m.status !== 'paused';

                              return (
                                <div
                                  key={m.id || index}
                                  className={`p-4 rounded-lg border-l-4 shadow-sm transition-all hover:shadow-md ${
                                    isActive
                                      ? 'bg-gradient-to-r from-pink-50 to-white dark:from-pink-900/20 dark:to-gray-700 border-pink-500'
                                      : 'bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-700 border-gray-400 opacity-75'
                                  }`}
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-2 mb-1">
                                        <h4 className="font-bold text-gray-900 dark:text-white text-base">
                                          {m.name || 'Unknown'}
                                        </h4>
                                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                          m.status === 'active' || !m.status
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                            : m.status === 'paused'
                                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                        }`}>
                                          {m.status === 'paused' ? 'Paused' : m.status === 'discontinued' ? 'Discontinued' : 'Active'}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                                        {m.dose && <span className="font-medium">{m.dose}</span>}
                                        {m.frequency && <span>• {m.frequency}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  {m.description && (
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
                                      {m.description}
                                    </p>
                                  )}
                                  {m.prescriber && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                      Prescribed by: <span className="font-medium">{m.prescriber}</span>
                                    </p>
                                  )}
                                  {m.start_date && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Started: {m.start_date}
                                    </p>
                                  )}
                                  {m.notes && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                                      {m.notes}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No medications recorded yet</p>
                )}
              </div>
            )}
          </div>

          {/* Events/History */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <SectionHeader title="Medical History & Events" section="events" count={profileData?.events?.length || 0} />
            {expandedSections.events && (
              <div className="p-4">
                {editingSection === 'events' ? (
                  <>
                    <div className="space-y-4">
                      {(editedData?.events || []).map((e, index) => (
                        <div key={e.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <DeleteItemButton onClick={() => deleteListItem('events', index)} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                            <InlineField label="Event Type" value={e.event_type} onChange={(v) => updateListItem('events', index, 'event_type', v)} options={[
                              { value: 'hospitalization', label: 'Hospitalization' },
                              { value: 'surgery', label: 'Surgery' },
                              { value: 'er_visit', label: 'ER Visit' },
                              { value: 'major_diagnosis', label: 'Major Diagnosis' },
                              { value: 'procedure', label: 'Procedure' },
                              { value: 'other', label: 'Other' }
                            ]} />
                            <InlineField label="Date" value={e.date} onChange={(v) => updateListItem('events', index, 'date', v)} />
                            <div className="md:col-span-2">
                              <InlineField label="Description" value={e.description} onChange={(v) => updateListItem('events', index, 'description', v)} />
                            </div>
                            <div className="md:col-span-2">
                              <InlineField label="Details" value={e.details} onChange={(v) => updateListItem('events', index, 'details', v)} multiline />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <AddItemButton onClick={() => addListItem('events', { event_type: '', date: '', description: '', details: '' })} label="Add event" />
                  </>
                ) : profileData?.events?.length > 0 ? (
                  <div className="relative pl-8 space-y-6">
                    {/* Timeline line */}
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 to-indigo-500" />

                    {sortByDateDesc(profileData.events, 'date').map((e, index) => {
                      // Color coding for event types
                      const eventColors = {
                        hospitalization: 'bg-red-500',
                        surgery: 'bg-purple-500',
                        er_visit: 'bg-orange-500',
                        major_diagnosis: 'bg-pink-500',
                        procedure: 'bg-blue-500',
                        other: 'bg-gray-500'
                      };
                      const dotColor = eventColors[e.event_type] || 'bg-gray-500';

                      return (
                        <div key={e.id || index} className="relative">
                          {/* Timeline dot */}
                          <div className={`absolute -left-8 top-2 w-4 h-4 rounded-full ${dotColor} ring-4 ring-white dark:ring-gray-800 shadow-sm`} />

                          {/* Event card */}
                          <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-600 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${dotColor} text-white shadow-sm`}>
                                    {EVENT_TYPE_LABELS[e.event_type] || e.event_type || 'Event'}
                                  </span>
                                  {e.date && (
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                      {e.date}
                                    </span>
                                  )}
                                </div>
                                {e.description && (
                                  <h4 className="font-semibold text-gray-900 dark:text-white text-base leading-tight">
                                    {e.description}
                                  </h4>
                                )}
                              </div>
                            </div>
                            {e.details && (
                              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-2">
                                {e.details}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No events recorded yet</p>
                )}
              </div>
            )}
          </div>

          {/* Allergies */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <SectionHeader title="Allergies & Sensitivities" section="allergies" count={profileData?.allergies?.length || 0} />
            {expandedSections.allergies && (
              <div className="p-4">
                {editingSection === 'allergies' ? (
                  <>
                    <div className="space-y-4">
                      {(editedData?.allergies || []).map((a, index) => (
                        <div key={a.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <DeleteItemButton onClick={() => deleteListItem('allergies', index)} />
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pr-6">
                            <InlineField label="Substance" value={a.substance} onChange={(v) => updateListItem('allergies', index, 'substance', v)} />
                            <InlineField label="Severity" value={a.severity} onChange={(v) => updateListItem('allergies', index, 'severity', v)} options={[
                              { value: 'mild', label: 'Mild' },
                              { value: 'moderate', label: 'Moderate' },
                              { value: 'severe', label: 'Severe' }
                            ]} />
                            <InlineField label="Reaction" value={a.reaction} onChange={(v) => updateListItem('allergies', index, 'reaction', v)} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <AddItemButton onClick={() => addListItem('allergies', { substance: '', severity: '', reaction: '' })} label="Add allergy" />
                  </>
                ) : profileData?.allergies?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profileData.allergies.map((a, index) => {
                      const severityStyles = {
                        severe: 'border-red-500 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/30 dark:to-pink-900/30',
                        moderate: 'border-orange-500 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20',
                        mild: 'border-yellow-500 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20'
                      };
                      const cardStyle = severityStyles[a.severity] || 'border-gray-300 bg-gray-50 dark:bg-gray-700';

                      return (
                        <div
                          key={a.id || index}
                          className={`p-4 rounded-lg shadow-sm transition-all hover:shadow-md border-l-4 ${cardStyle}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-bold text-gray-900 dark:text-white text-base mb-1">
                                ⚠️ {a.substance || 'Unknown'}
                              </h4>
                              {a.severity && (
                                <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${
                                  a.severity === 'severe' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                                  a.severity === 'moderate' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300' :
                                  'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                }`}>
                                  {a.severity.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                          {a.reaction && (
                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">
                              <span className="font-semibold">Reaction:</span> {a.reaction}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No allergies recorded yet</p>
                )}
              </div>
            )}
          </div>

          {/* Preferences */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <SectionHeader title="Preferences & Guidelines" section="preferences" />
            {expandedSections.preferences && (
              <div className="p-4 space-y-6">
                {editingSection === 'preferences' ? (
                  <>
                    {/* Emergency Instructions */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Emergency Instructions</h4>
                        {editedData?.preferences?.emergency_instructions && (
                          <button
                            onClick={() => updatePreferenceField('emergency_instructions', null)}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <textarea
                        value={editedData?.preferences?.emergency_instructions || ''}
                        onChange={(e) => updatePreferenceField('emergency_instructions', e.target.value || null)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        rows={3}
                        placeholder="Critical emergency information (optional)..."
                      />
                    </div>

                    {/* Communication Preferences */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Communication Preferences</h4>
                      <div className="space-y-3">
                        {(editedData?.preferences?.communication_preferences || []).map((pref, index) => (
                          <div key={pref.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <DeleteItemButton onClick={() => deletePreferenceItem('communication_preferences', index)} />
                            <div className="grid grid-cols-1 gap-2 pr-6">
                              <InlineField label="Preference" value={pref.preference} onChange={(v) => updatePreferenceItem('communication_preferences', index, 'preference', v)} />
                              <InlineField label="Details" value={pref.details} onChange={(v) => updatePreferenceItem('communication_preferences', index, 'details', v)} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <AddItemButton onClick={() => addPreferenceItem('communication_preferences', { preference: '', details: '' })} label="Add preference" />
                    </div>

                    {/* Caregiving Guidelines */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Caregiving Guidelines</h4>
                      <div className="space-y-3">
                        {(editedData?.preferences?.caregiving_guidelines || []).map((guide, index) => (
                          <div key={guide.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <DeleteItemButton onClick={() => deletePreferenceItem('caregiving_guidelines', index)} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                              <div className="md:col-span-2">
                                <InlineField label="Guideline" value={guide.guideline} onChange={(v) => updatePreferenceItem('caregiving_guidelines', index, 'guideline', v)} />
                              </div>
                              <InlineField label="Importance" value={guide.importance} onChange={(v) => updatePreferenceItem('caregiving_guidelines', index, 'importance', v)} options={[
                                { value: 'critical', label: 'Critical' },
                                { value: 'important', label: 'Important' },
                                { value: 'preferred', label: 'Preferred' }
                              ]} />
                              <InlineField label="Details" value={guide.details} onChange={(v) => updatePreferenceItem('caregiving_guidelines', index, 'details', v)} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <AddItemButton onClick={() => addPreferenceItem('caregiving_guidelines', { guideline: '', importance: '', details: '' })} label="Add guideline" />
                    </div>

                    {/* Important Context */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Important Context</h4>
                      <div className="space-y-3">
                        {(editedData?.preferences?.important_context || []).map((ctx, index) => (
                          <div key={ctx.id || index} className="relative p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <DeleteItemButton onClick={() => deletePreferenceItem('important_context', index)} />
                            <div className="grid grid-cols-1 gap-2 pr-6">
                              <InlineField label="Context" value={ctx.context} onChange={(v) => updatePreferenceItem('important_context', index, 'context', v)} />
                              <InlineField label="Details" value={ctx.details} onChange={(v) => updatePreferenceItem('important_context', index, 'details', v)} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <AddItemButton onClick={() => addPreferenceItem('important_context', { context: '', details: '' })} label="Add context" />
                    </div>

                    {/* Additional Notes */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Additional Notes</h4>
                      <textarea
                        value={editedData?.preferences?.additional_notes || ''}
                        onChange={(e) => updatePreferenceField('additional_notes', e.target.value || null)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        rows={3}
                        placeholder="Any other important information..."
                      />
                    </div>
                  </>
                ) : profileData?.preferences ? (
                  <>
                    {/* Emergency Instructions - Always show first if present */}
                    {profileData.preferences.emergency_instructions && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="font-semibold text-red-800 dark:text-red-200">Emergency Instructions</span>
                        </div>
                        <p className="text-red-900 dark:text-red-100">{profileData.preferences.emergency_instructions}</p>
                      </div>
                    )}

                    {/* Communication Preferences */}
                    {profileData.preferences.communication_preferences?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Communication Preferences
                        </h4>
                        <div className="space-y-2">
                          {profileData.preferences.communication_preferences.map((pref, index) => (
                            <div key={pref.id || index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <span className="text-gray-900 dark:text-white">{pref.preference}</span>
                                  {pref.details && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{pref.details}</p>}
                                </div>
                                {pref.category && (
                                  <span className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                                    {pref.category.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Caregiving Guidelines */}
                    {profileData.preferences.caregiving_guidelines?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Caregiving Guidelines
                        </h4>
                        <div className="space-y-2">
                          {profileData.preferences.caregiving_guidelines.map((guide, index) => (
                            <div key={guide.id || index} className={`p-3 bg-gray-50 dark:bg-gray-700 rounded-lg ${
                              guide.importance === 'critical' ? 'border-l-3 border-red-500' :
                              guide.importance === 'important' ? 'border-l-3 border-orange-400' : ''
                            }`}>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <span className="text-gray-900 dark:text-white">{guide.guideline}</span>
                                  {guide.details && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{guide.details}</p>}
                                </div>
                                <div className="flex flex-col items-end ml-2 space-y-1">
                                  {guide.importance && (
                                    <span className={`px-2 py-1 text-xs rounded ${
                                      guide.importance === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                      guide.importance === 'important' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                                      'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                                    }`}>
                                      {guide.importance}
                                    </span>
                                  )}
                                  {guide.category && (
                                    <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                                      {guide.category.replace('_', ' ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Important Context */}
                    {profileData.preferences.important_context?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Important Context
                        </h4>
                        <div className="space-y-2">
                          {profileData.preferences.important_context.map((ctx, index) => (
                            <div key={ctx.id || index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <span className="text-gray-900 dark:text-white">{ctx.context}</span>
                                  {ctx.details && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{ctx.details}</p>}
                                </div>
                                {ctx.category && (
                                  <span className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                                    {ctx.category.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Additional Notes */}
                    {profileData.preferences.additional_notes && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Additional Notes</h4>
                        <p className="text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                          {profileData.preferences.additional_notes}
                        </p>
                      </div>
                    )}

                    {/* Empty state for preferences */}
                    {!profileData.preferences.emergency_instructions &&
                     !profileData.preferences.communication_preferences?.length &&
                     !profileData.preferences.caregiving_guidelines?.length &&
                     !profileData.preferences.important_context?.length &&
                     !profileData.preferences.additional_notes && (
                      <p className="text-gray-500 dark:text-gray-400 italic">No preferences set yet</p>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No preferences set yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Changes Modal */}
      {showPendingChanges && pendingChanges.length > 0 && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Review Suggested Changes</h2>
                <button
                  onClick={() => setShowPendingChanges(false)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                The AI has suggested the following changes based on new activity. Review each change and decide whether to accept, reject, or edit it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const allAccepted = {};
                    pendingChanges.forEach(c => { allAccepted[c.id] = 'accept'; });
                    setChangeDecisions(allAccepted);
                  }}
                  className="text-sm px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50"
                >
                  Accept all
                </button>
                <button
                  onClick={() => {
                    const allRejected = {};
                    pendingChanges.forEach(c => { allRejected[c.id] = 'reject'; });
                    setChangeDecisions(allRejected);
                  }}
                  className="text-sm px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                >
                  Reject all
                </button>
                <button
                  onClick={() => setChangeDecisions({})}
                  className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {pendingChanges.map((change) => (
                <div key={change.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  {/* Header: Section name prominently displayed */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      change.change_type === 'add' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                      change.change_type === 'edit' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
                      'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                    }`}>
                      {change.change_type.toUpperCase()}
                    </span>
                    <span className="text-base font-semibold text-gray-900 dark:text-white capitalize">
                      {change.section.replace(/_/g, ' ')}
                    </span>
                    {/* Show item name if available for context */}
                    {(change.new_value?.name || change.old_value?.name) && (
                      <span className="text-gray-500 dark:text-gray-400">
                        — {change.new_value?.name || change.old_value?.name}
                      </span>
                    )}
                  </div>

                  {change.change_type === 'add' && (
                    <div className="mb-3">
                      <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded text-sm">
                        <span className="text-green-700 dark:text-green-300 font-medium">New item to add: </span>
                        <div className="text-green-600 dark:text-green-400 mt-1">
                          {typeof change.new_value === 'object' ? (
                            <ul className="list-disc list-inside space-y-1">
                              {Object.entries(change.new_value).filter(([k, v]) => v && k !== 'id').map(([key, value]) => {
                                // Handle nested objects/arrays
                                let displayValue;
                                if (Array.isArray(value)) {
                                  if (value.length === 0) return null;
                                  // For arrays of objects, show count or summary
                                  displayValue = value.map((item, i) =>
                                    typeof item === 'object'
                                      ? Object.values(item).filter(v => v).join(' - ')
                                      : String(item)
                                  ).join('; ');
                                } else if (typeof value === 'object' && value !== null) {
                                  displayValue = Object.entries(value)
                                    .filter(([, v]) => v)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(', ');
                                } else {
                                  displayValue = String(value);
                                }
                                if (!displayValue) return null;
                                return (
                                  <li key={key}>
                                    <span className="font-medium">{key.replace(/_/g, ' ')}:</span> {displayValue}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            String(change.new_value)
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {change.change_type === 'edit' && (
                    <div className="mb-3 space-y-2">
                      {typeof change.old_value === 'object' && typeof change.new_value === 'object' ? (
                        // Show side-by-side comparison for object edits
                        <div className="space-y-2">
                          {Object.keys({...change.old_value, ...change.new_value}).filter(k => k !== 'id').map(key => {
                            const oldVal = change.old_value?.[key];
                            const newVal = change.new_value?.[key];
                            const isChanged = oldVal !== newVal && (oldVal || newVal);
                            if (!isChanged) return null;
                            return (
                              <div key={key} className="bg-gray-50 dark:bg-gray-700 p-2 rounded text-sm">
                                <span className="font-medium text-gray-700 dark:text-gray-300">{key.replace(/_/g, ' ')}:</span>
                                {oldVal && (
                                  <span className="ml-2 line-through text-red-600 dark:text-red-400">{String(oldVal)}</span>
                                )}
                                <span className="ml-2 text-green-600 dark:text-green-400">→ {String(newVal || '(removed)')}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        // Simple before/after for single field edits
                        <>
                          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-sm">
                            <span className="text-red-700 dark:text-red-300 font-medium">Current: </span>
                            <span className="text-red-600 dark:text-red-400">{String(change.old_value)}</span>
                          </div>
                          <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded text-sm">
                            <span className="text-green-700 dark:text-green-300 font-medium">Proposed: </span>
                            <span className="text-green-600 dark:text-green-400">{String(change.new_value)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {change.change_type === 'delete' && (
                    <div className="mb-3">
                      <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-sm">
                        <span className="text-red-700 dark:text-red-300 font-medium">To delete: </span>
                        <div className="text-red-600 dark:text-red-400 mt-1">
                          {typeof change.old_value === 'object' ? (
                            <ul className="list-disc list-inside space-y-1">
                              {Object.entries(change.old_value).filter(([k, v]) => v && k !== 'id').map(([key, value]) => (
                                <li key={key}>
                                  <span className="font-medium">{key.replace(/_/g, ' ')}:</span> {String(value)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            String(change.old_value)
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    <span className="font-medium">Reasoning:</span> {change.reasoning}
                  </p>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => setChangeDecisions({ ...changeDecisions, [change.id]: 'accept' })}
                      className={`px-3 py-1.5 text-sm rounded ${
                        changeDecisions[change.id] === 'accept'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/30'
                      }`}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => setChangeDecisions({ ...changeDecisions, [change.id]: 'reject' })}
                      className={`px-3 py-1.5 text-sm rounded ${
                        changeDecisions[change.id] === 'reject'
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30'
                      }`}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-2">
              <button
                onClick={() => setShowPendingChanges(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleReviewPendingChanges}
                disabled={updating || Object.keys(changeDecisions).length === 0}
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                {updating ? 'Applying...' : 'Apply Decisions'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Delete Profile</h2>
            </div>
            <div className="px-6 py-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
                <p className="text-sm text-red-900 dark:text-red-200 font-bold">
                  This will permanently delete all profile data. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={updating}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {updating ? 'Deleting...' : 'Delete Profile'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Regenerate Confirmation Modal */}
      {showRegenerateConfirm && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Regenerate Profile</h2>
            </div>
            <div className="px-6 py-4">
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
                <p className="text-sm text-orange-900 dark:text-orange-200 mb-2">
                  This will delete your current profile and create a new one from scratch using all available conversations and journal entries.
                </p>
                <p className="text-sm text-orange-900 dark:text-orange-200 font-bold mb-2">
                  All manual edits will be lost.
                </p>
                <p className="text-sm text-orange-900 dark:text-orange-200 italic">
                  Tip: If you only want to incorporate recent changes, click "Update Profile" in the menu instead.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-2">
              <button
                onClick={() => setShowRegenerateConfirm(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerate}
                disabled={updating}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
              >
                {updating ? 'Regenerating...' : 'Regenerate Profile'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Regenerating Overlay */}
      {regenerating && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center max-w-sm mx-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Regenerating Profile</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Analyzing your conversations and journal entries...
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
              This may take a moment
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Profile;
