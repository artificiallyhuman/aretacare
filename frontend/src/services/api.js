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

// Auth API
export const authAPI = {
  register: (name, email, password) =>
    api.post('/auth/register', { name, email, password }),

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
  getPrimary: () => api.post('/sessions/primary'),
  get: (sessionId) => api.get(`/sessions/${sessionId}`),
  rename: (sessionId, name) => api.patch(`/sessions/${sessionId}/rename`, { name }),
  getStatistics: (sessionId) => api.get(`/sessions/${sessionId}/statistics`),
  delete: (sessionId) => api.delete(`/sessions/${sessionId}`),
  cleanup: (sessionId) => api.post(`/sessions/${sessionId}/cleanup`),
};

// Document API
export const documentAPI = {
  upload: (formData, sessionId) => {
    return api.post(`/documents/upload${sessionId ? `?session_id=${sessionId}` : ''}`, formData, {
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
  getHistory: (sessionId, limit = 100) =>
    api.get(`/conversation/${sessionId}/history`, { params: { limit } }),
  transcribeAudio: (audioFile, sessionId) => {
    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('session_id', sessionId);
    return api.post('/conversation/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
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

// Medical API
export const medicalAPI = {
  generateSummary: (medicalText, sessionId) =>
    api.post('/medical/summary', { medical_text: medicalText, session_id: sessionId }),

  translateJargon: (medicalTerm, context = '') =>
    api.post('/medical/translate', { medical_term: medicalTerm, context }),

  getConversationCoach: (situation, sessionId) =>
    api.post('/medical/coach', { situation, session_id: sessionId }),

  chat: (content, sessionId) =>
    api.post('/medical/chat', { content, session_id: sessionId }),

  getConversationHistory: (sessionId) =>
    api.get(`/medical/conversation/${sessionId}`),
};

export default api;
