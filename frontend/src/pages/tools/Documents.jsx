import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSessionContext } from '../../contexts/SessionContext';
import { documentAPI } from '../../services/api';
import { isToday, formatDateShort, formatLocalDate } from '../../utils/dateUtils';
import { isAbortError } from '../../utils/requestUtils';
import SourceTag from '../../components/SourceTag';

// Presigned-URL endpoints are rate-limited at 30/min, so thumbnails are fetched
// in small concurrent batches rather than one request per document at once.
const PREVIEW_URL_CONCURRENCY = 5;

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
  { value: 'identification', label: 'Identification', color: 'amber' },
  { value: 'correspondence', label: 'Correspondence', color: 'violet' },
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
  const { activeSessionId: sessionId, activeSession, user, loading: sessionLoading } = useSessionContext();

  // Check if session has collaborators for source tag display
  const hasCollaborators = activeSession?.collaborators?.length > 0;
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
  const [editedCategories, setEditedCategories] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const dateRefs = useRef({});
  const [showSidebar, setShowSidebar] = useState(false);
  const searchInputRef = useRef(null);
  const isSearchFocused = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const fileInputRef = useRef(null);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const abortControllerRef = useRef(null);
  const uploadCancelledRef = useRef(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { files, duplicates }
  // Mirrors sessionId so an in-flight load can verify its response still belongs
  // to the care session on screen before touching state
  const activeSessionIdRef = useRef(sessionId);
  const loadAbortRef = useRef(null);

  useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  // Preview URLs are keyed by document id and now fill in incrementally, so they
  // are only reset on a care session change - clearing them per filter change
  // would blank out thumbnails that are about to be re-fetched anyway
  useEffect(() => {
    setImageUrls({});
    setThumbnailUrls({});
  }, [sessionId]);

  // Restore focus to search input if it was focused before re-render
  useEffect(() => {
    if (isSearchFocused.current && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [documents]);

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
    // Drop the previous load so a slow response can't render under a different
    // care session (or after this page unmounts)
    return () => loadAbortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, selectedCategory, debouncedSearchQuery]);

  // Fetch presigned preview URLs in bounded batches, publishing each batch as it
  // resolves so the list paints before every URL is back. Returns the number of
  // requests that failed so the caller can tell the user.
  const loadPreviewUrlsInBatches = async (docs, sessionIdForLoad) => {
    const jobs = docs.reduce((acc, doc) => {
      if (doc.content_type?.includes('image')) {
        acc.push({ id: doc.id, kind: 'image' });
      } else if (doc.content_type === 'application/pdf') {
        acc.push({ id: doc.id, kind: 'pdf' });
      }
      return acc;
    }, []);

    let failures = 0;

    for (let i = 0; i < jobs.length; i += PREVIEW_URL_CONCURRENCY) {
      if (sessionIdForLoad !== activeSessionIdRef.current) return failures;

      const batch = jobs.slice(i, i + PREVIEW_URL_CONCURRENCY);
      const results = await Promise.all(batch.map(async (job) => {
        try {
          const response = job.kind === 'image'
            ? await documentAPI.getDownloadUrl(job.id)
            : await documentAPI.getThumbnailUrl(job.id);
          return {
            ...job,
            url: job.kind === 'image'
              ? response.data.download_url
              : response.data.thumbnail_url
          };
        } catch {
          // Counted, then surfaced once for the whole load rather than per file
          failures++;
          return null;
        }
      }));

      if (sessionIdForLoad !== activeSessionIdRef.current) return failures;

      const imageBatch = {};
      const thumbBatch = {};
      results.forEach((result) => {
        if (!result) return;
        if (result.kind === 'image') {
          imageBatch[result.id] = result.url;
        } else {
          thumbBatch[result.id] = result.url;
        }
      });

      if (Object.keys(imageBatch).length > 0) {
        setImageUrls(prev => ({ ...prev, ...imageBatch }));
      }
      if (Object.keys(thumbBatch).length > 0) {
        setThumbnailUrls(prev => ({ ...prev, ...thumbBatch }));
      }
    }

    return failures;
  };

  const loadDocuments = async () => {
    // Use different loading states for initial load vs search/filter
    if (!hasLoadedRef.current) {
      setLoading(true);
    } else {
      setSearching(true);
    }
    setError(null);

    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const sessionIdForLoad = sessionId;

    try {
      const response = await documentAPI.getSessionDocuments(
        sessionIdForLoad,
        selectedCategory === 'all' ? null : selectedCategory,
        debouncedSearchQuery || null,
        { signal: controller.signal }
      );
      if (sessionIdForLoad !== activeSessionIdRef.current) return;
      // Handle paginated response { documents: [...], has_more, total }
      const docs = response.data.documents || response.data;
      setDocuments(docs);
      hasLoadedRef.current = true;

      // Paint the list now - previews stream in behind it rather than holding
      // the whole page on a spinner until every presigned URL is back
      setLoading(false);
      setSearching(false);

      const failures = await loadPreviewUrlsInBatches(docs, sessionIdForLoad);
      if (failures > 0 && sessionIdForLoad === activeSessionIdRef.current) {
        setError(`${failures} preview${failures === 1 ? '' : 's'} could not be loaded. Reload the page to try again.`);
      }
    } catch (err) {
      if (isAbortError(err)) return;
      if (sessionIdForLoad !== activeSessionIdRef.current) return;
      setError(err.response?.data?.detail || 'Failed to load documents. Please try again.');
    } finally {
      // Only the most recent load owns the spinner - a superseded one must not
      // clear it out from under the load that replaced it
      if (loadAbortRef.current === controller) {
        setLoading(false);
        setSearching(false);
      }
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

  // Group dates by year for year separators
  const datesByYear = dates.reduce((acc, date) => {
    const year = new Date(date).getFullYear().toString();
    if (!acc[year]) acc[year] = [];
    acc[year].push(date);
    return acc;
  }, {});
  const sortedYears = Object.keys(datesByYear).sort((a, b) => b - a);

  const handleDateClick = (date) => {
    setSelectedDate(date);
    const element = dateRefs.current[date];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleDownload = async (doc) => {
    try {
      const response = await documentAPI.getDownloadUrl(doc.id);
      const url = response.data.download_url;
      // window.open() after an await is outside the user-gesture window and gets
      // blocked silently in Safari/Firefox - use a synthetic anchor instead
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to download document. Please try again.');
    }
  };

  const handleDelete = (document) => {
    setDocumentToDelete(document);
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;

    try {
      await documentAPI.delete(documentToDelete.id);
      setDocumentToDelete(null);
      loadDocuments();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete document. Please try again.');
      setDocumentToDelete(null);
    }
  };

  const toggleDescription = (documentId) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [documentId]: !prev[documentId]
    }));
  };

  const handleEditDescription = (documentId, currentDescription, currentCategory) => {
    setEditingDescription(prev => ({ ...prev, [documentId]: true }));
    setEditedDescriptions(prev => ({ ...prev, [documentId]: currentDescription || '' }));
    setEditedCategories(prev => ({ ...prev, [documentId]: currentCategory || 'other' }));
  };

  const handleCancelEditDescription = (documentId) => {
    setEditingDescription(prev => ({ ...prev, [documentId]: false }));
    setEditedDescriptions(prev => ({ ...prev, [documentId]: '' }));
    setEditedCategories(prev => ({ ...prev, [documentId]: '' }));
  };

  const handleSaveDescription = async (documentId) => {
    try {
      await documentAPI.update(documentId, editedDescriptions[documentId], editedCategories[documentId]);
      setEditingDescription(prev => ({ ...prev, [documentId]: false }));
      loadDocuments(); // Reload to get updated data
    } catch (err) {
      console.error('Error updating document:', err);
      setError('Failed to update document');
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

  const cancelUpload = () => {
    uploadCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'text/plain'];
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.txt'];
    const maxSize = 30 * 1024 * 1024; // 30MB per file

    // Validate all files first
    const invalidFiles = [];
    const oversizedFiles = [];

    files.forEach(file => {
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
        invalidFiles.push(file.name);
      }
      if (file.size > maxSize) {
        oversizedFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      setError(`Invalid file type(s): ${invalidFiles.join(', ')}. Please upload PDF, image (PNG, JPG), or text files only.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (oversizedFiles.length > 0) {
      setError(`File(s) exceed 30MB limit: ${oversizedFiles.join(', ')}. Each file must be 30MB or less.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Check for duplicate filenames before uploading
    try {
      const response = await documentAPI.checkDuplicate(sessionId, files.map(f => f.name));
      if (response.data.duplicates.length > 0) {
        setDuplicateWarning({ files, duplicates: response.data.duplicates });
        return;
      }
    } catch (err) {
      // If check fails, proceed with upload silently
      console.error('Duplicate check failed:', err);
    }

    await processFileUpload(files);
  };

  const processFileUpload = async (files) => {
    setUploading(true);
    setError(null);
    uploadCancelledRef.current = false;

    // Initialize progress for each file
    const initialProgress = files.map((file, index) => ({
      id: index,
      filename: file.name,
      status: 'pending',
      progress: 0,
      message: 'Waiting...'
    }));
    setUploadProgress(initialProgress);

    let successCount = 0;
    let failCount = 0;

    // Upload files sequentially to avoid overwhelming the backend
    for (let i = 0; i < files.length; i++) {
      // Check if upload was cancelled
      if (uploadCancelledRef.current) {
        // Mark remaining files as cancelled
        setUploadProgress(prev => prev.map((p, idx) =>
          idx >= i && p.status === 'pending' ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
        ));
        break;
      }

      const file = files[i];

      // Create new AbortController for this upload
      abortControllerRef.current = new AbortController();

      try {
        // Update status to uploading
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'uploading', message: 'Uploading...' } : p
        ));

        const formData = new FormData();
        formData.append('file', file);

        // Update status to processing
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, message: 'Processing...' } : p
        ));

        // Get user's local date in YYYY-MM-DD format
        const today = new Date();
        const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const response = await documentAPI.upload(formData, sessionId, false, userDate, {
          signal: abortControllerRef.current.signal
        });

        // Check if cancelled while upload was in progress
        // The upload completed on the backend, so we need to clean up
        if (uploadCancelledRef.current) {
          // Delete the document that was just created
          if (response?.data?.id) {
            setUploadProgress(prev => prev.map((p, idx) =>
              idx === i ? { ...p, status: 'cancelled', message: 'Cleaning up...' } : p
            ));
            try {
              await documentAPI.delete(response.data.id);
            } catch (deleteErr) {
              console.error('Failed to delete cancelled document:', deleteErr);
            }
          }
          setUploadProgress(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
          ));
          // Mark remaining files as cancelled
          setUploadProgress(prev => prev.map((p, idx) =>
            idx > i && p.status === 'pending' ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
          ));
          break;
        }

        // Update status to success
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'success', progress: 100, message: 'Complete' } : p
        ));

        successCount++;
      } catch (err) {
        // Check if this was a cancellation (axios uses CanceledError with code ERR_CANCELED)
        const isCancelled = err.name === 'CanceledError' ||
                           err.name === 'AbortError' ||
                           err.code === 'ERR_CANCELED' ||
                           uploadCancelledRef.current;
        if (isCancelled) {
          // The backend may have finished processing before the abort took effect
          // Poll for the document and delete it when found
          setUploadProgress(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'cancelled', message: 'Cleaning up...' } : p
          ));
          try {
            // Estimate max processing time based on file size
            // Base: 10s for small files + ~2s per MB for OCR/extraction, max 120s
            const fileSizeMB = file.size / (1024 * 1024);
            const maxWaitMs = Math.min(10000 + fileSizeMB * 2000, 120000);
            const pollIntervalMs = 2000; // Poll every 2 seconds
            const startTime = Date.now();

            // Poll until we find the document or timeout
            while (Date.now() - startTime < maxWaitMs) {
              // Check if user started a new upload (cancel flag would be cleared)
              if (!uploadCancelledRef.current) break;

              await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

              // Fetch recent documents and find one matching this file
              const listResponse = await documentAPI.getSessionDocuments(sessionId);
              const docs = listResponse.data.documents || listResponse.data;
              const recentDoc = docs.find(d =>
                d.filename === file.name &&
                new Date(d.uploaded_at + 'Z') > new Date(Date.now() - 300000) // Uploaded in last 5 minutes
              );

              if (recentDoc) {
                await documentAPI.delete(recentDoc.id);
                break; // Successfully deleted
              }
            }
          } catch (cleanupErr) {
            console.error('Failed to clean up cancelled upload:', cleanupErr);
          }

          setUploadProgress(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
          ));
          // Mark remaining files as cancelled
          setUploadProgress(prev => prev.map((p, idx) =>
            idx > i && p.status === 'pending' ? { ...p, status: 'cancelled', message: 'Cancelled' } : p
          ));
          break;
        }

        console.error(`Error uploading ${file.name}:`, err);
        const errorMessage = err.response?.data?.detail || 'Upload failed';

        // Update status to error
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'error', message: errorMessage } : p
        ));

        failCount++;
      }
    }

    // Clear the abort controller
    abortControllerRef.current = null;

    // Reload documents to show the new ones (only if not cancelled)
    if (!uploadCancelledRef.current) {
      await loadDocuments();
    } else if (successCount > 0) {
      // If some files uploaded before cancel, still reload
      await loadDocuments();
    }

    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Show summary message
    if (uploadCancelledRef.current) {
      if (successCount > 0) {
        setUploadProgress(prev => [
          ...prev.filter(p => p.id !== 'summary'),
          { id: 'summary', status: 'warning', message: `Upload cancelled. ${successCount} document${successCount > 1 ? 's' : ''} uploaded before cancellation.` }
        ]);
      } else {
        setUploadProgress(prev => [
          ...prev.filter(p => p.id !== 'summary'),
          { id: 'summary', status: 'info', message: 'Upload cancelled.' }
        ]);
      }
    } else if (successCount > 0 && failCount === 0) {
      setUploadProgress(prev => [
        ...prev,
        { id: 'summary', status: 'info', message: `Successfully uploaded ${successCount} document${successCount > 1 ? 's' : ''}. Journal entries have been created.` }
      ]);
    } else if (successCount > 0 && failCount > 0) {
      setUploadProgress(prev => [
        ...prev,
        { id: 'summary', status: 'warning', message: `Uploaded ${successCount} document${successCount > 1 ? 's' : ''}, ${failCount} failed. Journal entries created for successful uploads.` }
      ]);
    } else if (failCount > 0) {
      setError(`Failed to upload ${failCount} document${failCount > 1 ? 's' : ''}.`);
    }

    // Clear progress and error after 5 seconds
    setTimeout(() => {
      setUploadProgress([]);
      setUploading(false);
      setError(null);
    }, 5000);
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
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      <div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Document Manager
              </h1>
              <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Upload and organize documents with AI categorization and summaries
              </p>
            </div>

            {/* Upload button */}
            <div className="text-right flex-shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                id="document-file-upload"
                multiple
              />
              <label
                htmlFor="document-file-upload"
                className={`btn-primary inline-flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Upload documents (PDF, PNG, JPG, TXT) - Max 30MB each"
              >
                {uploading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="hidden sm:inline">Uploading...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="hidden sm:inline">Upload Documents</span>
                    <span className="sm:hidden">Upload</span>
                  </>
                )}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 hidden sm:flex sm:items-center sm:justify-end sm:gap-1">
                30MB per document
                <span className="relative group inline-flex">
                  <svg
                    className="w-4 h-4 text-gray-400 dark:text-gray-500 cursor-help"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="absolute top-full right-0 mt-1 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded shadow-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Limited by AI model file size limits
                  </span>
                </span>
              </p>
            </div>
          </div>

          {/* Important Banner */}
          <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-600 p-4 rounded-r-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">Important</h3>
                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                  AI-generated descriptions may contain errors. Please review for accuracy.
                </p>
              </div>
            </div>
          </div>

          {/* Upload progress */}
          {uploadProgress.length > 0 && (
            <div className="mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Upload Progress
                  </h3>
                </div>
                {uploading && (
                  <button
                    onClick={cancelUpload}
                    className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    title="Cancel upload"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {uploadProgress.map((item) => {
                if (item.id === 'summary') {
                  const bgColor = item.status === 'info' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' :
                                  item.status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300' :
                                  'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300';
                  return (
                    <div key={item.id} className={`border px-3 py-2 rounded ${bgColor}`}>
                      {item.message}
                    </div>
                  );
                }

                const statusIcon = {
                  pending: (
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  uploading: (
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ),
                  success: (
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ),
                  error: (
                    <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ),
                  cancelled: (
                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  )
                };

                const statusColor = {
                  pending: 'text-gray-600 dark:text-gray-400',
                  uploading: 'text-blue-700 dark:text-blue-300',
                  success: 'text-green-700 dark:text-green-300',
                  error: 'text-red-700 dark:text-red-300',
                  cancelled: 'text-gray-500 dark:text-gray-400'
                };

                return (
                  <div key={item.id} className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-shrink-0">
                        {statusIcon[item.status]}
                      </div>
                      <span className={`text-sm font-medium ${statusColor[item.status]} flex-1 truncate min-w-0`} title={item.filename}>
                        {item.filename}
                      </span>
                      <span className={`text-xs ${statusColor[item.status]} flex-shrink-0 whitespace-nowrap`}>
                        {item.message}
                      </span>
                    </div>
                    {item.status === 'uploading' && (
                      <div className="ml-6 mr-6 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300 animate-pulse" style={{ width: '70%' }}></div>
                      </div>
                    )}
                    {item.status === 'success' && (
                      <div className="ml-6 mr-6 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-green-600 dark:bg-green-400 h-1.5 rounded-full transition-all duration-300" style={{ width: '100%' }}></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1"
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
              <label htmlFor="category-filter" className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
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
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {documents.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No documents found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {searchQuery || selectedCategory !== 'all'
                  ? 'Try adjusting your filters or search term'
                  : 'Upload documents using the button above or attach them in conversations'
                }
              </p>
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-4 lg:gap-6">
              {/* Mobile: Date filter button */}
              <div className="lg:hidden mb-4">
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Jump to Date</span>
                  <svg className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${showSidebar ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Sidebar: Date navigation */}
              <div className={`lg:col-span-1 ${showSidebar ? 'block mb-4' : 'hidden lg:block'}`}>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm lg:sticky lg:top-4">
                  <div className="p-3 md:p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">Dates</h2>
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-64 lg:max-h-[calc(100vh-22rem)] overflow-y-auto">
                    {sortedYears.map((year) => (
                      <div key={year}>
                        {/* Year separator - only show if multiple years exist */}
                        {sortedYears.length > 1 && (
                          <div className="sticky top-0 bg-gray-100 dark:bg-gray-700 px-3 py-2 border-b border-gray-200 dark:border-gray-600">
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                              {year}
                            </span>
                          </div>
                        )}
                        {datesByYear[year].map((date) => (
                          <button
                            key={date}
                            onClick={() => {
                              handleDateClick(date);
                              setShowSidebar(false); // Close sidebar on mobile after selection
                            }}
                            className={`w-full text-left p-3 md:p-4 transition hover:bg-gray-50 dark:hover:bg-gray-700 ${
                              selectedDate === date ? 'bg-primary-50 dark:bg-primary-900/30 border-l-4 border-primary-600' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs md:text-sm font-medium ${
                                isToday(date) ? 'text-primary-700 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'
                              }`}>
                                {isToday(date) ? 'Today' : formatDateShort(date)}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {groupedDocuments[date].length}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(date).toLocaleDateString('en-US', { weekday: 'long' })}
                            </div>
                          </button>
                        ))}
                      </div>
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
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6 scroll-mt-4"
                  >
                    {/* Date Header */}
                    <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                      <svg className="w-4 h-4 md:w-5 md:h-5 mr-2 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {date}
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-normal">
                        ({groupedDocuments[date].length} document{groupedDocuments[date].length !== 1 ? 's' : ''})
                      </span>
                    </h2>

                    {/* Documents Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {groupedDocuments[date].map((doc) => {
                      const categoryColor = getCategoryColor(doc.category);
                      const categoryLabel = getCategoryLabel(doc.category);
                      const badgeClasses = {
                        gray: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
                        blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300',
                        purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300',
                        green: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300',
                        orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300',
                        red: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300',
                        indigo: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300',
                        cyan: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-300',
                        pink: 'bg-pink-100 dark:bg-pink-900/50 text-pink-800 dark:text-pink-300',
                        yellow: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300',
                        teal: 'bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300',
                        lime: 'bg-lime-100 dark:bg-lime-900/50 text-lime-800 dark:text-lime-300',
                        amber: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300',
                        violet: 'bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-300',
                      };

                      return (
                        <div key={doc.id} className="card hover:shadow-lg transition-shadow">
                          {/* Category Badge and Edit Button */}
                          <div className="mb-2 flex items-center justify-between">
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${badgeClasses[categoryColor]}`}>
                              {categoryLabel}
                            </span>
                            <button
                              onClick={() => handleEditDescription(doc.id, doc.ai_description, doc.category)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              title="Edit document"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>

                          {/* File Preview/Icon */}
                          <div className="flex items-center justify-center py-4">
                            {doc.content_type?.includes('image') && imageUrls[doc.id] ? (
                              <div className="w-full h-48 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                                <img
                                  src={imageUrls[doc.id]}
                                  alt={doc.filename}
                                  className="max-w-full max-h-full object-contain"
                                />
                              </div>
                            ) : doc.content_type === 'application/pdf' && thumbnailUrls[doc.id] ? (
                              <div className="w-full h-48 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
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
                          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate" title={doc.filename}>
                              {doc.filename}
                            </h3>

                            {/* AI Description */}
                            {(doc.ai_description || editingDescription[doc.id]) && (
                              <div className="mt-2">
                                {editingDescription[doc.id] ? (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                      <select
                                        value={editedCategories[doc.id] || 'other'}
                                        onChange={(e) => setEditedCategories(prev => ({ ...prev, [doc.id]: e.target.value }))}
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                      >
                                        {CATEGORIES.filter(cat => cat.value !== 'all').map((cat) => (
                                          <option key={cat.value} value={cat.value}>
                                            {cat.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                      <textarea
                                        value={editedDescriptions[doc.id] || ''}
                                        onChange={(e) => setEditedDescriptions(prev => ({ ...prev, [doc.id]: e.target.value }))}
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows="3"
                                        placeholder="Enter description..."
                                      />
                                    </div>
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => handleSaveDescription(doc.id)}
                                        className="px-2 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => handleCancelEditDescription(doc.id)}
                                        className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <p className={`text-xs text-gray-600 dark:text-gray-400 font-medium ${!expandedDescriptions[doc.id] ? 'line-clamp-2' : ''}`}>
                                      {doc.ai_description}
                                    </p>
                                    {doc.ai_description && doc.ai_description.length > 60 && (
                                      <button
                                        onClick={() => toggleDescription(doc.id)}
                                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mt-1"
                                      >
                                        {expandedDescriptions[doc.id] ? 'Show less' : 'Show more'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-1.5 mt-2">
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {(() => {
                                  const timestamp = doc.uploaded_at.endsWith('Z') ? doc.uploaded_at : doc.uploaded_at + 'Z';
                                  return new Date(timestamp).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  });
                                })()}
                              </p>
                              {/* Source tag for collaborative sessions - show editor if edited, otherwise uploader */}
                              {hasCollaborators && (
                                <SourceTag
                                  sourceTag={doc.last_edited_by || doc.uploaded_by}
                                  currentUserId={user?.id}
                                  variant="small"
                                />
                              )}
                            </div>

                            {/* Actions */}
                            <div className="mt-4 flex gap-1.5">
                              <button
                                onClick={() => handlePreview(doc)}
                                className="flex-1 px-2 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 rounded-md transition-colors"
                              >
                                Preview
                              </button>
                              <button
                                onClick={() => handleDownload(doc)}
                                className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                              >
                                Download
                              </button>
                              <button
                                onClick={() => handleDelete(doc)}
                                className="px-2 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md transition-colors flex items-center justify-center"
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

        {/* Preview Modal - rendered via portal to escape stacking context */}
        {previewDoc && createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              {/* Background overlay */}
              <div
                className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
                onClick={closePreview}
              ></div>

              {/* Modal panel */}
              <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
                {/* Header */}
                <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        {previewDoc.filename}
                      </h3>
                      {previewDoc.ai_description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{previewDoc.ai_description}</p>
                      )}
                    </div>
                    <button
                      onClick={closePreview}
                      className="ml-3 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                    >
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Preview Content */}
                  <div className="mt-4">
                    {previewDoc.content_type?.includes('image') && previewUrl ? (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-center justify-center">
                        <img
                          src={previewUrl}
                          alt={previewDoc.filename}
                          className="max-w-full max-h-96 object-contain"
                        />
                      </div>
                    ) : previewDoc.content_type === 'application/pdf' && previewUrl ? (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden" style={{ height: '600px' }}>
                        <iframe
                          src={previewUrl}
                          className="w-full h-full"
                          title={previewDoc.filename}
                        />
                      </div>
                    ) : previewDoc.extracted_text ? (
                      <>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Extracted Text:</h4>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                          <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                            {previewDoc.extracted_text}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400">
                        <p>No preview available for this document.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    onClick={() => handleDownload(previewDoc)}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Download Original
                  </button>
                  <button
                    onClick={closePreview}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 sm:mt-0 sm:w-auto sm:text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Duplicate Warning Modal */}
      {duplicateWarning && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Possible Duplicate</h2>
                <button
                  onClick={() => {
                    setDuplicateWarning(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {duplicateWarning.duplicates.length === 1
                      ? 'A document with the same name already exists in this care session:'
                      : 'Documents with the same names already exist in this care session:'}
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded px-4 py-3">
                <ul className="text-sm text-yellow-800 dark:text-yellow-300 space-y-1.5">
                  {duplicateWarning.duplicates.map((dup) => (
                    <li key={dup.id}>
                      <strong>{dup.filename}</strong>
                      <span className="text-yellow-600 dark:text-yellow-400 ml-1">
                        — uploaded {(() => {
                          const timestamp = dup.uploaded_at.endsWith('Z') ? dup.uploaded_at : dup.uploaded_at + 'Z';
                          return new Date(timestamp).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          });
                        })()}
                        {dup.category && ` (${getCategoryLabel(dup.category)})`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setDuplicateWarning(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const files = duplicateWarning.files;
                    setDuplicateWarning(null);
                    processFileUpload(files);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 font-medium"
                >
                  Upload Anyway
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Document Delete Confirmation Modal - rendered via portal to escape stacking context */}
      {documentToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Delete Document</h2>
                <button
                  onClick={() => setDocumentToDelete(null)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Delete "{documentToDelete.filename}"?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This document will be permanently removed from your care session
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-4 py-3">
                <p className="text-sm text-orange-900 dark:text-orange-200 mb-2 font-medium">
                  Document Details:
                </p>
                <ul className="text-sm text-orange-800 dark:text-orange-300 space-y-1.5">
                  <li>• <strong>Category:</strong> {getCategoryLabel(documentToDelete.category)}</li>
                  <li>• <strong>Uploaded:</strong> {formatLocalDate(documentToDelete.uploaded_at)}</li>
                  {documentToDelete.ai_description && (
                    <li>• <strong>Description:</strong> {documentToDelete.ai_description}</li>
                  )}
                </ul>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-4 py-3">
                <p className="text-sm text-red-900 dark:text-red-200 font-bold">
                  This action cannot be undone. The document will be permanently deleted.
                </p>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setDocumentToDelete(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 font-medium"
                >
                  Delete Document
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Documents;
