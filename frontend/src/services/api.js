import axios from 'axios';

// Use relative URL to leverage Vite's proxy in Docker, or environment variable for production
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Error handler reference (set by NetworkProvider)
let globalErrorHandler = null;

// Set the global error handler (called from NetworkProvider)
export const setGlobalErrorHandler = (handler) => {
  globalErrorHandler = handler;
};

// Add response interceptor for global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Call global error handler if set
    if (globalErrorHandler) {
      globalErrorHandler(error);
    }
    // Still reject so component-level error handling works too
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (name, email, password, acknowledgeNotMedicalAdvice, acknowledgeBetaVersion, acknowledgeEmailCommunications) =>
    api.post('/auth/register', {
      name,
      email,
      password,
      acknowledge_not_medical_advice: acknowledgeNotMedicalAdvice,
      acknowledge_beta_version: acknowledgeBetaVersion,
      acknowledge_email_communications: acknowledgeEmailCommunications
    }),

  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  getMe: () => api.get('/auth/me'),

  updateName: (name, currentPassword) =>
    api.put('/auth/name', { name, current_password: currentPassword }),

  updateEmail: (email, currentPassword) =>
    api.put('/auth/email', { email, current_password: currentPassword }),

  updatePassword: (currentPassword, newPassword) =>
    api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }),

  deleteAccount: (password) =>
    api.delete('/auth/account', { data: { password } }),

  requestPasswordReset: (email) =>
    api.post('/auth/password-reset/request', { email }),

  resetPassword: (token, newPassword) =>
    api.post('/auth/password-reset/reset', { token, new_password: newPassword }),

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('session_id');
  },
};

// Session API
export const sessionAPI = {
  list: () => api.get('/sessions/'),
  create: (name = null) => api.post('/sessions/', { name }),
  get: (sessionId) => api.get(`/sessions/${sessionId}`),
  rename: (sessionId, name) => api.patch(`/sessions/${sessionId}/rename`, { name }),
  getStatistics: (sessionId) => api.get(`/sessions/${sessionId}/statistics`),
  delete: (sessionId) => api.delete(`/sessions/${sessionId}`),
  cleanup: (sessionId) => api.post(`/sessions/${sessionId}/cleanup`),

  // Collaboration endpoints
  checkUser: (sessionId, email) => api.post(`/sessions/${sessionId}/check-user`, { email }),
  share: (sessionId, email) => api.post(`/sessions/${sessionId}/share`, { email }),
  revokeAccess: (sessionId, userId) => api.delete(`/sessions/${sessionId}/collaborators/${userId}`),
  leave: (sessionId) => api.post(`/sessions/${sessionId}/leave`),
  transferOwnership: (sessionId, newOwnerUserId) =>
    api.post(`/sessions/${sessionId}/transfer-ownership`, { new_owner_user_id: newOwnerUserId }),

  // Invitation endpoints (for non-users)
  sendInvitation: (sessionId, email) => api.post(`/sessions/${sessionId}/send-invitation`, { email }),
  getPendingInvitations: (sessionId) => api.get(`/sessions/${sessionId}/pending-invitations`),
  cancelInvitation: (sessionId, invitationId) => api.delete(`/sessions/${sessionId}/pending-invitations/${invitationId}`),
};

