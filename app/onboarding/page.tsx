'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Onboarding() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        etaGenere: '',
        peso: '',
        livelloAttuale: '',
        obiettivoPrimario: '',
        tempoDisponibile: '',
        equipaggiamento: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch('/api/generate-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                // Generazione completata e salvata su server.
                router.push('/');
            } else {
                console.error("Errore durante la generazione");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg shadow-xl border-none">
                <CardContent className="p-6">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-black text-gray-900 mb-2">TrAIner</h1>
                        <p className="text-gray-500">Configura il tuo profilo. L'intelligenza artificiale preparerà il tuo piano personalizzato.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-sm font-semibold mb-1 block">Come ti chiami?</label>
                            <Input required name="username" value={formData.username} onChange={handleChange} placeholder="Es: Mario" />
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-1 block">Età e Genere</label>
                            <Input required name="etaGenere" value={formData.etaGenere} onChange={handleChange} placeholder="Es: Uomo, 32 anni" />
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-1 block">Peso Corporeo</label>
                            <Input required name="peso" value={formData.peso} onChange={handleChange} placeholder="Es: 78 kg" />
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-1 block">Livello Attuale</label>
                            <Input required name="livelloAttuale" value={formData.livelloAttuale} onChange={handleChange} placeholder="Es: Intermedio - mi alleno da 2 anni" />
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-1 block">Obiettivo Primario</label>
                            <Input required name="obiettivoPrimario" value={formData.obiettivoPrimario} onChange={handleChange} placeholder="Es: Ipertrofia con focus gambe" />
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-1 block">Tempo Disponibile</label>
                            <Input required name="tempoDisponibile" value={formData.tempoDisponibile} onChange={handleChange} placeholder="Es: 4 giorni a settimana, 75 min" />
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-1 block">Equipaggiamento a Disposizione</label>
                            <Input required name="equipaggiamento" value={formData.equipaggiamento} onChange={handleChange} placeholder="Es: Palestra completa + sbarra a casa" />
                        </div>

                        <Button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-lg mt-6">
                            {isLoading ? (
                                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Creazione in corso (può volerci 1 minuto)...</>
                            ) : (
                                <>Genera Piano Personalizzato <ArrowRight className="w-5 h-5 ml-2" /></>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
