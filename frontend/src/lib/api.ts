import axios, { AxiosError, AxiosInstance } from 'axios';
import { API_URL } from '@/config/constants';
import { getToken, logout } from './auth';
import type {
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  Teacher,
  Test,
  CreateTestRequest,
  UpdateTestRequest,
  UploadPDFResponse,
  AnalyzePDFResponse,
  ActivateTestResponse,
  Question,
  UpdateQuestionRequest,
  ApiError,
  JoinTestRequest,
  JoinTestResponse,
  SaveAnswersRequest,
  SubmitAttemptResponse,
  Course,
  CreateCourseRequest,
  UpdateCourseRequest,
  AddStudentsRequest,
  AddStudentsResponse,
  AvailableStudentsResponse,
  TestAttemptsResponse,
  AnalyzeRubricResponse,
  BatchUpdateItem,
} from '@/types';

// ============================================
// AXIOS INSTANCE CONFIGURATION
// ============================================

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================
// REQUEST INTERCEPTOR - Add JWT Token
// ============================================

apiClient.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ============================================
// RESPONSE INTERCEPTOR - Handle Errors
// ============================================

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    // Handle 401 Unauthorized - auto logout
    if (error.response?.status === 401) {
      logout();
      return Promise.reject(new Error('Sesión expirada. Por favor inicia sesión nuevamente.'));
    }

    // Handle other errors - backend usa 'error' no 'message'
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    const message = data?.error || data?.message || 'Error en la solicitud';
    return Promise.reject(new Error(message));
  }
);

// ============================================
// AUTH ENDPOINTS
// ============================================

export const authAPI = {
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/api/auth/register', data);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/api/auth/login', data);
    return response.data;
  },

  me: async (): Promise<Teacher> => {
    const response = await apiClient.get<Teacher>('/api/auth/me');
    return response.data;
  },
};

// ============================================
// SSE STREAMING HELPER (for long-running AI analysis)
// ============================================

async function streamingAnalysis<T>(
  endpoint: string,
  file: File,
  onProgress?: (data: { batch: number; totalBatches: number; pages: string; questionsFound: number; message: string }) => void
): Promise<T> {
  const formData = new FormData();
  formData.append('pdf', file);

  const token = getToken();
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    // Try to parse error from JSON response
    try {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || 'Error en la solicitud');
    } catch (e) {
      if (e instanceof Error && e.message !== 'Error en la solicitud') throw e;
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }

  // Read SSE stream
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'progress') {
          onProgress?.(data);
        } else if (data.type === 'complete') {
          result = data.data as T;
        } else if (data.type === 'error') {
          throw new Error(data.message);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
      }
    }
  }

  if (!result) {
    throw new Error('No se recibió respuesta del servidor');
  }

  return result;
}

// ============================================
// TESTS ENDPOINTS
// ============================================

