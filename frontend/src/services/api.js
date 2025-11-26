import axios from 'axios';

// Use relative URL to leverage Vite's proxy in Docker, or environment variable for production
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Session API
export const sessionAPI = {
  create: () => api.post('/sessions/'),
  get: (sessionId) => api.get(`/sessions/${sessionId}`),
  delete: (sessionId) => api.delete(`/sessions/${sessionId}`),
  cleanup: (sessionId) => api.post(`/sessions/${sessionId}/cleanup`),
};

// Document API
export const documentAPI = {
  upload: (file, sessionId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (sessionId) {
      formData.append('session_id', sessionId);
    }
    return api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  getSessionDocuments: (sessionId) => api.get(`/documents/session/${sessionId}`),
  get: (documentId) => api.get(`/documents/${documentId}`),
  delete: (documentId) => api.delete(`/documents/${documentId}`),
  getDownloadUrl: (documentId) => api.get(`/documents/${documentId}/download-url`),
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
