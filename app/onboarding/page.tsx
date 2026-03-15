'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

const LEVEL_OPTIONS = ['Principiante', 'Intermedio', 'Esperto'];
const GOAL_OPTIONS = ['Dimagrimento', 'Definizione', 'Mantenimento', 'Ipertrofia'];
const WEEKLY_AVAILABILITY_OPTIONS = ['1 giorno/sett.', '2 giorni/sett.', '3 giorni/sett.', '4 giorni/sett.', '5 giorni/sett.', '6 giorni/sett.', '7 giorni/sett.'];
const EQUIPMENT_OPTIONS = ['Corpo libero', 'Attrezzatura base in casa', 'Palestra attrezzata'];
const ATTITUDE_RECOVERY_OPTIONS = ['Lento', 'Normale', 'Rapido'];
const ATTITUDE_STRESS_OPTIONS = ['Basso', 'Medio', 'Alto'];
const ATTITUDE_INTENSITY_OPTIONS = ['Progressivo', 'Bilanciato', 'Spinto'];
const INTERACTIVE_STEPS = 4;

type Step = 0 | 1 | 2 | 3 | 4;

type SliderFieldProps = {
    label: string;
    reason: string;
    options: string[];
    value: number;
    onChange: (nextValue: number) => void;
};

function SliderField({ label, reason, options, value, onChange }: SliderFieldProps) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500 mt-1">{reason}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                    {options[value]}
                </span>
            </div>

            <input
                type="range"
                min={0}
                max={options.length - 1}
                step={1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-blue-600"
            />

            <div className="flex justify-between text-[11px] text-gray-400">
                <span>{options[0]}</span>
                <span>{options[options.length - 1]}</span>
            </div>
        </div>
    );
}

