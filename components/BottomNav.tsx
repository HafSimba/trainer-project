import Link from 'next/link';

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 z-40 pb-safe">
      <div className="flex justify-around items-center h-16">
        <Link href="/" className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-blue-500">
          <span className="text-[10px] mt-1 font-medium">Home</span>
        </Link>
        <Link href="/diary" className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-blue-500">
          <span className="text-[10px] mt-1 font-medium">Diario</span>
        </Link>
        <Link href="/profile" className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-blue-500">
          <span className="text-[10px] mt-1 font-medium">Profilo</span>
        </Link>
      </div>
    </nav>
  );
}
