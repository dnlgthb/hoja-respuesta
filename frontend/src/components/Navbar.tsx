'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout } from '@/lib/auth';
import { LogOut, BookOpen, Users } from 'lucide-react';
import { ROUTES } from '@/config/constants';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = getCurrentUser();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo y Navegación */}
        <div className="flex items-center gap-8">
          <Link href={ROUTES.DASHBOARD} className="text-2xl font-bold text-primary">
            Mi Hoja
          </Link>

          {/* Links de navegación */}
          <div className="flex items-center gap-1">
            <Link
              href={ROUTES.DASHBOARD}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                isActive('/dashboard')
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Pruebas</span>
            </Link>
            <Link
              href={ROUTES.COURSES}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                isActive('/cursos')
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Cursos</span>
            </Link>
          </div>
        </div>

        {/* Usuario y Logout */}
        <div className="flex items-center gap-4">
          <span className="text-gray-700 font-medium">
            {user?.name || 'Profesor'}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-primary hover:bg-gray-50 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
