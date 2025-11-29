import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSessionContext } from '../../contexts/SessionContext';
import { documentAPI } from '../../services/api';

// Document categories with labels and colors
const CATEGORIES = [
  { value: 'all', label: 'All Documents', color: 'gray' },
  { value: 'lab_results', label: 'Lab Results', color: 'blue' },
  { value: 'imaging_reports', label: 'Imaging Reports', color: 'purple' },
  { value: 'clinic_notes', label: 'Clinic Notes', color: 'green' },
  { value: 'medication_records', label: 'Medications', color: 'orange' },
  { value: 'discharge_summary', label: 'Discharge Summary', color: 'red' },
  { value: 'treatment_plan', label: 'Treatment Plan', color: 'indigo' },
  { value: 'test_results', label: 'Test Results', color: 'cyan' },
  { value: 'referral', label: 'Referrals', color: 'pink' },
  { value: 'insurance_billing', label: 'Insurance/Billing', color: 'yellow' },
  { value: 'consent_form', label: 'Consent Forms', color: 'teal' },
  { value: 'care_instructions', label: 'Care Instructions', color: 'lime' },
  { value: 'other', label: 'Other', color: 'gray' },
];

const getCategoryColor = (category) => {
  // Handle null/undefined for backward compatibility
  if (!category) return 'gray';
  const cat = CATEGORIES.find(c => c.value === category);
  return cat ? cat.color : 'gray';
};

const getCategoryLabel = (category) => {
  // Handle null/undefined for backward compatibility
  if (!category) return 'Other';
  const cat = CATEGORIES.find(c => c.value === category);
  return cat ? cat.label : 'Other';
};

