import { STORAGE_KEYS } from '@/config/constants';
import type { Teacher } from '@/types';

// ============================================
// TOKEN MANAGEMENT
// ============================================

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
};

export const setToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
};

export const removeToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
};

// ============================================
// USER MANAGEMENT
// ============================================

export const getCurrentUser = (): Teacher | null => {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem(STORAGE_KEYS.USER);
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr) as Teacher;
  } catch (error) {
    console.error('Error parsing user data:', error);
    return null;
  }
};

export const setCurrentUser = (user: Teacher): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};

export const removeCurrentUser = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.USER);
};

// ============================================
// AUTH STATE
// ============================================

export const isAuthenticated = (): boolean => {
  return !!getToken();
};

export const logout = (): void => {
  removeToken();
  removeCurrentUser();
  
  // Redirect to login
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
};

// ============================================
// JWT HELPERS (OPTIONAL - for client-side token decode)
// ============================================

interface JWTPayload {
  teacherId: string;
  email: string;
  iat: number;
  exp: number;
}

export const decodeToken = (token: string): JWTPayload | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as JWTPayload;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

export const isTokenExpired = (token: string): boolean => {
  const decoded = decodeToken(token);
  if (!decoded) return true;
  
  const currentTime = Date.now() / 1000;
  return decoded.exp < currentTime;
};
