/**
 * Calculador de notas según sistema chileno
 * Escala: 1.0 - 7.0
 * Nota mínima de aprobación: 4.0
 */

export interface GradeResult {
  grade: number;      // Nota con 1 decimal (ej: 5.8)
  percentage: number; // Porcentaje de logro
  passed: boolean;    // Si aprobó (nota >= 4.0)
}

/**
 * Calcula la nota en escala chilena 1.0 - 7.0
 *
 * @param percentage - Porcentaje de logro (0-100)
 * @param passingThreshold - Exigencia: porcentaje mínimo para nota 4.0 (default 60)
 * @returns GradeResult con nota, porcentaje y estado de aprobación
 *
 * Fórmula estándar chilena:
 * - Si porcentaje >= exigencia: nota = 4.0 + (porcentaje - exigencia) * 3.0 / (100 - exigencia)
 * - Si porcentaje < exigencia: nota = 1.0 + (porcentaje * 3.0 / exigencia)
 */
export function calculateChileanGrade(
  percentage: number,
  passingThreshold: number = 60
): GradeResult {
  // Validar y normalizar porcentaje
  const normalizedPercentage = Math.max(0, Math.min(100, percentage));

  // Validar exigencia (debe estar entre 1 y 99)
  const threshold = Math.max(1, Math.min(99, passingThreshold));

  let grade: number;

  if (normalizedPercentage >= threshold) {
    // Sobre la exigencia: escala lineal de 4.0 a 7.0
    grade = 4.0 + ((normalizedPercentage - threshold) * 3.0) / (100 - threshold);
  } else {
    // Bajo la exigencia: escala lineal de 1.0 a 4.0
    grade = 1.0 + (normalizedPercentage * 3.0) / threshold;
  }

  // Redondear a 1 decimal y limitar entre 1.0 y 7.0
  grade = Math.round(grade * 10) / 10;
  grade = Math.max(1.0, Math.min(7.0, grade));

  return {
    grade,
    percentage: Math.round(normalizedPercentage * 100) / 100,
    passed: grade >= 4.0,
  };
}

/**
 * Calcula estadísticas de notas para un grupo de estudiantes
 */
export interface GradeStats {
  average: number;      // Promedio de notas
  max: number;          // Nota máxima
  min: number;          // Nota mínima
  passedCount: number;  // Cantidad de aprobados
  failedCount: number;  // Cantidad de reprobados
  passRate: number;     // Tasa de aprobación (%)
}

export function calculateGradeStats(grades: number[]): GradeStats {
  if (grades.length === 0) {
    return {
      average: 0,
      max: 0,
      min: 0,
      passedCount: 0,
      failedCount: 0,
      passRate: 0,
    };
  }

  const sum = grades.reduce((a, b) => a + b, 0);
  const passedCount = grades.filter(g => g >= 4.0).length;

  return {
    average: Math.round((sum / grades.length) * 10) / 10,
    max: Math.max(...grades),
    min: Math.min(...grades),
    passedCount,
    failedCount: grades.length - passedCount,
    passRate: Math.round((passedCount / grades.length) * 10000) / 100,
  };
}
