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

        <div className="bg-white rounded-lg shadow-sm p-8 space-y-5 text-gray-700 text-[13px] leading-[1.7]">

          <p>
            Aproba es una plataforma de evaluaciones digitales que permite a docentes digitalizar pruebas existentes en formato PDF y generar hojas de respuesta digitales para sus estudiantes, incluyendo funcionalidades de corrección asistida por inteligencia artificial como herramienta de apoyo al proceso evaluativo. Al crear una cuenta o utilizar Aproba de cualquier forma, el usuario declara haber leído, comprendido y aceptado la totalidad de los presentes términos de servicio. En caso de no estar de acuerdo con alguna de las disposiciones aquí contenidas, el usuario deberá abstenerse de utilizar la plataforma.
          </p>

          <p>
            El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso en todo momento. Cada cuenta creada en la plataforma es personal e intransferible, y el usuario se compromete a proporcionar información veraz y actualizada al momento de registrarse. Aproba se reserva el derecho de suspender o eliminar, sin previo aviso, aquellas cuentas que infrinjan estos términos o que sean utilizadas de manera contraria a los fines para los cuales fue diseñada la plataforma.
          </p>

          <p>
            El usuario se compromete a utilizar la plataforma exclusivamente con fines educativos legítimos, absteniéndose de subir contenido ilegal, ofensivo o que infrinja derechos de propiedad intelectual de terceros. Queda expresamente prohibido compartir credenciales de acceso con terceros, así como intentar acceder a datos de otros usuarios o vulnerar de cualquier forma los mecanismos de seguridad de la plataforma. El incumplimiento de estas obligaciones podrá derivar en la terminación inmediata de la cuenta del usuario infractor.
          </p>

          <p>
            Los archivos, pruebas, materiales educativos y demás contenidos que el usuario suba a Aproba seguirán siendo de su exclusiva propiedad. Aproba no reclama ni adquiere derechos de propiedad sobre el contenido generado o subido por los usuarios. No obstante, al utilizar el servicio, el usuario otorga a Aproba una licencia limitada, no exclusiva y revocable para procesar dicho contenido con el único fin de proveer las funcionalidades de la plataforma, tales como la extracción de preguntas, la corrección automatizada y el almacenamiento necesario para la operación del servicio. La propiedad intelectual sobre la plataforma Aproba, incluyendo su código fuente, diseño, marca y demás elementos, pertenece íntegramente a sus desarrolladores.
          </p>

          <p>
            La corrección automática proporcionada por la plataforma constituye una herramienta de apoyo al proceso evaluativo y puede contener errores o imprecisiones. Los resultados generados por inteligencia artificial no constituyen una evaluación definitiva ni vinculante. Es responsabilidad exclusiva del docente revisar, validar y, en su caso, ajustar los resultados generados antes de comunicarlos a sus estudiantes o utilizarlos con cualquier finalidad académica. Aproba no garantiza la exactitud, completitud ni idoneidad de las correcciones generadas por sus sistemas de inteligencia artificial.
          </p>

          <p>
            Aproba se proporciona en su estado actual, sin garantías de ningún tipo, ya sean expresas o implícitas. Si bien se realizan esfuerzos razonables por mantener la plataforma disponible de forma continua, no se garantiza un funcionamiento ininterrumpido ni libre de errores. Podrán existir períodos de mantenimiento programado o interrupciones imprevistas derivadas de factores técnicos o de fuerza mayor. Aproba no será responsable por daños directos, indirectos, incidentales, especiales o consecuentes que pudieran derivarse del uso o la imposibilidad de uso de la plataforma, incluyendo sin limitación la pérdida de datos, errores en correcciones automatizadas o interrupciones del servicio.
          </p>

          <p>
            Aproba se reserva el derecho de modificar estos términos de servicio en cualquier momento y sin necesidad de consentimiento previo. Los cambios serán publicados en esta página con la correspondiente fecha de actualización y, cuando se considere oportuno, serán notificados a los usuarios a través de la plataforma. El uso continuado del servicio con posterioridad a cualquier modificación implica la aceptación plena e incondicional de los nuevos términos.
          </p>

          <p>
            Los presentes términos se rigen e interpretan de conformidad con las leyes vigentes de la República de Chile. Cualquier controversia que pudiera surgir en relación con el uso de la plataforma o la interpretación de estos términos será sometida a la jurisdicción de los tribunales ordinarios competentes de la ciudad de Santiago de Chile.
          </p>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-gray-500">
              Si tienes preguntas sobre estos términos, contáctanos en{' '}
              <a href="mailto:contacto@aproba.ai" className="text-[#14B8A6] hover:underline">contacto@aproba.ai</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