export default function Onboarding() {
    const router = useRouter();
    const [step, setStep] = useState<Step>(0);
    const [errorMessage, setErrorMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [formData, setFormData] = useState({
        username: '',
        altezza: '',
        eta: '',
        sesso: '',
        peso: '',
        disponibilitaSettimanaleIndex: 3,
        attitudineRecuperoIndex: 1,
        attitudineStressIndex: 1,
        attitudineIntensitaIndex: 1,
        livelloAttualeIndex: 1,
        obiettivoPrimarioIndex: 0,
        equipaggiamentoIndex: 1,
        allergiePresenti: false,
        allergieNote: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    useEffect(() => {
        if (!isLoading) return;

        const intervalId = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 92) return prev;
                const increment = Math.floor(Math.random() * 8) + 3;
                return Math.min(92, prev + increment);
            });
        }, 650);

        return () => clearInterval(intervalId);
    }, [isLoading]);

    const loadingMessage = useMemo(() => {
        if (progress < 20) return 'Sto conoscendo il tuo profilo...';
        if (progress < 45) return 'Sto analizzando i tuoi dati corporei...';
        if (progress < 70) return 'Sto pianificando i tuoi allenamenti...';
        if (progress < 95) return 'Sto preparando il menu settimanale...';
        return 'Sto rifinendo i dettagli finali...';
    }, [progress]);

    const validateStep = (currentStep: Step) => {
        if (currentStep === 0 && !formData.username.trim()) {
            return 'Inserisci il tuo nome per iniziare.';
        }

        if (currentStep === 1) {
            if (!formData.altezza.trim() || !formData.eta.trim() || !formData.sesso.trim() || !formData.peso.trim()) {
                return 'Compila tutti i dati corporei per proseguire.';
            }
        }

        if (currentStep === 3 && formData.allergiePresenti && !formData.allergieNote.trim()) {
            return 'Se hai indicato allergie o casi specifici, inserisci i dettagli alimentari.';
        }

        return '';
    };

    const nextStep = () => {
        const validationError = validateStep(step);
        if (validationError) {
            setErrorMessage(validationError);
            return;
        }

        setErrorMessage('');
        setStep((prev) => {
            if (prev === 0) return 1;
            if (prev === 1) return 2;
            if (prev === 2) return 3;
            return 4;
        });
    };

    const previousStep = () => {
        setErrorMessage('');
        setStep((prev) => {
            if (prev === 4) return 3;
            if (prev === 3) return 2;
            if (prev === 2) return 1;
            return 0;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (step < 3) {
            nextStep();
            return;
        }

        const validationError = validateStep(step);
        if (validationError) {
            setErrorMessage(validationError);
            return;
        }

        setErrorMessage('');
        setStep(4);
        setIsLoading(true);
        setProgress(8);

        try {
            const payload = {
                username: formData.username.trim(),
                eta: Number(formData.eta),
                sesso: formData.sesso,
                altezzaCm: Number(formData.altezza),
                pesoKg: Number(formData.peso),
                disponibilitaSettimanale: formData.disponibilitaSettimanaleIndex + 1,
                attitudineRecupero: ATTITUDE_RECOVERY_OPTIONS[formData.attitudineRecuperoIndex],
                attitudineStress: ATTITUDE_STRESS_OPTIONS[formData.attitudineStressIndex],
                attitudineIntensita: ATTITUDE_INTENSITY_OPTIONS[formData.attitudineIntensitaIndex],
                livelloAttuale: LEVEL_OPTIONS[formData.livelloAttualeIndex],
                obiettivoPrimario: GOAL_OPTIONS[formData.obiettivoPrimarioIndex],
                tempoDisponibile: WEEKLY_AVAILABILITY_OPTIONS[formData.disponibilitaSettimanaleIndex],
                equipaggiamento: EQUIPMENT_OPTIONS[formData.equipaggiamentoIndex],
                allergiePresenti: formData.allergiePresenti,
                allergieNote: formData.allergieNote.trim()
            };

            const res = await fetch('/api/generate-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setProgress(100);
                await new Promise((resolve) => setTimeout(resolve, 700));
                router.push('/');
            } else {
                throw new Error('Errore durante la generazione del piano.');
            }
        } catch (error) {
            console.error(error);
            setErrorMessage('Non sono riuscito a completare il piano. Riprova tra poco.');
            setStep(3);
            setProgress(0);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg shadow-xl border-none">
                <CardContent className="p-6">
                    <div className="text-center mb-6">
                        <h1 className="text-3xl font-black text-gray-900 mb-2">TrAIner</h1>
                        <p className="text-gray-500">Onboarding guidato per creare un piano davvero su misura.</p>
                    </div>

                    {step < 4 && (
                        <div className="mb-6">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                <span>Step {step + 1} di {INTERACTIVE_STEPS}</span>
                                <span>{Math.round(((step + 1) / INTERACTIVE_STEPS) * 100)}%</span>
                            </div>
                            <Progress value={((step + 1) / INTERACTIVE_STEPS) * 100} className="h-2" />
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {step === 0 && (
                            <section className="space-y-4">
                                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                                    <p className="text-blue-900 font-semibold">Piacere di conoscerti, io sono TrAIner.</p>
                                    <p className="text-blue-700 text-sm mt-1">Ho il piacere di parlare con...</p>
                                </div>

                                <div>
                                    <label className="text-sm font-semibold mb-1 block">Il tuo nome</label>
                                    <Input
                                        required
                                        name="username"
                                        value={formData.username}
                                        onChange={handleChange}
                                        placeholder="Es: Mario"
                                        autoFocus
                                    />
                                </div>
                            </section>
                        )}

                        {step === 1 && (
                            <section className="space-y-4">
                                <h2 className="text-lg font-bold text-gray-900">Dati corporei</h2>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold block">Altezza (cm)</label>
                                    <Input type="number" min="100" max="250" name="altezza" value={formData.altezza} onChange={handleChange} placeholder="Es: 178" required />
                                    <p className="text-xs text-gray-500">Mi serve per stimare meglio metabolismo e composizione del piano.</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold block">Età</label>
                                    <Input type="number" min="14" max="90" name="eta" value={formData.eta} onChange={handleChange} placeholder="Es: 30" required />
                                    <p className="text-xs text-gray-500">L’età influisce sul recupero e sulla distribuzione dei carichi.</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold block">Sesso</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['Uomo', 'Donna', 'Altro'].map((option) => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, sesso: option })}
                                                className={`h-10 rounded-lg border text-sm font-medium transition-colors ${formData.sesso === option
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500">Utile per una stima più coerente del fabbisogno energetico.</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold block">Peso (kg)</label>
                                    <Input type="number" min="30" max="250" name="peso" value={formData.peso} onChange={handleChange} placeholder="Es: 78" required />
                                    <p className="text-xs text-gray-500">Il peso mi serve per calcolare calorie, macro e progressione del piano.</p>
                                </div>
                            </section>
                        )}

                        {step === 2 && (
                            <section className="space-y-4">
                                <h2 className="text-lg font-bold text-gray-900">Sezione attitudinale</h2>

                                <p className="text-sm text-gray-500">
                                    Questo passaggio mi aiuta a calibrare progressione, volume e recupero in base al tuo comportamento reale.
                                </p>

                                <SliderField
                                    label="Disponibilità settimanale"
                                    reason="Fondamentale: indica su quanti giorni (1-7) posso organizzare il piano di allenamento."
                                    options={WEEKLY_AVAILABILITY_OPTIONS}
                                    value={formData.disponibilitaSettimanaleIndex}
                                    onChange={(nextValue) => setFormData({ ...formData, disponibilitaSettimanaleIndex: nextValue })}
                                />

                                <SliderField
                                    label="Qualità del recupero"
                                    reason="Sonno e recupero guidano la frequenza e il carico sostenibile degli allenamenti."
                                    options={ATTITUDE_RECOVERY_OPTIONS}
                                    value={formData.attitudineRecuperoIndex}
                                    onChange={(nextValue) => setFormData({ ...formData, attitudineRecuperoIndex: nextValue })}
                                />

                                <SliderField
                                    label="Stress quotidiano"
                                    reason="Un livello di stress più alto richiede una periodizzazione più conservativa."
                                    options={ATTITUDE_STRESS_OPTIONS}
                                    value={formData.attitudineStressIndex}
                                    onChange={(nextValue) => setFormData({ ...formData, attitudineStressIndex: nextValue })}
                                />

                                <SliderField
                                    label="Propensione all'intensità"
                                    reason="Definisce se privilegiare progressione graduale o stimolo più aggressivo."
                                    options={ATTITUDE_INTENSITY_OPTIONS}
                                    value={formData.attitudineIntensitaIndex}
                                    onChange={(nextValue) => setFormData({ ...formData, attitudineIntensitaIndex: nextValue })}
                                />
                            </section>
                        )}

                        {step === 3 && (
                            <section className="space-y-4">
                                <h2 className="text-lg font-bold text-gray-900">Preferenze operative</h2>

                                <SliderField
                                    label="Livello attuale"
                                    reason="Per calibrare volume e intensità iniziale in modo realistico."
                                    options={LEVEL_OPTIONS}
                                    value={formData.livelloAttualeIndex}
                                    onChange={(nextValue) => setFormData({ ...formData, livelloAttualeIndex: nextValue })}
                                />

                                <SliderField
                                    label="Obiettivo principale"
                                    reason="Per scegliere priorità tra performance, composizione corporea e mantenimento."
                                    options={GOAL_OPTIONS}
                                    value={formData.obiettivoPrimarioIndex}
                                    onChange={(nextValue) => setFormData({ ...formData, obiettivoPrimarioIndex: nextValue })}
                                />

                                <SliderField
                                    label="Equipaggiamento"
                                    reason="Mi serve per selezionare esercizi realmente fattibili nel tuo contesto."
                                    options={EQUIPMENT_OPTIONS}
                                    value={formData.equipaggiamentoIndex}
                                    onChange={(nextValue) => setFormData({ ...formData, equipaggiamentoIndex: nextValue })}
                                />

                                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                                    <div>
                                        <p className="font-semibold text-gray-900">Allergie o casi alimentari specifici</p>
                                        <p className="text-xs text-gray-500 mt-1">Questa informazione viene passata all'AI per costruire un piano nutrizionale sicuro e aderente.</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, allergiePresenti: false, allergieNote: '' })}
                                            className={`h-10 rounded-lg border text-sm font-medium transition-colors ${!formData.allergiePresenti
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            Nessuna
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, allergiePresenti: true })}
                                            className={`h-10 rounded-lg border text-sm font-medium transition-colors ${formData.allergiePresenti
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            Presenti
                                        </button>
                                    </div>

                                    {formData.allergiePresenti && (
                                        <div className="space-y-1">
                                            <label className="text-sm font-semibold block">Dettagli alimentari</label>
                                            <Input
                                                name="allergieNote"
                                                value={formData.allergieNote}
                                                onChange={handleChange}
                                                placeholder="Es: allergia arachidi, intolleranza lattosio, dieta vegetariana..."
                                            />
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {step === 4 && (
                            <section className="space-y-5 py-2">
                                <div className="flex items-center justify-center">
                                    <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center">
                                        <Sparkles className="w-6 h-6 text-blue-600" />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-gray-900">Preparazione del tuo piano personalizzato</p>
                                    <p className="text-sm text-gray-500 mt-1">{loadingMessage}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span>Completamento</span>
                                        <span>{Math.round(progress)}%</span>
                                    </div>
                                    <Progress value={progress} className="h-2.5" />
                                </div>
                                <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Ti tengo aggiornato passo per passo...</span>
                                </div>
                            </section>
                        )}

                        {errorMessage && (
                            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                {errorMessage}
                            </p>
                        )}

                        {step < 4 && (
                            <div className="flex gap-2 pt-2">
                                {step > 0 && (
                                    <Button type="button" variant="outline" className="flex-1" onClick={previousStep}>
                                        <ArrowLeft className="w-4 h-4 mr-2" /> Indietro
                                    </Button>
                                )}

                                {step < 3 ? (
                                    <Button type="button" onClick={nextStep} className="flex-1 bg-blue-600 hover:bg-blue-700">
                                        Continua <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                ) : (
                                    <Button type="submit" disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 h-11">
                                        Genera il Mio Piano <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                )}
                            </div>
                        )}
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
