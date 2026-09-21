const API_BASE_URL = '/api';

const request = async (path, options = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'The request could not be completed.');
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the backend. Please try again.');
    }

    throw error;
  }
};

const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

export const register = (userData) => request('/auth/register', {
  method: 'POST',
  body: JSON.stringify(userData)
});

export const login = (credentials) => request('/auth/login', {
  method: 'POST',
  body: JSON.stringify(credentials)
});

export const forgotPassword = (email) => request('/auth/forgot-password', {
  method: 'POST',
  body: JSON.stringify({ email })
});

export const resetPassword = (token, password) => request(`/auth/reset-password/${encodeURIComponent(token)}`, {
  method: 'POST',
  body: JSON.stringify({ password })
});

export const getCurrentUser = (token) => request('/auth/me', {
  headers: authHeaders(token)
});

export const getHealth = () => request('/health');