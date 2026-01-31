// ============================================
// MODELOS BASE (coinciden con Prisma backend)
// ============================================

export interface Teacher {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Test {
  id: string;
  teacherId?: string;
  teacher_id?: string; // Backend usa snake_case
  title: string;
  subject?: string;
  courseId?: string;
  course_id?: string | null; // Backend usa snake_case
  course?: {
    id: string;
    name: string;
    year: number;
    students?: CourseStudent[];
  } | null;
  pdfUrl?: string;
  pdf_url?: string; // Backend usa snake_case
  isActive?: boolean;
  is_active?: boolean; // Backend usa snake_case
  accessCode?: string;
  access_code?: string; // Backend usa snake_case
  createdAt?: string;
  created_at?: string; // Backend usa snake_case
  updatedAt?: string;
  updated_at?: string; // Backend usa snake_case
  questions?: Question[];
  // Opciones de corrección
  requireFalseJustification?: boolean;
  require_false_justification?: boolean;
  falseJustificationPenalty?: number;
  false_justification_penalty?: number;
  evaluateSpelling?: boolean;
  evaluate_spelling?: boolean;
  evaluateWriting?: boolean;
  evaluate_writing?: boolean;
  spellingPoints?: number | null;
  spelling_points?: number | null;
  writingPoints?: number | null;
  writing_points?: number | null;
}

export interface Question {
  id: string;
  testId?: string;
  test_id?: string; // Backend usa snake_case
  questionNumber?: number;
  question_number?: number; // Backend usa snake_case
  questionLabel?: string;
  question_label?: string; // Nomenclatura visible (I.a, II.b, etc.)
  questionText?: string;
  question_text?: string; // Backend usa snake_case
  questionType?: QuestionType;
  type?: QuestionType; // Backend usa 'type' en vez de 'questionType'
  points: number;
  correctAnswer?: string;
  correct_answer?: string; // Backend usa snake_case
  options?: string[];
  rubric?: string;
  correctionCriteria?: string;
  correction_criteria?: string; // Backend usa snake_case
  createdAt?: string;
  created_at?: string; // Backend usa snake_case
  // Opciones para preguntas MATH
  requireUnits?: boolean;
  require_units?: boolean;
  unitPenalty?: number;
  unit_penalty?: number;
}

export interface StudentAttempt {
  id: string;
  testId: string;
  studentName: string;
  deviceId: string;
  startedAt: string;
  submittedAt?: string;
  totalScore?: number;
  answers?: Answer[];
}

export interface Answer {
  id: string;
  attemptId: string;
  questionId: string;
  answerText: string;
  isCorrect?: boolean;
  pointsAwarded?: number;
  aiEvaluation?: string;
  createdAt: string;
}

export interface Course {
  id: string;
  teacher_id: string;
  name: string;
  year: number;
  created_at: string;
  students?: CourseStudent[];
  _count?: {
    students: number;
    tests: number;
  };
}

export interface CourseStudent {
  id: string;
  course_id: string;
  student_name: string;
  student_email?: string | null;
  created_at: string;
}

export interface CreateCourseRequest {
  name: string;
  year: number;
}

export interface UpdateCourseRequest {
  name?: string;
  year?: number;
}

export interface AddStudentsRequest {
  students: Array<{
    student_name: string;
    student_email?: string;
  }>;
}

export interface AddStudentsResponse {
  message: string;
  students: CourseStudent[];
}

// ============================================
// ENUMS
// ============================================

export enum QuestionType {
  TRUE_FALSE = 'TRUE_FALSE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  DEVELOPMENT = 'DEVELOPMENT',
  MATH = 'MATH',
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

// Auth
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  teacher: Teacher;
}

// Tests
export interface CreateTestRequest {
  title: string;
  courseId?: string;
}

export interface UpdateTestRequest {
  title?: string;
  courseId?: string;
  // Opciones de corrección
  requireFalseJustification?: boolean;
  falseJustificationPenalty?: number;
  evaluateSpelling?: boolean;
  evaluateWriting?: boolean;
  spellingPoints?: number | null;
  writingPoints?: number | null;
}

export interface UploadPDFResponse {
  message: string;
  pdfUrl: string;
}

export interface AnalyzePDFResponse {
  message: string;
  questionsDetected: number;
  questions: Question[];
}

export interface ActivateTestResponse {
  message: string;
  accessCode: string;
  test: Test;
}

export interface UpdateQuestionRequest {
  questionLabel?: string;
  question_label?: string;
  questionText?: string;
  question_text?: string;
  questionType?: QuestionType;
  type?: QuestionType;
  points?: number;
  correctAnswer?: string;
  options?: string[];
  rubric?: string;
  correctionCriteria?: string;
  correction_criteria?: string;
  correct_answer?: string;
  requireUnits?: boolean;
  require_units?: boolean;
  unitPenalty?: number;
  unit_penalty?: number;
}

// Student
export interface JoinTestRequest {
  accessCode: string;
  courseStudentId: string;
  deviceToken?: string;
  studentEmail?: string;
}

export interface JoinTestResponse {
  attemptId: string;
  deviceToken: string;
  test: {
    id: string;
    title: string;
    pdfUrl: string | null;
    questions: Array<{
      id: string;
      questionNumber: number;
      type: string;
      questionText: string;
      points: number;
      options: string[] | null;
    }>;
  };
}

export interface SaveAnswersRequest {
  answers: Array<{
    questionId: string;
    answerValue: string;
    justification?: string; // Para V/F con justificación
  }>;
}

export interface SubmitAttemptResponse {
  success: boolean;
  resultsToken: string;
  submittedAt: string;
}

export interface AvailableStudent {
  id: string;
  studentName: string;
  hasAttempt: boolean;
  attemptStatus?: 'IN_PROGRESS' | 'SUBMITTED';
}

export interface AvailableStudentsResponse {
  test: {
    id: string;
    title: string;
    courseName: string;
  };
  students: AvailableStudent[];
}

export interface MonitorStudent {
  courseStudentId: string;
  studentName: string;
  studentEmail: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
  attemptId: string | null;
  answersCount: number;
  lastActivity: string | null;
  submittedAt: string | null;
  isUnlocked: boolean;
}

export interface TestAttemptsResponse {
  test: {
    id: string;
    title: string;
    status: string;
    courseName: string | null;
    totalStudents: number;
    durationMinutes: number | null;
    activatedAt: string | null;
    endsAt: string | null;
    timeRemainingSeconds: number | null;
    correctionCompletedAt: string | null;
  };
  students: MonitorStudent[];
  summary: {
    notStarted: number;
    inProgress: number;
    submitted: number;
  };
}

// ============================================
// UI HELPER TYPES
// ============================================

export interface FormErrors {
  [key: string]: string | undefined;
}

export interface ApiError {
  message: string;
  errors?: FormErrors;
}
