import Link from 'next/link';
import { Home, User, Utensils } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 z-40 pb-safe">
      <div className="flex justify-around items-center h-16">
        <Link href="/" className={\lex flex-col items-center justify-center w-full h-full \\}>
          <Home className="h-6 w-6" />
          <span className="text-[10px] mt-1 font-medium">Home</span>
        </Link>
        <Link href="/diary" className={\lex flex-col items-center justify-center w-full h-full \\}>
          <Utensils className="h-6 w-6" />
          <span className="text-[10px] mt-1 font-medium">Diario</span>
        </Link>
        <Link href="/profile" className={\lex flex-col items-center justify-center w-full h-full \\}>
          <User className="h-6 w-6" />
          <span className="text-[10px] mt-1 font-medium">Profilo</span>
        </Link>
      </div>
    </nav>
  );
}
