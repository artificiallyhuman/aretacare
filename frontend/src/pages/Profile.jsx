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

const Profile = () => {
  const { activeSessionId: sessionId } = useSessionContext();
  const [profile, setProfile] = useState(null);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
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

  // Handle edit mode
  const handleEditClick = () => {
    setIsEditing(true);
    setEditedData(JSON.parse(JSON.stringify(profile.profile_data)));
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedData(null);
  };

  const handleSaveEdit = async () => {
    try {
      setUpdating(true);
      const response = await profileAPI.save(sessionId, editedData);
      setProfile(response.data);
      setIsEditing(false);
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
      text += '## Medications\n';
      data.medications.forEach(m => {
        text += `- **${m.name || 'Unknown'}**`;
        if (m.dose) text += ` ${m.dose}`;
        if (m.frequency) text += `, ${m.frequency}`;
        if (m.description) text += ` - ${m.description}`;
        text += '\n';
      });
      text += '\n';
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

  // Render section header with expand/collapse
  const SectionHeader = ({ title, section, count }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition"
    >
      <div className="flex items-center space-x-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        {count !== undefined && (
          <span className="text-sm text-gray-500 dark:text-gray-400">({count})</span>
        )}
      </div>
      <svg
        className={`w-5 h-5 text-gray-500 transition-transform ${expandedSections[section] ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

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

  const profileData = isEditing ? editedData : profile?.profile_data;
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Health Profile</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              A living summary of patient, caregiver, provider, and care details. You stay in control at all times, with full ability to edit, copy, download, or reset it, and nothing is changed without your approval.
            </p>
            {profile?.last_ai_update && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                Last updated: {formatDate(profile.last_ai_update)}
              </p>
            )}
          </div>
        </div>
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
        {!isEditing ? (
          <>
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

            {/* Desktop: single row | Mobile: two rows */}
            <div className="hidden sm:flex sm:flex-wrap sm:gap-2">
              <button
                onClick={handleEditClick}
                disabled={isEmpty || updating}
                className="btn-secondary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Edit</span>
              </button>
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
            <div className="grid grid-cols-5 gap-2 sm:hidden">
              <button
                onClick={handleEditClick}
                disabled={isEmpty || updating}
                className="btn-secondary flex flex-col items-center justify-center py-2"
              >
                <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-xs">Edit</span>
              </button>
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
          </>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancelEdit}
              className="flex-1 sm:flex-none btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={updating}
              className="flex-1 sm:flex-none btn-primary"
            >
              {updating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Empty State */}
      {isEmpty && !isEditing && (
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
        <div className="space-y-4">
          {/* Expand/Collapse All */}
          <div className="flex justify-end space-x-2 text-sm">
            <button
              onClick={expandAll}
              disabled={allExpanded}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Expand all
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              onClick={collapseAll}
              disabled={allCollapsed}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Collapse all
            </button>
          </div>

          {/* Patient Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <SectionHeader title="Patient Information" section="patient" />
            {expandedSections.patient && (
              <div className="p-4">
                {isEditing ? (
                  <>
                    <EditableField label="Full Name" path="patient.full_name" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Preferred Name" path="patient.preferred_name" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Date of Birth" path="patient.date_of_birth" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Age" path="patient.age" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Contact Information" path="patient.contact_info" editedData={editedData} setEditedData={setEditedData} />
                    <EditableField label="Location" path="patient.location" editedData={editedData} setEditedData={setEditedData} />
                  </>
                ) : profileData?.patient ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profileData.patient.full_name && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Full Name</span>
                        <p className="text-gray-900 dark:text-white font-medium">{profileData.patient.full_name}</p>
                      </div>
                    )}
                    {profileData.patient.preferred_name && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Preferred Name</span>
                        <p className="text-gray-900 dark:text-white font-medium">{profileData.patient.preferred_name}</p>
                      </div>
                    )}
                    {profileData.patient.date_of_birth && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Date of Birth</span>
                        <p className="text-gray-900 dark:text-white">{profileData.patient.date_of_birth}</p>
                      </div>
                    )}
                    {profileData.patient.age && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Age</span>
                        <p className="text-gray-900 dark:text-white">{profileData.patient.age}</p>
                      </div>
                    )}
                    {profileData.patient.contact_info && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Contact</span>
                        <p className="text-gray-900 dark:text-white">{profileData.patient.contact_info}</p>
                      </div>
                    )}
                    {profileData.patient.location && (
                      <div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Location</span>
                        <p className="text-gray-900 dark:text-white">{profileData.patient.location}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No patient information yet</p>
                )}
              </div>
            )}
          </div>

          {/* Caregivers */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <SectionHeader title="Caregivers" section="caregivers" count={profileData?.caregivers?.length || 0} />
            {expandedSections.caregivers && (
              <div className="p-4">
                {isEditing ? (
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
                  <div className="space-y-4">
                    {profileData.caregivers.map((cg, index) => (
                      <div key={cg.id || index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {cg.name || 'Unknown'}
                          {cg.relationship && <span className="text-gray-500 dark:text-gray-400 ml-2">({cg.relationship})</span>}
                        </div>
                        {cg.role && <p className="text-sm text-gray-600 dark:text-gray-300">{cg.role}</p>}
                        {cg.contact_info && <p className="text-sm text-gray-500 dark:text-gray-400">{cg.contact_info}</p>}
                        {cg.location && <p className="text-sm text-gray-500 dark:text-gray-400">{cg.location}</p>}
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
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <SectionHeader title="Healthcare Providers" section="providers" count={profileData?.providers?.length || 0} />
            {expandedSections.providers && (
              <div className="p-4">
                {isEditing ? (
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
                  <div className="space-y-4">
                    {profileData.providers.map((p, index) => (
                      <div key={p.id || index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {p.name || 'Unknown'}
                          {p.specialty && <span className="text-primary-600 dark:text-primary-400 ml-2">{p.specialty}</span>}
                        </div>
                        {p.organization && <p className="text-sm text-gray-600 dark:text-gray-300">{p.organization}</p>}
                        {p.contact_info && <p className="text-sm text-gray-500 dark:text-gray-400">{p.contact_info}</p>}
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
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <SectionHeader title="Conditions & Diagnoses" section="conditions" count={profileData?.conditions?.length || 0} />
            {expandedSections.conditions && (
              <div className="p-4">
                {isEditing ? (
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
                      .map((c, index) => (
                      <div key={c.id || index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900 dark:text-white">{c.clinical_term || 'Unknown'}</div>
                          {c.status && (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              c.status === 'active' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                              c.status === 'resolved' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                              'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                            }`}>
                              {c.status.toUpperCase()}
                            </span>
                          )}
                        </div>
                        {c.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{c.description}</p>}
                        {c.diagnosis_date && <p className="text-sm text-gray-500 dark:text-gray-400">Diagnosed: {c.diagnosis_date}</p>}
                        {c.details && <p className="text-sm text-gray-500 dark:text-gray-400">{c.details}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No conditions recorded yet</p>
                )}
              </div>
            )}
          </div>

          {/* Medications */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <SectionHeader title="Medications" section="medications" count={profileData?.medications?.length || 0} />
            {expandedSections.medications && (
              <div className="p-4">
                {isEditing ? (
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
                    <AddItemButton onClick={() => addListItem('medications', { name: '', dose: '', frequency: '', prescriber: '', start_date: '', description: '', notes: '' })} label="Add medication" />
                  </>
                ) : profileData?.medications?.length > 0 ? (
                  <div className="space-y-4">
                    {profileData.medications.map((m, index) => (
                      <div key={m.id || index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {m.name || 'Unknown'}
                          {m.dose && <span className="text-gray-600 dark:text-gray-300 ml-2">{m.dose}</span>}
                          {m.frequency && <span className="text-gray-500 dark:text-gray-400 ml-2">({m.frequency})</span>}
                        </div>
                        {m.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{m.description}</p>}
                        {m.prescriber && <p className="text-sm text-gray-500 dark:text-gray-400">Prescribed by: {m.prescriber}</p>}
                        {m.start_date && <p className="text-sm text-gray-500 dark:text-gray-400">Started: {m.start_date}</p>}
                        {m.notes && <p className="text-sm text-gray-500 dark:text-gray-400">{m.notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No medications recorded yet</p>
                )}
              </div>
            )}
          </div>

          {/* Events/History */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <SectionHeader title="Medical History & Events" section="events" count={profileData?.events?.length || 0} />
            {expandedSections.events && (
              <div className="p-4">
                {isEditing ? (
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
                  <div className="space-y-4">
                    {sortByDateDesc(profileData.events, 'date').map((e, index) => (
                      <div key={e.id || index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {EVENT_TYPE_LABELS[e.event_type] || e.event_type || 'Event'}
                          </div>
                          {e.date && <span className="text-sm text-gray-500 dark:text-gray-400">{e.date}</span>}
                        </div>
                        {e.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{e.description}</p>}
                        {e.details && <p className="text-sm text-gray-500 dark:text-gray-400">{e.details}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No events recorded yet</p>
                )}
              </div>
            )}
          </div>

          {/* Allergies */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <SectionHeader title="Allergies & Sensitivities" section="allergies" count={profileData?.allergies?.length || 0} />
            {expandedSections.allergies && (
              <div className="p-4">
                {isEditing ? (
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
                  <div className="space-y-4">
                    {profileData.allergies.map((a, index) => (
                      <div key={a.id || index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900 dark:text-white">{a.substance || 'Unknown'}</div>
                          {a.severity && (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              a.severity === 'severe' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                              a.severity === 'moderate' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' :
                              'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                            }`}>
                              {a.severity.toUpperCase()}
                            </span>
                          )}
                        </div>
                        {a.reaction && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Reaction: {a.reaction}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No allergies recorded yet</p>
                )}
              </div>
            )}
          </div>

          {/* Preferences */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <SectionHeader title="Preferences & Guidelines" section="preferences" />
            {expandedSections.preferences && (
              <div className="p-4 space-y-6">
                {isEditing ? (
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
                <p className="text-sm text-orange-900 dark:text-orange-200 font-bold">
                  All manual edits will be lost.
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
