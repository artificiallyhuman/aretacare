import axios from 'axios';

// Use relative URL to leverage Vite's proxy in Docker, or environment variable for production
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,  // Enable cookies for HttpOnly refresh token
});

// Track if we're currently refreshing to avoid multiple refresh attempts
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

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

// Add response interceptor for global error handling and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't try to refresh on the refresh endpoint itself or login/register
      if (originalRequest.url.includes('/auth/refresh') ||
          originalRequest.url.includes('/auth/login') ||
          originalRequest.url.includes('/auth/register')) {
        // Call global error handler
        if (globalErrorHandler) {
          globalErrorHandler(error);
        }
        return Promise.reject(error);
      }

      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Attempt to refresh the token using HttpOnly cookie (sent automatically)
        // No refresh token in body - relies entirely on secure HttpOnly cookie
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, {
          withCredentials: true  // Send HttpOnly cookie with request
        });

        const { access_token } = response.data;

        // Store new access token (short-lived, 1 hour)
        // Note: refresh_token is handled exclusively via HttpOnly cookie for security
        localStorage.setItem('auth_token', access_token);

        // Update the authorization header
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        originalRequest.headers.Authorization = `Bearer ${access_token}`;

        // Process queued requests with new token
        processQueue(null, access_token);
        isRefreshing = false;

        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear everything and log out
        processQueue(refreshError, null);
        isRefreshing = false;

        // Clear local storage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');  // Clean up legacy values
        localStorage.removeItem('user');
        localStorage.removeItem('session_id');

        // Force immediate redirect - don't let any further code execute
        window.location.replace('/login');

        // Return a never-resolving promise to prevent further processing
        return new Promise(() => {});
      }
    }

    // Handle 403 (Forbidden) with specific error codes that require logout
    // Backend returns { message: "...", code: "CODE" } for actionable errors
    if (error.response?.status === 403) {
      const detail = error.response?.data?.detail;
      const errorCode = typeof detail === 'object' ? detail?.code : null;

      // Error codes that require logout/redirect
      const LOGOUT_CODES = ['INACTIVE_USER', 'SESSION_ACCESS_DENIED'];

      if (errorCode && LOGOUT_CODES.includes(errorCode)) {
        // Clear local storage and redirect
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        localStorage.removeItem('session_id');

        window.location.replace('/login');
        return new Promise(() => {});
      }
    }

    // Call global error handler for other errors
    if (globalErrorHandler) {
      globalErrorHandler(error);
    }

    // Still reject so component-level error handling works too
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (name, email, password, acknowledgeNotMedicalAdvice, acknowledgeHIPAA, acknowledgeEmailCommunications, agreeToTerms, invitationToken = null) =>
    api.post('/auth/register', {
      name,
      email,
      password,
      acknowledge_not_medical_advice: acknowledgeNotMedicalAdvice,
      acknowledge_hipaa: acknowledgeHIPAA,
      acknowledge_email_communications: acknowledgeEmailCommunications,
      agree_to_terms: agreeToTerms,
      invitation_token: invitationToken
    }),

  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  getMe: () => api.get('/auth/me'),

  updateName: (name, currentPassword) =>
    api.put('/auth/name', { name, current_password: currentPassword }),

  updateEmail: (email, currentPassword) =>
    api.put('/auth/email', { email, current_password: currentPassword }),

  verifyEmailChange: (token) =>
    api.post(`/auth/email/verify?token=${encodeURIComponent(token)}`),

  cancelEmailChange: () =>
    api.delete('/auth/email/pending'),

  // Email verification for new registrations
  verifyEmail: (token) =>
    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`),

  resendVerification: (email) =>
    api.post('/auth/resend-verification', { email }),

  updatePassword: (currentPassword, newPassword) =>
    api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }),

  deleteAccount: (password) =>
    api.delete('/auth/account', { data: { password } }),

  requestPasswordReset: (email) =>
    api.post('/auth/password-reset/request', { email }),

  resetPassword: (token, newPassword) =>
    api.post('/auth/password-reset/reset', { token, new_password: newPassword }),

  logout: async () => {
    // Clear local storage FIRST (synchronously) before async server call
    // This ensures logout happens immediately even if server call is slow or fails
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');  // Clean up legacy values
    localStorage.removeItem('user');
    localStorage.removeItem('session_id');

    try {
      // Call server to clear HttpOnly refresh token cookie and revoke token
      await api.post('/auth/logout');
    } catch (error) {
      // Server call failed, but client-side logout already happened
      console.error('Logout request failed:', error);
    }
  },

  logoutEverywhere: () =>
    api.post('/auth/logout-everywhere'),

  checkSessionValid: () =>
    api.get('/auth/session-valid'),
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
    api.post('/conversation/message', data),
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
  translateJargon: (medicalTerm, context = '', sessionId = null) =>
    api.post('/tools/jargon-translator', { medical_term: medicalTerm, context, session_id: sessionId }),
  getConversationCoach: (situation, sessionId = null) =>
    api.post('/tools/conversation-coach', { situation, session_id: sessionId }),
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

  // API logs (GPT-5.2 request monitoring)
  getApiLogs: (params = {}) => api.get('/admin/api-logs', { params }),

  // Token management
  getUserTokens: (userId) => api.get(`/admin/users/${userId}/tokens`),
  revokeAllUserTokens: (userId) => api.post(`/admin/users/${userId}/tokens/revoke-all`),
  revokeToken: (tokenId) => api.delete(`/admin/tokens/${tokenId}`),
};

// Feedback API
export const feedbackAPI = {
  submit: (feedbackData) => api.post('/feedback/submit', feedbackData),
};

// Profile API
export const profileAPI = {
  get: (sessionId) => api.get(`/profile/${sessionId}`),
  check: (sessionId) => api.get(`/profile/${sessionId}/check`),
  update: (sessionId) => api.post(`/profile/${sessionId}/update`),
  save: (sessionId, profileData) => api.put(`/profile/${sessionId}`, { profile_data: profileData }),
  updateSection: (sessionId, section, data) => api.patch(`/profile/${sessionId}/section`, { section, data }),
  getPendingChanges: (sessionId) => api.get(`/profile/${sessionId}/pending-changes`),
  reviewPendingChanges: (sessionId, decisions) => api.post(`/profile/${sessionId}/pending-changes/review`, { decisions }),
  regenerate: (sessionId, confirm = true) => api.post(`/profile/${sessionId}/regenerate`, { confirm }),
  delete: (sessionId) => api.delete(`/profile/${sessionId}`),
  exportJson: (sessionId) => api.get(`/profile/${sessionId}/export?format=json`, { responseType: 'blob' }),
  exportPdf: (sessionId) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return api.get(`/profile/${sessionId}/export?format=pdf&timezone=${encodeURIComponent(tz)}`, { responseType: 'blob' });
  },
};

export default api;
