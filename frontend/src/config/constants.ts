export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  NEW_TEST: '/tests/new',
  TEST_DETAIL: (id: string) => `/tests/${id}`,
  TEST_ACTIVATE: (id: string) => `/tests/${id}/activate`,
  TEST_MONITOR: (id: string) => `/tests/${id}/monitor`,
  TEST_RESULTS: (id: string) => `/tests/${id}/results`,
  COURSES: '/cursos',
  NEW_COURSE: '/cursos/nuevo',
  COURSE_DETAIL: (id: string) => `/cursos/${id}`,
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email',
  PLANES: '/planes',
};

export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'auth_user',
};
