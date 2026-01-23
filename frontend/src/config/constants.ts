export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  NEW_TEST: '/tests/new',
  TEST_DETAIL: (id: string) => `/tests/${id}`,
  TEST_ACTIVATE: (id: string) => `/tests/${id}/activate`,
  COURSES: '/cursos',
  NEW_COURSE: '/cursos/nuevo',
  COURSE_DETAIL: (id: string) => `/cursos/${id}`,
};

export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'auth_user',
};
