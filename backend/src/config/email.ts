// Servicio de Email - Integración con Resend
import { Resend } from 'resend';
import { env } from './env';

// Crear cliente de Resend
const resend = new Resend(env.RESEND_API_KEY);

// Email remitente (debe estar verificado en Resend)
const FROM_EMAIL = 'Mi Hoja <resultados@mihoja.cl>';

interface StudentResult {
  studentName: string;
  studentEmail: string;
  testTitle: string;
  courseName: string;
  totalPoints: number;
  maxPoints: number;
  percentage: number;
  submittedAt: string;
  answers: Array<{
    questionNumber: number;
    questionText: string;
    questionType: string;
    answerValue: string | null;
    correctAnswer: string | null;
    pointsEarned: number | null;
    maxPoints: number;
    aiFeedback: string | null;
  }>;
}

/**
 * Generar HTML del email de resultados
 */
function generateResultsEmailHTML(result: StudentResult): string {
  const scoreColor = result.percentage >= 60 ? '#16a34a' : result.percentage >= 40 ? '#ca8a04' : '#dc2626';

  const answersHTML = result.answers.map(a => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>Pregunta ${a.questionNumber}</strong>
        <span style="color: #6b7280; font-size: 12px; margin-left: 8px;">(${formatQuestionType(a.questionType)})</span>
        <p style="color: #374151; margin: 4px 0; font-size: 14px;">${a.questionText.substring(0, 150)}${a.questionText.length > 150 ? '...' : ''}</p>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; white-space: nowrap;">
        <span style="background: ${a.pointsEarned === a.maxPoints ? '#dcfce7' : a.pointsEarned === 0 ? '#fef2f2' : '#fef3c7'}; color: ${a.pointsEarned === a.maxPoints ? '#166534' : a.pointsEarned === 0 ? '#991b1b' : '#92400e'}; padding: 4px 8px; border-radius: 4px; font-weight: 600;">
          ${a.pointsEarned ?? '-'}/${a.maxPoints}
        </span>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding: 8px 12px 16px; background: #f9fafb;">
        <div style="display: flex; gap: 16px; font-size: 13px;">
          <div style="flex: 1;">
            <span style="color: #6b7280;">Tu respuesta:</span>
            <p style="color: #1f2937; margin: 4px 0; background: white; padding: 8px; border-radius: 4px; border: 1px solid #e5e7eb;">
              ${a.answerValue || '<em style="color: #9ca3af;">Sin respuesta</em>'}
            </p>
          </div>
          ${a.correctAnswer ? `
          <div style="flex: 1;">
            <span style="color: #6b7280;">Respuesta correcta:</span>
            <p style="color: #166534; margin: 4px 0; background: #dcfce7; padding: 8px; border-radius: 4px; border: 1px solid #bbf7d0;">
              ${a.correctAnswer}
            </p>
          </div>
          ` : ''}
        </div>
        ${a.aiFeedback ? `
        <div style="margin-top: 8px; padding: 8px; background: #eff6ff; border-radius: 4px; border-left: 3px solid #3b82f6;">
          <span style="color: #1e40af; font-size: 12px; font-weight: 600;">Retroalimentación:</span>
          <p style="color: #1e3a8a; margin: 4px 0; font-size: 13px;">${a.aiFeedback}</p>
        </div>
        ` : ''}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resultados de tu prueba</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0; padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Resultados de tu Prueba</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">${result.testTitle}</p>
    </div>

    <!-- Main content -->
    <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <!-- Greeting -->
      <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">
        Hola <strong>${result.studentName}</strong>,
      </p>
      <p style="color: #374151; font-size: 14px; margin-bottom: 24px;">
        Tu profesor ha publicado los resultados de la prueba. Aquí está tu resumen:
      </p>

      <!-- Score card -->
      <div style="background: #f9fafb; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px; border: 2px solid ${scoreColor};">
        <p style="color: #6b7280; margin: 0 0 8px; font-size: 14px;">Puntaje obtenido</p>
        <p style="color: ${scoreColor}; font-size: 48px; font-weight: 700; margin: 0;">
          ${result.totalPoints}<span style="font-size: 24px; color: #9ca3af;">/${result.maxPoints}</span>
        </p>
        <p style="color: ${scoreColor}; font-size: 18px; margin: 8px 0 0; font-weight: 600;">
          ${result.percentage}%
        </p>
      </div>

      <!-- Info -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 24px; padding: 12px; background: #f3f4f6; border-radius: 8px;">
        <div>
          <p style="color: #6b7280; font-size: 12px; margin: 0;">Curso</p>
          <p style="color: #1f2937; font-size: 14px; font-weight: 600; margin: 4px 0 0;">${result.courseName}</p>
        </div>
        <div>
          <p style="color: #6b7280; font-size: 12px; margin: 0;">Fecha de entrega</p>
          <p style="color: #1f2937; font-size: 14px; font-weight: 600; margin: 4px 0 0;">${new Date(result.submittedAt).toLocaleDateString('es-CL', { dateStyle: 'long' })}</p>
        </div>
      </div>

      <!-- Answers detail -->
      <h2 style="color: #1f2937; font-size: 18px; margin: 24px 0 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        Detalle por pregunta
      </h2>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${answersHTML}
      </table>

      <!-- Footer -->
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Este correo fue enviado automáticamente por Mi Hoja.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin: 4px 0;">
          Si tienes dudas sobre tus resultados, contacta a tu profesor.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Formatear tipo de pregunta
 */
function formatQuestionType(type: string): string {
  const types: Record<string, string> = {
    TRUE_FALSE: 'V/F',
    MULTIPLE_CHOICE: 'Opción Múltiple',
    DEVELOPMENT: 'Desarrollo',
    MATH: 'Matemática',
  };
  return types[type] || type;
}

/**
 * Enviar email de resultados a un estudiante
 */
export async function sendResultsEmail(result: StudentResult): Promise<{ success: boolean; error?: string }> {
  if (!result.studentEmail) {
    return { success: false, error: 'El estudiante no tiene email registrado' };
  }

  try {
    const html = generateResultsEmailHTML(result);

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: result.studentEmail,
      subject: `Resultados: ${result.testTitle} - ${result.totalPoints}/${result.maxPoints} pts`,
      html,
    });

    if (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }

    console.log('Email sent successfully:', data?.id);
    return { success: true };
  } catch (err) {
    console.error('Error sending email:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export default resend;