const Documents = () => {
  const { activeSessionId: sessionId, loading: sessionLoading } = useSessionContext();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageUrls, setImageUrls] = useState({});
  const [thumbnailUrls, setThumbnailUrls] = useState({});
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [editingDescription, setEditingDescription] = useState({});
  const [editedDescriptions, setEditedDescriptions] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const dateRefs = useRef({});
  const [showSidebar, setShowSidebar] = useState(false);
  const searchInputRef = useRef(null);
  const isSearchFocused = useRef(false);

  // Restore focus to search input if it was focused before re-render
  useEffect(() => {
    if (isSearchFocused.current && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      searchInputRef.current.focus();
    }
  });

  // Debounce search query to avoid API calls on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (sessionId) {
      loadDocuments();
    }
  }, [sessionId, selectedCategory, debouncedSearchQuery]);

  const loadDocuments = async () => {
    // Use different loading states for initial load vs search/filter
    if (!hasLoadedRef.current) {
      setLoading(true);
    } else {
      setSearching(true);
    }
    setError(null);
    try {
      const response = await documentAPI.getSessionDocuments(
        sessionId,
        selectedCategory === 'all' ? null : selectedCategory,
        debouncedSearchQuery || null
      );
      const docs = response.data;
      setDocuments(docs);
      hasLoadedRef.current = true;

      // Load preview URLs for images and PDF thumbnails
      const urls = {};
      const thumbUrls = {};
      for (const doc of docs) {
        if (doc.content_type?.includes('image')) {
          try {
            const urlResponse = await documentAPI.getDownloadUrl(doc.id);
            urls[doc.id] = urlResponse.data.download_url;
          } catch (err) {
            console.error('Failed to load image preview:', err);
          }
        } else if (doc.content_type === 'application/pdf') {
          try {
            const thumbnailResponse = await documentAPI.getThumbnailUrl(doc.id);
            thumbUrls[doc.id] = thumbnailResponse.data.thumbnail_url;
          } catch (err) {
            console.error('Failed to load PDF thumbnail:', err);
          }
        }
      }
      setImageUrls(urls);
      setThumbnailUrls(thumbUrls);
    } catch (err) {
      setError('Failed to load documents: ' + err.message);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  // Group documents by date (parse as UTC by appending 'Z')
  const groupedDocuments = documents.reduce((groups, doc) => {
    // Ensure timestamp is parsed as UTC
    const timestamp = doc.uploaded_at.endsWith('Z') ? doc.uploaded_at : doc.uploaded_at + 'Z';
    const date = new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(doc);
    return groups;
  }, {});

  const dates = Object.keys(groupedDocuments).sort((a, b) => {
    return new Date(b) - new Date(a); // Most recent first
  });

  const handleDateClick = (date) => {
    setSelectedDate(date);
    const element = dateRefs.current[date];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const formatDateShort = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isToday = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const handleDownload = async (document) => {
    try {
      const response = await documentAPI.getDownloadUrl(document.id);
      const url = response.data.download_url;
      window.open(url, '_blank');
    } catch (err) {
      setError('Failed to download document: ' + err.message);
    }
  };

  const handleDelete = async (documentId) => {
    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await documentAPI.delete(documentId);
      loadDocuments();
    } catch (err) {
      setError('Failed to delete document: ' + err.message);
    }
  };

  const toggleDescription = (documentId) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [documentId]: !prev[documentId]
    }));
  };

  const handleEditDescription = (documentId, currentDescription) => {
    setEditingDescription(prev => ({ ...prev, [documentId]: true }));
    setEditedDescriptions(prev => ({ ...prev, [documentId]: currentDescription || '' }));
  };

  const handleCancelEditDescription = (documentId) => {
    setEditingDescription(prev => ({ ...prev, [documentId]: false }));
    setEditedDescriptions(prev => ({ ...prev, [documentId]: '' }));
  };

  const handleSaveDescription = async (documentId) => {
    try {
      await documentAPI.update(documentId, editedDescriptions[documentId]);
      setEditingDescription(prev => ({ ...prev, [documentId]: false }));
      loadDocuments(); // Reload to get updated data
    } catch (err) {
      console.error('Error updating description:', err);
      setError('Failed to update description');
    }
  };

  const handlePreview = async (document) => {
    setPreviewDoc(document);

    if (document.content_type?.includes('image')) {
      setPreviewUrl(imageUrls[document.id]);
    } else if (document.content_type === 'application/pdf') {
      try {
        const response = await documentAPI.getDownloadUrl(document.id);
        setPreviewUrl(response.data.download_url);
      } catch (err) {
        console.error('Failed to load PDF URL:', err);
        setPreviewUrl(null);
      }
    }
  };

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  const getFileIcon = (contentType) => {
    if (contentType?.includes('pdf')) {
      return (
        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    } else if (contentType?.includes('image')) {
      return (
        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    } else {
      return (
        <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
  };

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
            Documents Manager
          </h1>

          {/* Controls */}
          <div className="mb-6 space-y-3 sm:space-y-4">
            {/* Search */}
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { isSearchFocused.current = true; }}
                onBlur={() => { isSearchFocused.current = false; }}
                placeholder="Search documents by name or description..."
                className="input w-full pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label="Clear search"
                  type="button"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filter by category */}
            <div className="flex items-center gap-3">
              <label htmlFor="category-filter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
                Category:
              </label>
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input w-full sm:w-auto"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {documents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No documents found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || selectedCategory !== 'all'
                  ? 'Try adjusting your filters or search term'
                  : 'Upload documents in conversations by clicking the attachment icon'
                }
              </p>
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-4 lg:gap-6">
              {/* Mobile: Date filter button */}
              <div className="lg:hidden mb-4">
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm"
                >
                  <span className="text-sm font-medium text-gray-900">Jump to Date</span>
                  <svg className={`w-5 h-5 text-gray-500 transition-transform ${showSidebar ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Sidebar: Date navigation */}
              <div className={`lg:col-span-1 ${showSidebar ? 'block mb-4' : 'hidden lg:block'}`}>
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm lg:sticky lg:top-4">
                  <div className="p-3 md:p-4 border-b border-gray-200">
                    <h2 className="text-base md:text-lg font-semibold text-gray-900">Dates</h2>
                  </div>
                  <div className="divide-y divide-gray-200 max-h-64 lg:max-h-[calc(100vh-12rem)] overflow-y-auto">
                    {dates.map((date) => (
                      <button
                        key={date}
                        onClick={() => {
                          handleDateClick(date);
                          setShowSidebar(false); // Close sidebar on mobile after selection
                        }}
                        className={`w-full text-left p-3 md:p-4 transition hover:bg-gray-50 ${
                          selectedDate === date ? 'bg-primary-50 border-l-4 border-primary-600' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs md:text-sm font-medium ${
                            isToday(date) ? 'text-primary-700' : 'text-gray-700'
                          }`}>
                            {isToday(date) ? 'Today' : formatDateShort(date)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {groupedDocuments[date].length}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(date).toLocaleDateString('en-US', { weekday: 'long' })}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main content: Documents by date */}
              <div className="lg:col-span-3 space-y-6">
                {dates.map((date) => (
                  <div
                    key={date}
                    ref={(el) => (dateRefs.current[date] = el)}
                    className="bg-white rounded-lg border border-gray-200 p-4 md:p-6 scroll-mt-4"
                  >
                    {/* Date Header */}
                    <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <svg className="w-4 h-4 md:w-5 md:h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {date}
                      <span className="ml-2 text-xs text-gray-500 font-normal">
                        ({groupedDocuments[date].length} document{groupedDocuments[date].length !== 1 ? 's' : ''})
                      </span>
                    </h2>

                    {/* Documents Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {groupedDocuments[date].map((doc) => {
                      const categoryColor = getCategoryColor(doc.category);
                      const categoryLabel = getCategoryLabel(doc.category);
                      const badgeClasses = {
                        gray: 'bg-gray-100 text-gray-800',
                        blue: 'bg-blue-100 text-blue-800',
                        purple: 'bg-purple-100 text-purple-800',
                        green: 'bg-green-100 text-green-800',
                        orange: 'bg-orange-100 text-orange-800',
                        red: 'bg-red-100 text-red-800',
                        indigo: 'bg-indigo-100 text-indigo-800',
                        cyan: 'bg-cyan-100 text-cyan-800',
                        pink: 'bg-pink-100 text-pink-800',
                        yellow: 'bg-yellow-100 text-yellow-800',
                        teal: 'bg-teal-100 text-teal-800',
                        lime: 'bg-lime-100 text-lime-800',
                      };

                      return (
                        <div key={doc.id} className="card hover:shadow-lg transition-shadow">
                          {/* Category Badge */}
                          <div className="mb-2">
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${badgeClasses[categoryColor]}`}>
                              {categoryLabel}
                            </span>
                          </div>

                          {/* File Preview/Icon */}
                          <div className="flex items-center justify-center py-4">
                            {doc.content_type?.includes('image') && imageUrls[doc.id] ? (
                              <div className="w-full h-48 flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden">
                                <img
                                  src={imageUrls[doc.id]}
                                  alt={doc.filename}
                                  className="max-w-full max-h-full object-contain"
                                />
                              </div>
                            ) : doc.content_type === 'application/pdf' && thumbnailUrls[doc.id] ? (
                              <div className="w-full h-48 flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden">
                                <img
                                  src={thumbnailUrls[doc.id]}
                                  alt={`${doc.filename} thumbnail`}
                                  className="max-w-full max-h-full object-contain"
                                />
                              </div>
                            ) : (
                              getFileIcon(doc.content_type)
                            )}
                          </div>

                          {/* File Info */}
                          <div className="border-t border-gray-200 pt-4">
                            <h3 className="text-sm font-medium text-gray-900 truncate" title={doc.filename}>
                              {doc.filename}
                            </h3>

                            {/* AI Description */}
                            {(doc.ai_description || editingDescription[doc.id]) && (
                              <div className="mt-2">
                                {editingDescription[doc.id] ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={editedDescriptions[doc.id] || ''}
                                      onChange={(e) => setEditedDescriptions(prev => ({ ...prev, [doc.id]: e.target.value }))}
                                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                      rows="3"
                                      placeholder="Enter description..."
                                    />
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => handleSaveDescription(doc.id)}
                                        className="px-2 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => handleCancelEditDescription(doc.id)}
                                        className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="group">
                                    <div className="flex items-start gap-1">
                                      <p className={`text-xs text-gray-600 font-medium flex-1 ${!expandedDescriptions[doc.id] ? 'line-clamp-2' : ''}`}>
                                        {doc.ai_description}
                                      </p>
                                      <button
                                        onClick={() => handleEditDescription(doc.id, doc.ai_description)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 transition-opacity flex-shrink-0"
                                        title="Edit description"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                      </button>
                                    </div>
                                    {doc.ai_description && doc.ai_description.length > 60 && (
                                      <button
                                        onClick={() => toggleDescription(doc.id)}
                                        className="text-xs text-primary-600 hover:text-primary-700 mt-1"
                                      >
                                        {expandedDescriptions[doc.id] ? 'Show less' : 'Show more'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            <p className="text-xs text-gray-500 mt-2">
                              {(() => {
                                const timestamp = doc.uploaded_at.endsWith('Z') ? doc.uploaded_at : doc.uploaded_at + 'Z';
                                return new Date(timestamp).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                });
                              })()}
                            </p>

                            {/* Actions */}
                            <div className="mt-4 flex gap-1.5">
                              <button
                                onClick={() => handlePreview(doc)}
                                className="flex-1 px-2 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
                              >
                                Preview
                              </button>
                              <button
                                onClick={() => handleDownload(doc)}
                                className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                              >
                                Download
                              </button>
                              <button
                                onClick={() => handleDelete(doc.id)}
                                className="px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors flex items-center justify-center"
                                title="Delete document"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Preview Modal */}
        {previewDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={closePreview}
            ></div>

            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
              {/* Header */}
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {previewDoc.filename}
                    </h3>
                    {previewDoc.ai_description && (
                      <p className="text-sm text-gray-600 mt-1">{previewDoc.ai_description}</p>
                    )}
                  </div>
                  <button
                    onClick={closePreview}
                    className="ml-3 text-gray-400 hover:text-gray-500"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Preview Content */}
                <div className="mt-4">
                  {previewDoc.content_type?.includes('image') && previewUrl ? (
                    <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center">
                      <img
                        src={previewUrl}
                        alt={previewDoc.filename}
                        className="max-w-full max-h-96 object-contain"
                      />
                    </div>
                  ) : previewDoc.content_type === 'application/pdf' && previewUrl ? (
                    <div className="bg-gray-50 rounded-lg overflow-hidden" style={{ height: '600px' }}>
                      <iframe
                        src={previewUrl}
                        className="w-full h-full"
                        title={previewDoc.filename}
                      />
                    </div>
                  ) : previewDoc.extracted_text ? (
                    <>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Extracted Text:</h4>
                      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                          {previewDoc.extracted_text}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                      <p>No preview available for this document.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={() => handleDownload(previewDoc)}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Download Original
                </button>
                <button
                  onClick={closePreview}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
