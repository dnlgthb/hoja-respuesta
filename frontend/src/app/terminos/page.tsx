'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-[#FBF9F3] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/login" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-8">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Servicio</h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: 28 de febrero de 2026</p>

        <div className="bg-white rounded-lg shadow-sm p-8 space-y-6 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Descripción del servicio</h2>
            <p>
              Aproba es una plataforma de evaluaciones digitales que permite a docentes digitalizar pruebas existentes
              (en formato PDF) y generar hojas de respuesta digitales para sus estudiantes. La plataforma incluye
              corrección asistida por inteligencia artificial como herramienta de apoyo al proceso evaluativo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Aceptación de los términos</h2>
            <p>
              Al crear una cuenta o utilizar Aproba, el usuario acepta estos términos de servicio en su totalidad.
              Si no está de acuerdo con alguno de estos términos, no debe utilizar la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Cuentas de usuario</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso.</li>
              <li>Cada cuenta es personal e intransferible.</li>
              <li>El usuario debe proporcionar información veraz al registrarse.</li>
              <li>Aproba se reserva el derecho de suspender o eliminar cuentas que infrinjan estos términos.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Uso aceptable</h2>
            <p className="mb-2">El usuario se compromete a:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Utilizar la plataforma exclusivamente con fines educativos legítimos.</li>
              <li>No subir contenido ilegal, ofensivo o que infrinja derechos de terceros.</li>
              <li>No compartir sus credenciales de acceso con terceros.</li>
              <li>No intentar acceder a datos de otros usuarios o vulnerar la seguridad de la plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Propiedad del contenido</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Los archivos, pruebas y materiales que el usuario sube a Aproba siguen siendo de su propiedad.</li>
              <li>Aproba no reclama derechos de propiedad sobre el contenido del usuario.</li>
              <li>El usuario otorga a Aproba una licencia limitada para procesar su contenido con el único fin de proveer el servicio (extracción de preguntas, corrección, almacenamiento).</li>
              <li>La propiedad intelectual de la plataforma Aproba (código, diseño, marca) pertenece a sus desarrolladores.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Corrección asistida por IA</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>La corrección automática es una <strong>herramienta de apoyo</strong> y puede contener errores.</li>
              <li>Los resultados generados por IA no constituyen una evaluación definitiva.</li>
              <li>El docente es responsable de revisar y validar los resultados antes de comunicarlos a sus estudiantes.</li>
              <li>Aproba no garantiza la exactitud de las correcciones generadas por inteligencia artificial.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Disponibilidad del servicio</h2>
            <p>
              Aproba se proporciona &quot;tal cual&quot; (as is). Si bien nos esforzamos por mantener la plataforma
              disponible de forma continua, no garantizamos un funcionamiento ininterrumpido. Podrán existir
              períodos de mantenimiento o interrupciones imprevistas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Limitación de responsabilidad</h2>
            <p>
              Aproba no será responsable por daños directos, indirectos, incidentales o consecuentes derivados
              del uso de la plataforma, incluyendo pero no limitado a: pérdida de datos, errores en correcciones
              automatizadas, o interrupciones del servicio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Modificaciones</h2>
            <p>
              Aproba podrá modificar estos términos en cualquier momento. Los cambios serán notificados
              a los usuarios a través de la plataforma. El uso continuado del servicio después de una
              modificación implica la aceptación de los nuevos términos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Legislación aplicable</h2>
            <p>
              Estos términos se rigen por las leyes de la República de Chile. Cualquier controversia
              será sometida a los tribunales competentes de la ciudad de Santiago.
            </p>
          </section>

          <section className="pt-4 border-t border-gray-200">
            <p className="text-gray-500">
              Si tienes preguntas sobre estos términos, contáctanos en{' '}
              <a href="mailto:contacto@aproba.ai" className="text-[#14B8A6] hover:underline">contacto@aproba.ai</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
