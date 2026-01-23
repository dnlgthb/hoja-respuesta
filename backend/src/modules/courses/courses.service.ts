// Servicio de Courses - Lógica de negocio para cursos y estudiantes
import prisma from '../../config/database';
import * as XLSX from 'xlsx';
import { extractStudentsFromFile } from '../../config/openai';

// Tipos para las operaciones
export interface CreateCourseData {
  name: string;
  year: number;
  teacherId: string;
}

export interface UpdateCourseData {
  name?: string;
  year?: number;
}

export interface StudentData {
  student_name: string;
  student_email?: string;
}

export class CoursesService {

  /**
   * Crear un nuevo curso
   */
  async createCourse(data: CreateCourseData) {
    const { name, year, teacherId } = data;

    const course = await prisma.course.create({
      data: {
        name,
        year,
        teacher_id: teacherId,
      },
      include: {
        _count: {
          select: {
            students: true,
            tests: true,
          },
        },
      },
    });

    return course;
  }

  /**
   * Listar todos los cursos de un profesor
   */
  async getCoursesByTeacher(teacherId: string) {
    const courses = await prisma.course.findMany({
      where: {
        teacher_id: teacherId,
      },
      include: {
        _count: {
          select: {
            students: true,
            tests: true,
          },
        },
      },
      orderBy: [
        { year: 'desc' },
        { name: 'asc' },
      ],
    });

    return courses;
  }

