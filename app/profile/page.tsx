import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Activity, Flame, Dumbbell } from "lucide-react";

export default function Profile() {
  return (
    <main className="flex-1 p-6 flex flex-col gap-6 pt-10 pb-24">
      <header className="mb-4">
        <h1 className="text-3xl font-bold text-gray-900">Il tuo Profilo</h1>
      </header>

      <div className="grid gap-4">
        <Card className="shadow-sm border-none bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-blue-700">
              <User className="h-5 w-5" /> Dati Personali
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Peso Attuale</span>
              <span className="font-semibold">75 kg</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Fabbisogno Giornaliero</span>
              <span className="font-semibold text-green-600">2400 kcal</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-orange-700">
              <Dumbbell className="h-5 w-5" /> Piano d'Allenamento
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <h3 className="font-bold mb-2">Settimana Attuale</h3>
            <ul className="space-y-3">
              <li>
                <div className="font-semibold text-blue-800">Lunedì - Gambe</div>
                <div className="text-gray-600 ml-2">- Squat 4x8</div>
                <div className="text-gray-600 ml-2">- Pressa Orizzontale 3x10</div>
                <div className="text-gray-600 ml-2">- Leg Extension 3x12</div>
              </li>
              <li>
                <div className="font-semibold text-blue-800">Mercoledì - Dorso e Bicipiti</div>
                <div className="text-gray-600 ml-2">- Trazioni 4xMax</div>
                <div className="text-gray-600 ml-2">- Rematore Bilanciere 4x8</div>
                <div className="text-gray-600 ml-2">- Curl Manubri 3x10</div>
              </li>
              <li>
                <div className="font-semibold text-blue-800">Venerdì - Petto e Tricipiti</div>
                <div className="text-gray-600 ml-2">- Panca Piana 4x8</div>
                <div className="text-gray-600 ml-2">- Croci ai Cavi 3x12</div>
                <div className="text-gray-600 ml-2">- French Press 3x12</div>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-green-700">
              <Flame className="h-5 w-5" /> Piano Alimentare
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
             <div className="mb-2 font-semibold">Tipo: Ricomposizione Corporea (Alto Carbo / Basso Grasso)</div>
             <ul className="space-y-3">
                <li>
                  <div className="font-semibold text-green-800">Lunedì - High Carb</div>
                  <div className="text-gray-600 ml-2"><span className="font-medium">Colazione:</span> 200ml latte parzialmente scremato, 40g cereali integrali, 1 misurino pro whey</div>
                  <div className="text-gray-600 ml-2"><span className="font-medium">Pranzo:</span> 120g riso basmati, 150g pollo, verdure</div>
                  <div className="text-gray-600 ml-2"><span className="font-medium">Cena:</span> 100g pane, 200g pesce magro, verdure e 1 cucchiaio olio evo</div>
                </li>
             </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
