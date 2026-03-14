import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Apple, Zap } from "lucide-react";

export default function Dashboard() {
  return (
    <main className="flex-1 p-6 flex flex-col gap-6 pt-10 pb-24">
      <header className="mb-4">
        <h1 className="text-3xl font-bold text-gray-900">Ciao! 👋</h1>
        <p className="text-gray-500 mt-1">Ecco il riepilogo di oggi.</p>
      </header>

      <div className="grid gap-4">
        <Card className="shadow-sm border-none bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-blue-700">
              <Zap className="h-5 w-5" /> Energia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Ottima</p>
            <p className="text-sm text-gray-500 mt-1">Sulla base del tuo riposo</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="shadow-sm border-none bg-green-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                <Apple className="h-4 w-4" /> Nutrizione
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">1.850</p>
              <p className="text-xs text-gray-500 mt-1">kcal assunte</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-none bg-orange-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-orange-700">
                <Activity className="h-4 w-4" /> Attività
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">45 min</p>
              <p className="text-xs text-gray-500 mt-1">Allenamento</p>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <section className="mt-4">
        <h2 className="text-xl font-semibold mb-3">Obiettivi</h2>
        <Card className="shadow-sm bg-white">
          <CardContent className="p-4">
            <p className="text-sm text-gray-600">Completa altri 2 allenamenti di forza per raggiungere il tuo obiettivo settimanale.</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
