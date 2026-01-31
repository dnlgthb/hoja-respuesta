'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout } from '@/lib/auth';
import { LogOut, BookOpen, Users, CheckCircle } from 'lucide-react';
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
    <nav className="bg-[#1F2937] px-6 py-4 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo y Navegación */}
        <div className="flex items-center gap-8">
          <Link href={ROUTES.DASHBOARD} className="flex items-center gap-2">
            <div className="flex items-center">
              <span className="logo-aproba text-2xl text-white">Aproba</span>
              <CheckCircle className="w-5 h-5 text-[#14B8A6] ml-1 -mt-1" strokeWidth={3} />
            </div>
          </Link>

          {/* Links de navegación */}
          <div className="flex items-center gap-1">
            <Link
              href={ROUTES.DASHBOARD}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                isActive('/dashboard')
                  ? 'bg-[#14B8A6] text-white'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Pruebas</span>
            </Link>
            <Link
              href={ROUTES.COURSES}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                isActive('/cursos')
                  ? 'bg-[#14B8A6] text-white'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Cursos</span>
            </Link>
          </div>
        </div>

        {/* Usuario y Logout */}
        <div className="flex items-center gap-4">
          <span className="text-gray-300 font-medium">
            {user?.name || 'Profesor'}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