export const testsAPI = {
  // Crear nueva prueba
  create: async (data: CreateTestRequest): Promise<Test> => {
    const response = await apiClient.post<Test>('/api/tests', data);
    return response.data;
  },

  // Listar todas las pruebas del profesor
  list: async (): Promise<Test[]> => {
    const response = await apiClient.get<Test[]>('/api/tests');
    return response.data;
  },

  // Obtener una prueba específica con sus preguntas
  getById: async (id: string): Promise<Test> => {
    const response = await apiClient.get<Test>(`/api/tests/${id}`);
    return response.data;
  },

  // Subir PDF
  uploadPDF: async (id: string, file: File): Promise<UploadPDFResponse> => {
    const formData = new FormData();
    formData.append('pdf', file);

    const response = await apiClient.post<UploadPDFResponse>(
      `/api/tests/${id}/upload-pdf`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // Analizar PDF con IA (SSE streaming para progreso)
  analyzePDF: async (
    id: string,
    file: File,
    onProgress?: (data: { batch: number; totalBatches: number; pages: string; questionsFound: number; message: string }) => void
  ): Promise<AnalyzePDFResponse> => {
    return streamingAnalysis<AnalyzePDFResponse>(`/api/tests/${id}/analyze-pdf`, file, onProgress);
  },

  // Analizar pauta de corrección con IA (SSE streaming para progreso)
  analyzeRubric: async (
    id: string,
    file: File,
    onProgress?: (data: { batch: number; totalBatches: number; pages: string; questionsFound: number; message: string }) => void
  ): Promise<AnalyzeRubricResponse> => {
    return streamingAnalysis<AnalyzeRubricResponse>(`/api/tests/${id}/analyze-rubric`, file, onProgress);
  },

  // Activar prueba (genera código)
  activate: async (id: string, durationMinutes: number): Promise<ActivateTestResponse> => {
    const response = await apiClient.post<ActivateTestResponse>(`/api/tests/${id}/activate`, {
      durationMinutes,
    });
    return response.data;
  },

  // Cerrar prueba
  close: async (id: string): Promise<Test> => {
    const response = await apiClient.post<Test>(`/api/tests/${id}/close`);
    return response.data;
  },

  // Duplicar prueba
  duplicate: async (id: string, title?: string, courseId?: string): Promise<Test> => {
    const response = await apiClient.post<Test>(`/api/tests/${id}/duplicate`, {
      title,
      courseId,
    });
    return response.data;
  },

  // Obtener resultados de una prueba
  getResults: async (id: string) => {
    const response = await apiClient.get(`/api/tests/${id}/results`);
    return response.data;
  },

  // Actualizar una respuesta (puntaje/feedback)
  updateAnswer: async (testId: string, answerId: string, data: { pointsEarned?: number; aiFeedback?: string }) => {
    const response = await apiClient.put(`/api/tests/${testId}/answers/${answerId}`, data);
    return response.data;
  },

  // Marcar intento como revisado
  markReviewed: async (testId: string, attemptId: string) => {
    const response = await apiClient.post(`/api/tests/${testId}/attempts/${attemptId}/mark-reviewed`);
    return response.data;
  },

  // Enviar resultados por email
  sendResults: async (testId: string, studentAttemptIds?: string[], includeGrade?: boolean) => {
    const response = await apiClient.post(`/api/tests/${testId}/send-results`, {
      studentAttemptIds,
      includeGrade,
    });
    return response.data;
  },

  // Actualizar la exigencia (porcentaje mínimo para nota 4.0)
  updatePassingThreshold: async (testId: string, passingThreshold: number) => {
    const response = await apiClient.put(`/api/tests/${testId}/passing-threshold`, {
      passingThreshold,
    });
    return response.data;
  },

  // Actualizar prueba
  update: async (id: string, data: UpdateTestRequest): Promise<Test> => {
    const response = await apiClient.put<Test>(`/api/tests/${id}`, data);
    return response.data;
  },

  // Eliminar prueba
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/tests/${id}`);
  },

  // Obtener intentos de una prueba (monitoreo)
  getAttempts: async (id: string): Promise<TestAttemptsResponse> => {
    const response = await apiClient.get<TestAttemptsResponse>(`/api/tests/${id}/attempts`);
    return response.data;
  },

  // Desbloquear estudiante
  unlockStudent: async (testId: string, attemptId: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/api/tests/${testId}/attempts/${attemptId}/unlock`
    );
    return response.data;
  },
};

// ============================================
// QUESTIONS ENDPOINTS
// ============================================

export const questionsAPI = {
  // Crear pregunta
  create: async (testId: string, data: {
    question_label?: string;
    question_text: string;
    type: string;
    points?: number;
    options?: string[];
    correct_answer?: string;
    correction_criteria?: string;
  }): Promise<Question> => {
    const response = await apiClient.post<Question>(
      `/api/tests/${testId}/questions`,
      data
    );
    return response.data;
  },

  // Actualizar pregunta
  update: async (testId: string, questionId: string, data: UpdateQuestionRequest): Promise<Question> => {
    const response = await apiClient.put<Question>(
      `/api/tests/${testId}/questions/${questionId}`,
      data
    );
    return response.data;
  },

  // Eliminar pregunta
  delete: async (testId: string, questionId: string): Promise<void> => {
    await apiClient.delete(`/api/tests/${testId}/questions/${questionId}`);
  },

  // Actualizar múltiples preguntas en batch
  batchUpdate: async (testId: string, updates: BatchUpdateItem[]): Promise<{ message: string; updated: number }> => {
    const response = await apiClient.put<{ message: string; updated: number }>(
      `/api/tests/${testId}/questions/batch`,
      { updates }
    );
    return response.data;
  },

  // Reordenar preguntas
  reorder: async (testId: string, questionIds: string[]): Promise<Question[]> => {
    const response = await apiClient.put<Question[]>(
      `/api/tests/${testId}/questions/reorder`,
      { questionIds }
    );
    return response.data;
  },
};

