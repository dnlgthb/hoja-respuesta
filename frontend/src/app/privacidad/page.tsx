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

        <div className="bg-white rounded-lg shadow-sm p-8 space-y-5 text-gray-700 text-[13px] leading-[1.7]">

          <p>
            Aproba es una plataforma de evaluaciones digitales. La presente política describe los datos personales que recopilamos, la finalidad de su tratamiento y las medidas adoptadas para su protección, en conformidad con la Ley N° 19.628 sobre Protección de la Vida Privada de la República de Chile y demás normativa aplicable.
          </p>

          <p>
            En el marco de la prestación de nuestros servicios, recopilamos datos de identificación de los docentes que crean una cuenta en la plataforma, tales como nombre completo, dirección de correo electrónico y contraseña, esta última almacenada en todo momento de forma cifrada. Cuando el docente se encuentra vinculado a una institución educativa, se registra además dicha asociación institucional. Respecto de los estudiantes, la plataforma almacena únicamente el nombre completo proporcionado por el docente y las respuestas registradas en las evaluaciones rendidas a través del sistema. Aproba no solicita ni recopila datos sensibles tales como RUT, dirección física, número de teléfono, datos biométricos ni información de geolocalización de ningún usuario. En el caso de estudiantes menores de edad, Aproba no recopila datos directamente de ellos; la información es ingresada exclusivamente por los docentes en el contexto de la relación educativa existente entre la institución y sus alumnos, y es responsabilidad de la institución educativa contar con las autorizaciones correspondientes de padres o apoderados para el uso de herramientas digitales en el proceso evaluativo. Adicionalmente, la plataforma almacena el contenido educativo subido por los docentes, incluyendo archivos PDF de pruebas, preguntas, alternativas y pautas de corrección.
          </p>

          <p>
            Los datos recopilados se utilizan exclusivamente para proveer el servicio de evaluaciones digitales, lo que comprende el procesamiento y corrección de evaluaciones mediante sistemas de inteligencia artificial, la generación de reportes de resultados para el docente y la comunicación con los usuarios respecto de su cuenta o el funcionamiento del servicio. Aproba no vende, comparte ni utiliza los datos personales de sus usuarios con fines publicitarios, de marketing, de elaboración de perfiles comerciales ni cualquier otro fin ajeno a la prestación del servicio educativo descrito en estos términos.
          </p>

          <p>
            Cuando un docente utiliza Aproba en el contexto de una institución educativa, es dicha institución quien actúa como responsable del tratamiento de los datos personales de sus estudiantes. Al utilizar la plataforma, el usuario declara contar con la autorización necesaria de su institución educativa para incorporar los datos de estudiantes al sistema. Aproba actúa como encargado del tratamiento, procesando los datos exclusivamente conforme a las instrucciones del responsable y para los fines descritos en la presente política.
          </p>

          <p>
            Para la prestación del servicio, Aproba utiliza proveedores tecnológicos externos que pueden procesar datos de forma transitoria en el contexto de sus funciones específicas, tales como servicios de procesamiento de documentos, inteligencia artificial, almacenamiento de archivos, bases de datos y alojamiento web. Dichos proveedores están sujetos a sus propias políticas de privacidad y han sido seleccionados considerando que cumplan con estándares de seguridad apropiados para la protección de la información.
          </p>

          <p>
            Aproba implementa medidas de seguridad orientadas a proteger la información de sus usuarios. Las contraseñas se almacenan mediante algoritmos de cifrado reconocidos en la industria, todas las comunicaciones entre el usuario y la plataforma se realizan a través de protocolo HTTPS con cifrado en tránsito, y el acceso a los servicios de la plataforma requiere autenticación. Los estudiantes acceden a las evaluaciones mediante códigos de acceso temporales generados por el docente, sin necesidad de crear una cuenta ni proporcionar datos adicionales. No obstante lo anterior, ningún sistema informático puede garantizar una seguridad absoluta, por lo que Aproba no puede asegurar que la información almacenada esté exenta de todo riesgo de acceso no autorizado.
          </p>

          <p>
            Los datos se conservan mientras la cuenta del usuario permanezca activa en la plataforma. En caso de que un docente solicite la eliminación de su cuenta, sus datos personales y los datos de evaluaciones asociados serán eliminados en un plazo razonable, salvo que exista una obligación legal que requiera su conservación por un período adicional.
          </p>

          <p>
            De acuerdo con la legislación chilena vigente, los usuarios tienen derecho a solicitar información sobre los datos personales que almacenamos, a solicitar la rectificación de datos inexactos, a solicitar la cancelación o eliminación de sus datos personales y a oponerse al tratamiento de los mismos. Para ejercer cualquiera de estos derechos, el usuario podrá contactarnos a través de los canales indicados al final de este documento, y su solicitud será atendida en los plazos establecidos por la normativa aplicable.
          </p>

          <p>
            La presente política podrá ser actualizada periódicamente para reflejar cambios en nuestras prácticas o en la normativa aplicable. Las modificaciones serán publicadas en esta página con la correspondiente fecha de última actualización. El uso continuado de la plataforma con posterioridad a cualquier modificación implica la aceptación de la política vigente en cada momento.
          </p>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-gray-500">
              Si tienes preguntas sobre esta política, contáctanos en{' '}
              <a href="mailto:contacto@aproba.ai" className="text-[#14B8A6] hover:underline">contacto@aproba.ai</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
