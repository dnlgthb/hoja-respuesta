'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-[#FBF9F3] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/login" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-8">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: 28 de febrero de 2026</p>

        <div className="bg-white rounded-lg shadow-sm p-8 space-y-6 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Información general</h2>
            <p>
              Aproba es una plataforma de evaluaciones digitales. Esta política describe qué datos personales
              recopilamos, cómo los utilizamos y qué medidas tomamos para protegerlos, en conformidad con
              la Ley N° 19.628 sobre Protección de la Vida Privada de Chile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Datos que recopilamos</h2>

            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.1 Datos de docentes</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nombre completo</li>
              <li>Dirección de correo electrónico</li>
              <li>Contraseña (almacenada en forma cifrada)</li>
              <li>Institución educativa (cuando corresponda)</li>
            </ul>

            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.2 Datos de estudiantes</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nombre completo (proporcionado por el docente)</li>
              <li>Respuestas a evaluaciones</li>
            </ul>
            <p className="mt-2 text-gray-600">
              No recopilamos RUT, dirección, teléfono ni otros datos sensibles de los estudiantes.
              No recopilamos datos biométricos ni de geolocalización.
            </p>

            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.3 Contenido educativo</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Archivos PDF de pruebas subidos por docentes</li>
              <li>Preguntas, alternativas y pautas de corrección</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Finalidad del tratamiento</h2>
            <p className="mb-2">Los datos recopilados se utilizan exclusivamente para:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Proveer el servicio de evaluaciones digitales.</li>
              <li>Procesar y corregir evaluaciones mediante inteligencia artificial.</li>
              <li>Generar reportes de resultados para el docente.</li>
              <li>Comunicarnos con los usuarios sobre su cuenta o el servicio.</li>
            </ul>
            <p className="mt-3 font-medium text-gray-800">
              No vendemos, compartimos ni utilizamos los datos personales con fines publicitarios,
              de marketing o cualquier otro fin ajeno al servicio educativo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Rol de la institución educativa</h2>
            <p>
              Cuando un docente utiliza Aproba en el contexto de una institución educativa, es la
              institución quien actúa como responsable del tratamiento de los datos personales de sus
              estudiantes. Al utilizar la plataforma, el usuario declara contar con la autorización
              necesaria de su institución educativa para incorporar los datos de estudiantes al sistema.
            </p>
            <p className="mt-2">
              Aproba actúa como <strong>encargado del tratamiento</strong>, procesando los datos
              exclusivamente según las instrucciones del responsable (la institución o el docente)
              y para los fines descritos en esta política.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Servicios de terceros</h2>
            <p className="mb-2">
              Para proveer el servicio, Aproba utiliza los siguientes servicios externos que pueden
              procesar datos de forma transitoria:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Mathpix</strong>: procesamiento OCR de documentos PDF (extracción de texto).</li>
              <li><strong>OpenAI</strong>: identificación de preguntas y corrección asistida por IA.</li>
              <li><strong>Supabase</strong>: almacenamiento de archivos.</li>
              <li><strong>Neon</strong>: base de datos PostgreSQL.</li>
              <li><strong>Vercel</strong>: hosting del sitio web.</li>
              <li><strong>Railway</strong>: hosting del servidor backend.</li>
            </ul>
            <p className="mt-2">
              Estos servicios están sujetos a sus propias políticas de privacidad y cumplen con
              estándares de seguridad de la industria.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Datos de menores de edad</h2>
            <p>
              Aproba no recopila datos directamente de menores de edad. Los datos de estudiantes son
              ingresados por docentes en el contexto de la relación educativa existente entre la
              institución y sus alumnos. La institución educativa es responsable de contar con las
              autorizaciones correspondientes de los padres o apoderados para el uso de herramientas
              digitales en el proceso educativo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Seguridad de los datos</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Las contraseñas se almacenan cifradas mediante algoritmo bcrypt.</li>
              <li>Las comunicaciones se realizan mediante protocolo HTTPS.</li>
              <li>El acceso a la API requiere autenticación mediante token JWT.</li>
              <li>Los estudiantes acceden a las evaluaciones mediante códigos de acceso temporales, sin necesidad de crear una cuenta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Retención de datos</h2>
            <p>
              Los datos se conservan mientras la cuenta del usuario esté activa. Si un docente
              elimina su cuenta, sus datos personales y los datos de evaluaciones asociados serán
              eliminados en un plazo razonable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Derechos del usuario</h2>
            <p className="mb-2">De acuerdo con la legislación chilena, el usuario tiene derecho a:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Acceso</strong>: solicitar información sobre los datos personales que almacenamos.</li>
              <li><strong>Rectificación</strong>: corregir datos inexactos.</li>
              <li><strong>Cancelación</strong>: solicitar la eliminación de sus datos personales.</li>
              <li><strong>Oposición</strong>: oponerse al tratamiento de sus datos.</li>
            </ul>
            <p className="mt-2">
              Para ejercer estos derechos, contactar a{' '}
              <a href="mailto:contacto@aproba.ai" className="text-[#14B8A6] hover:underline">contacto@aproba.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Modificaciones</h2>
            <p>
              Esta política podrá ser actualizada periódicamente. Los cambios serán publicados en
              esta página con la fecha de última actualización. El uso continuado de la plataforma
              implica la aceptación de la política vigente.
            </p>
          </section>

          <section className="pt-4 border-t border-gray-200">
            <p className="text-gray-500">
              Si tienes preguntas sobre esta política, contáctanos en{' '}
              <a href="mailto:contacto@aproba.ai" className="text-[#14B8A6] hover:underline">contacto@aproba.ai</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