  /**
   * Obtener un curso por ID con sus estudiantes
   */
  async getCourseById(courseId: string, teacherId: string) {
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        teacher_id: teacherId,
      },
      include: {
        students: {
          orderBy: {
            student_name: 'asc',
          },
        },
        _count: {
          select: {
            tests: true,
          },
        },
      },
    });

    if (!course) {
      throw new Error('Curso no encontrado');
    }

    return course;
  }

  /**
   * Actualizar un curso
   */
  async updateCourse(courseId: string, teacherId: string, data: UpdateCourseData) {
    // Verificar que el curso pertenece al profesor
    const existingCourse = await prisma.course.findFirst({
      where: {
        id: courseId,
        teacher_id: teacherId,
      },
    });

    if (!existingCourse) {
      throw new Error('Curso no encontrado');
    }

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: {
        name: data.name,
        year: data.year,
      },
      include: {
        _count: {
          select: {
            students: true,
            tests: true,
          },
        },
      },
    });

    return updatedCourse;
  }

  /**
   * Eliminar un curso
   */
  async deleteCourse(courseId: string, teacherId: string) {
    // Verificar que el curso pertenece al profesor
    const existingCourse = await prisma.course.findFirst({
      where: {
        id: courseId,
        teacher_id: teacherId,
      },
    });

    if (!existingCourse) {
      throw new Error('Curso no encontrado');
    }

    // Eliminar el curso (Cascade eliminará estudiantes automáticamente)
    await prisma.course.delete({
      where: { id: courseId },
    });

    return { message: 'Curso eliminado exitosamente' };
  }

  /**
   * Agregar estudiantes a un curso (desde JSON array)
   */
  async addStudents(courseId: string, teacherId: string, students: StudentData[]) {
    // Verificar que el curso pertenece al profesor
    const course = await this.getCourseById(courseId, teacherId);

    if (!students || students.length === 0) {
      throw new Error('Debe proporcionar al menos un estudiante');
    }

    // Filtrar estudiantes duplicados y validar
    const validStudents = students.filter(s => s.student_name && s.student_name.trim().length > 0);

    if (validStudents.length === 0) {
      throw new Error('No se encontraron estudiantes válidos');
    }

    // Crear estudiantes (ignorar duplicados por nombre)
    const createdStudents = [];
    for (const student of validStudents) {
      try {
        const created = await prisma.courseStudent.create({
          data: {
            course_id: courseId,
            student_name: student.student_name.trim(),
            student_email: student.student_email?.trim() || null,
          },
        });
        createdStudents.push(created);
      } catch (error: any) {
        // Ignorar errores de duplicados (unique constraint)
        if (error.code !== 'P2002') {
          throw error;
        }
      }
    }

    return {
      message: `Se agregaron ${createdStudents.length} estudiantes`,
      students: createdStudents,
    };
  }

  /**
   * Eliminar un estudiante de un curso
   */
  async deleteStudent(courseId: string, studentId: string, teacherId: string) {
    // Verificar que el curso pertenece al profesor
    await this.getCourseById(courseId, teacherId);

    // Verificar que el estudiante existe en el curso
    const student = await prisma.courseStudent.findFirst({
      where: {
        id: studentId,
        course_id: courseId,
      },
    });

    if (!student) {
      throw new Error('Estudiante no encontrado');
    }

    // Eliminar estudiante
    await prisma.courseStudent.delete({
      where: { id: studentId },
    });

    return { message: 'Estudiante eliminado exitosamente' };
  }

  /**
   * Parsear archivo Excel/CSV y extraer estudiantes
   */
  parseSpreadsheet(buffer: Buffer, originalName: string): StudentData[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Tomar la primera hoja
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir a JSON
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length === 0) {
      throw new Error('El archivo está vacío');
    }

    // Detectar columnas de nombre y email
    const header = rows[0] as string[];
    let nameColIndex = -1;
    let emailColIndex = -1;

    // Buscar columnas por nombre (case-insensitive)
    for (let i = 0; i < header.length; i++) {
      const colName = String(header[i] || '').toLowerCase().trim();
      if (colName.includes('nombre') || colName === 'name' || colName === 'estudiante' || colName === 'alumno') {
        nameColIndex = i;
      }
      if (colName.includes('email') || colName.includes('correo') || colName.includes('mail')) {
        emailColIndex = i;
      }
    }

    // Si no encontramos columna de nombre, asumir primera columna
    if (nameColIndex === -1) {
      nameColIndex = 0;
    }

    // Extraer estudiantes (saltar header)
    const students: StudentData[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as any[];
      const name = String(row[nameColIndex] || '').trim();

      if (name.length > 0) {
        students.push({
          student_name: name,
          student_email: emailColIndex >= 0 ? String(row[emailColIndex] || '').trim() || undefined : undefined,
        });
      }
    }

    return students;
  }

  /**
   * Convertir spreadsheet a texto para análisis con IA
   */
  spreadsheetToText(buffer: Buffer): string {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir a CSV (texto plano)
    const csvContent = XLSX.utils.sheet_to_csv(sheet);
    return csvContent;
  }

  /**
   * Subir archivo Excel/CSV y agregar estudiantes (con análisis IA)
   */
  async uploadStudents(courseId: string, teacherId: string, buffer: Buffer, originalName: string) {
    // Verificar que el curso pertenece al profesor
    await this.getCourseById(courseId, teacherId);

    let students: StudentData[] = [];
    let usedAI = false;

    try {
      // Intentar primero con IA
      const textContent = this.spreadsheetToText(buffer);

      if (textContent.trim().length > 0) {
        console.log('📊 Analizando archivo con IA...');
        const aiStudents = await extractStudentsFromFile(textContent);

        if (aiStudents && aiStudents.length > 0) {
          students = aiStudents.map((s: { name: string; email?: string | null }) => ({
            student_name: s.name,
            student_email: s.email || undefined,
          }));
          usedAI = true;
          console.log(`✅ IA extrajo ${students.length} estudiantes`);
        }
      }
    } catch (aiError) {
      console.warn('⚠️ Error en análisis con IA, usando fallback manual:', aiError);
    }

    // Fallback: parseo manual si IA falla o no encuentra nada
    if (students.length === 0) {
      console.log('📋 Usando parseo manual...');
      students = this.parseSpreadsheet(buffer, originalName);
    }

    if (students.length === 0) {
      throw new Error('No se encontraron estudiantes en el archivo. Verifica que el archivo contenga nombres de estudiantes.');
    }

    // Agregar estudiantes
    const result = await this.addStudents(courseId, teacherId, students);

    return {
      ...result,
      analyzedWithAI: usedAI,
      preview: students.slice(0, 5).map(s => s.student_name), // Preview de primeros 5
    };
  }
}

// Exportar instancia única del servicio
export const coursesService = new CoursesService();