// Document API
export const documentAPI = {
  upload: (formData, sessionId, skipJournalSynthesis = false, userDate = null) => {
    const params = sessionId ? `?session_id=${sessionId}` : '';
    const skipParam = skipJournalSynthesis ? `&skip_journal_synthesis=true` : `&skip_journal_synthesis=false`;
    const dateParam = userDate ? `&user_date=${userDate}` : '';
    return api.post(`/documents/upload${params}${skipParam}${dateParam}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  getSessionDocuments: (sessionId, category = null, search = null) => {
    const params = {};
    if (category) params.category = category;
    if (search) params.search = search;
    return api.get(`/documents/session/${sessionId}`, { params });
  },
  get: (documentId) => api.get(`/documents/${documentId}`),
  update: (documentId, ai_description) => api.patch(`/documents/${documentId}`, { ai_description }),
  delete: (documentId) => api.delete(`/documents/${documentId}`),
  getDownloadUrl: (documentId) => api.get(`/documents/${documentId}/download-url`),
  getThumbnailUrl: (documentId) => api.get(`/documents/${documentId}/thumbnail-url`),
};

// Conversation API (new)
export const conversationAPI = {
  sendMessage: (data) =>
    api.post('/conversation/message', null, { params: data }),
  getHistory: (sessionId, limit = 50, offset = 0) =>
    api.get(`/conversation/${sessionId}/history`, { params: { limit, offset } }),
  transcribeAudio: (audioFile, sessionId, skipJournalSynthesis = false) => {
    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('session_id', sessionId);
    formData.append('skip_journal_synthesis', skipJournalSynthesis ? 'true' : 'false');
    return api.post('/conversation/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 600000, // 10 minutes timeout for long audio files
    });
  },
};

// Journal API (new)
export const journalAPI = {
  getEntries: (sessionId, startDate = null, endDate = null) =>
    api.get(`/journal/${sessionId}`, { params: { start_date: startDate, end_date: endDate } }),
  getEntriesForDate: (sessionId, date) =>
    api.get(`/journal/${sessionId}/date/${date}`),
  createEntry: (sessionId, entryData) =>
    api.post(`/journal/${sessionId}`, entryData),
  updateEntry: (entryId, updates) =>
    api.put(`/journal/${entryId}`, updates),
  deleteEntry: (entryId) =>
    api.delete(`/journal/${entryId}`),
};

// Audio Recordings API
export const audioRecordingsAPI = {
  getRecordings: (sessionId, category = null, search = null) => {
    const params = {};
    if (category) params.category = category;
    if (search) params.search = search;
    return api.get(`/audio-recordings/${sessionId}`, { params });
  },
  getRecording: (sessionId, recordingId) =>
    api.get(`/audio-recordings/${sessionId}/${recordingId}`),
  updateRecording: (sessionId, recordingId, ai_summary) =>
    api.patch(`/audio-recordings/${sessionId}/${recordingId}`, { ai_summary }),
  deleteRecording: (sessionId, recordingId) =>
    api.delete(`/audio-recordings/${sessionId}/${recordingId}`),
  getAudioUrl: (sessionId, recordingId) =>
    api.get(`/audio-recordings/${sessionId}/${recordingId}/url`),
};

// Daily Plans API
export const dailyPlanAPI = {
  getAll: (sessionId) =>
    api.get(`/daily-plans/${sessionId}`),
  getLatest: (sessionId) =>
    api.get(`/daily-plans/${sessionId}/latest`),
  check: (sessionId) =>
    api.get(`/daily-plans/${sessionId}/check`),
  generate: (sessionId, userDate = null) => {
    const params = userDate ? { user_date: userDate } : {};
    return api.post(`/daily-plans/${sessionId}/generate`, null, { params });
  },
  update: (planId, userEditedContent) =>
    api.put(`/daily-plans/${planId}`, { user_edited_content: userEditedContent }),
  markViewed: (planId, viewed = true) =>
    api.put(`/daily-plans/${planId}/mark-viewed`, { viewed }),
  delete: (planId) =>
    api.delete(`/daily-plans/${planId}`),
};

// Tools API (new - standalone with optional journal context)
export const toolsAPI = {
  generateSummary: (medicalText) =>
    api.post('/tools/medical-summary', null, { params: { medical_text: medicalText } }),
  translateJargon: (medicalTerm, context = '', sessionId = null) =>
    api.post('/tools/jargon-translator', null, { params: { medical_term: medicalTerm, context, session_id: sessionId } }),
  getConversationCoach: (situation, sessionId = null) =>
    api.post('/tools/conversation-coach', null, { params: { situation, session_id: sessionId } }),
};

// Admin API
export const adminAPI = {
  // Check if current user is admin
  checkAdmin: () => api.get('/admin/check'),

  // Platform metrics
  getMetrics: () => api.get('/admin/metrics'),
  getMetricsTrend: (metric, days = 30, userDate = null, timezoneOffsetHours = 0) => {
    const params = { metric, days };
    if (userDate) params.user_date = userDate;
    if (timezoneOffsetHours !== 0) params.timezone_offset_hours = timezoneOffsetHours;
    return api.get('/admin/metrics/trends', { params });
  },

  // Account analysis
  getInactiveAccounts: (days = 30) =>
    api.get('/admin/accounts/inactive', { params: { days } }),
  getUnusualAccounts: (zThreshold = 2.0) =>
    api.get('/admin/accounts/unusual', { params: { z_threshold: zThreshold } }),
  emailInactiveAccounts: (userIds) =>
    api.post('/admin/accounts/inactive/email', { user_ids: userIds }),

  // User administration
  searchUsers: (email, limit = 50) =>
    api.get('/admin/users/search', { params: { email, limit } }),
  getUserDetail: (userId) => api.get(`/admin/users/${userId}`),
  resetUserPassword: (userId) => api.post(`/admin/users/${userId}/reset-password`),
  deleteUser: (userId) => api.delete(`/admin/users/${userId}`),

  // Session administration
  transferSession: (sessionId, newOwnerEmail) =>
    api.post(`/admin/sessions/${sessionId}/transfer`, { new_owner_email: newOwnerEmail }),
  deleteSession: (sessionId) => api.delete(`/admin/sessions/${sessionId}`),

  // S3 orphan management
  getOrphanedFiles: () => api.get('/admin/s3/orphans'),
  deleteOrphanedFiles: (keys) => api.delete('/admin/s3/orphans', { data: { keys } }),

  // Audit log
  getAuditLog: (page = 1, limit = 50, action = null, adminEmail = null) =>
    api.get('/admin/audit-log', { params: { page, limit, action, admin_email: adminEmail } }),
  cleanupAuditLog: () => api.post('/admin/audit-log/cleanup'),

  // Error logs
  getErrorLogs: (page = 1, pageSize = 50, level = null, source = null) =>
    api.get('/admin/error-logs', { params: { page, page_size: pageSize, level, source } }),
  cleanupErrorLogs: (days = 30) =>
    api.delete('/admin/error-logs/cleanup', { params: { days } }),

  // Security logs
  getSecurityLogs: (params) => api.get('/admin/security-logs', { params }),

  // System health
  getSystemHealth: () => api.get('/admin/health'),
};

export default api;
