'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Apple, Zap, Camera } from "lucide-react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [showScanner, setShowScanner] = useState(false);
  const [lastScannedProduct, setLastScannedProduct] = useState<any>(null);

  const handleProductFound = (product: any) => {
    setLastScannedProduct(product);
    setShowScanner(false);
    console.log("Prodotto Trovato:", product);
  };

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
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-semibold">Pasti di oggi</h2>
          <Button variant="outline" size="sm" onClick={() => setShowScanner(!showScanner)}>
            <Camera className="w-4 h-4 mr-2" /> Scannerizza
          </Button>
        </div>

        {showScanner && (
          <div className="mb-4">
            <BarcodeScanner onProductFound={handleProductFound} />
          </div>
        )}

        {lastScannedProduct && (
          <Card className="shadow-sm bg-white mb-4 border-green-200">
            <CardContent className="p-4">
              <p className="font-bold text-green-700">Prodotto Trovato!</p>
              <p className="text-sm">{lastScannedProduct.product_name}</p>
              <div className="text-xs text-gray-500 mt-2">
                <span className="mr-3">🔥 {lastScannedProduct.nutriments?.energy_kcal_100g || 0} kcal</span>
                <span className="mr-3">🥩 {lastScannedProduct.nutriments?.proteins_100g || 0}g pro</span>
                <span>🍞 {lastScannedProduct.nutriments?.carbohydrates_100g || 0}g carbo</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm bg-white">
          <CardContent className="p-4">
            <p className="text-sm text-gray-600">Nessun pasto registrato.</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