// ============================================
// COURSES ENDPOINTS
// ============================================

export const coursesAPI = {
  // Crear nuevo curso
  create: async (data: CreateCourseRequest): Promise<Course> => {
    const response = await apiClient.post<Course>('/api/courses', data);
    return response.data;
  },

  // Listar todos los cursos del profesor
  list: async (): Promise<Course[]> => {
    const response = await apiClient.get<Course[]>('/api/courses');
    return response.data;
  },

  // Obtener un curso específico con sus estudiantes
  getById: async (id: string): Promise<Course> => {
    const response = await apiClient.get<Course>(`/api/courses/${id}`);
    return response.data;
  },

  // Actualizar curso
  update: async (id: string, data: UpdateCourseRequest): Promise<Course> => {
    const response = await apiClient.put<Course>(`/api/courses/${id}`, data);
    return response.data;
  },

  // Eliminar curso
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/courses/${id}`);
  },

  // Agregar estudiantes desde JSON
  addStudents: async (id: string, data: AddStudentsRequest): Promise<AddStudentsResponse> => {
    const response = await apiClient.post<AddStudentsResponse>(
      `/api/courses/${id}/students`,
      data
    );
    return response.data;
  },

  // Subir archivo Excel/CSV con estudiantes
  uploadStudents: async (id: string, file: File): Promise<AddStudentsResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<AddStudentsResponse>(
      `/api/courses/${id}/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // Eliminar estudiante
  deleteStudent: async (courseId: string, studentId: string): Promise<void> => {
    await apiClient.delete(`/api/courses/${courseId}/students/${studentId}`);
  },
};

// ============================================
// STUDENT ENDPOINTS (públicos, sin JWT)
// ============================================

export const studentAPI = {
  // Obtener estudiantes disponibles para una prueba
  getAvailableStudents: async (accessCode: string): Promise<AvailableStudentsResponse> => {
    const response = await axios.get<AvailableStudentsResponse>(
      `${API_URL}/api/student/test/${accessCode.toUpperCase()}/students`
    );
    return response.data;
  },

  // Unirse a una prueba con código (lista cerrada)
  join: async (data: JoinTestRequest): Promise<JoinTestResponse> => {
    const response = await axios.post<JoinTestResponse>(
      `${API_URL}/api/student/join`,
      data
    );
    return response.data;
  },

  // Obtener intento actual
  getAttempt: async (attemptId: string, deviceToken: string) => {
    const response = await axios.get(
      `${API_URL}/api/student/attempt/${attemptId}`,
      {
        headers: { 'x-device-token': deviceToken },
      }
    );
    return response.data;
  },

  // Guardar respuestas (autosave)
  saveAnswers: async (attemptId: string, deviceToken: string, data: SaveAnswersRequest) => {
    const response = await axios.post(
      `${API_URL}/api/student/attempt/${attemptId}/save`,
      data,
      {
        headers: { 'x-device-token': deviceToken },
      }
    );
    return response.data;
  },

  // Entregar prueba
  submit: async (attemptId: string, deviceToken: string): Promise<SubmitAttemptResponse> => {
    const response = await axios.post<SubmitAttemptResponse>(
      `${API_URL}/api/student/attempt/${attemptId}/submit`,
      {},
      {
        headers: { 'x-device-token': deviceToken },
      }
    );
    return response.data;
  },

  // Registrar intento de paste externo (silencioso)
  recordPasteAttempt: async (attemptId: string, deviceToken: string): Promise<void> => {
    try {
      await axios.post(
        `${API_URL}/api/student/attempt/${attemptId}/paste-attempt`,
        {},
        {
          headers: { 'x-device-token': deviceToken },
        }
      );
    } catch {
      // Silencioso - no mostrar errores
    }
  },
};

// ============================================
// EXPORT DEFAULT CLIENT (for custom requests)
// ============================================

export default apiClient;
