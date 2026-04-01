'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { extractApiError, readJsonResponse } from '@/lib/utils';

const LEVEL_OPTIONS = ['Principiante', 'Intermedio', 'Esperto'];
const GOAL_OPTIONS = ['Dimagrimento', 'Definizione', 'Mantenimento', 'Ipertrofia'];
const WEEKLY_AVAILABILITY_OPTIONS = ['1 giorno/sett.', '2 giorni/sett.', '3 giorni/sett.', '4 giorni/sett.', '5 giorni/sett.', '6 giorni/sett.', '7 giorni/sett.'];
const EQUIPMENT_OPTIONS = ['Corpo libero', 'Attrezzatura base in casa', 'Palestra attrezzata'];
const ATTITUDE_RECOVERY_OPTIONS = ['Lento', 'Normale', 'Rapido'];
const ATTITUDE_STRESS_OPTIONS = ['Basso', 'Medio', 'Alto'];
const ATTITUDE_INTENSITY_OPTIONS = ['Progressivo', 'Bilanciato', 'Spinto'];
const INTERACTIVE_STEPS = 4;

type Step = 0 | 1 | 2 | 3 | 4;
type AllergyChoice = '' | 'nessuna' | 'presenti';

type OnboardingFormData = {
    username: string;
    obiettivoPersonale: string;
    altezza: string;
    eta: string;
    sesso: string;
    peso: string;
    disponibilitaSettimanaleIndex: number;
    attitudineRecuperoIndex: number;
    attitudineStressIndex: number;
    attitudineIntensitaIndex: number;
    livelloAttualeIndex: number;
    obiettivoPrimarioIndex: number;
    equipaggiamentoIndex: number;
    allergieScelta: AllergyChoice;
    allergieNote: string;
};

type GeneratePlanApiResponse = {
    success?: boolean;
    error?: string;
    message?: string;
};

const INITIAL_FORM_DATA: OnboardingFormData = {
    username: '',
    obiettivoPersonale: '',
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
    allergieScelta: '',
    allergieNote: ''
};

function getNextStep(currentStep: Step): Step {
    if (currentStep === 0) return 1;
    if (currentStep === 1) return 2;
    if (currentStep === 2) return 3;
    return 4;
}

function getPreviousStep(currentStep: Step): Step {
    if (currentStep === 4) return 3;
    if (currentStep === 3) return 2;
    if (currentStep === 2) return 1;
    return 0;
}

function getInteractiveProgress(currentStep: Step): number {
    return ((currentStep + 1) / INTERACTIVE_STEPS) * 100;
}

function buildGeneratePlanPayload(formData: OnboardingFormData) {
    return {
        username: formData.username.trim(),
        obiettivoPersonale: formData.obiettivoPersonale.trim(),
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
        allergiePresenti: formData.allergieScelta === 'presenti',
        allergieNote: formData.allergieNote.trim()
    };
}

type SliderFieldProps = {
    label: string;
    reason: string;
    options: string[];
    value: number;
    onChange: (nextValue: number) => void;
};

function SliderField({ label, reason, options, value, onChange }: SliderFieldProps) {
    return (
        <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-semibold text-foreground">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{reason}</p>
                </div>
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
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
                className="w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2"
            />

            <div className="flex justify-between text-[11px] text-muted-foreground">
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
    const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_FORM_DATA);

    const updateFormField = <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const fieldName = e.target.name as keyof OnboardingFormData;
        setFormData((prev) => ({ ...prev, [fieldName]: e.target.value }));
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

    const interactiveProgress = useMemo(() => getInteractiveProgress(step), [step]);

    const validateStep = (currentStep: Step) => {
        if (currentStep === 0) {
            if (!formData.username.trim()) return 'Inserisci il tuo nome per iniziare.';
            if (!formData.obiettivoPersonale.trim()) return 'Descrivi brevemente il tuo obiettivo.';
        }

        if (currentStep === 1) {
            if (!formData.altezza.trim() || !formData.eta.trim() || !formData.sesso.trim() || !formData.peso.trim()) {
                return 'Compila tutti i dati corporei per proseguire.';
            }
        }

        if (currentStep === 3 && !formData.allergieScelta) {
            return 'Rispondi alla domanda su allergie/casi alimentari specifici (Sì o No).';
        }

        if (currentStep === 3 && formData.allergieScelta === 'presenti' && !formData.allergieNote.trim()) {
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
        setStep((prev) => getNextStep(prev));
    };

    const previousStep = () => {
        setErrorMessage('');
        setStep((prev) => getPreviousStep(prev));
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
            const payload = buildGeneratePlanPayload(formData);

            const res = await fetch('/api/generate-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await readJsonResponse<GeneratePlanApiResponse>(res);

            if (res.ok) {
                setProgress(100);
                await new Promise((resolve) => setTimeout(resolve, 700));
                router.push('/');
            } else {
                throw new Error(extractApiError(data) || 'Errore durante la generazione del piano.');
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
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
            <Card className="motion-enter mx-auto w-full max-w-lg border border-border/80 bg-card/95 shadow-lg backdrop-blur-sm">
                <CardContent className="p-5 sm:p-6">
                    <div className="mb-6 rounded-2xl bg-gradient-to-br from-primary via-primary to-emerald-700 px-4 py-5 text-primary-foreground motion-enter motion-fast motion-delay-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/85">Profilazione smart</p>
                        <h1 className="mt-2 text-3xl font-black">TrAIner</h1>
                        <p className="mt-1 text-sm text-primary-foreground/90">Onboarding guidato per creare un piano realmente su misura.</p>
                    </div>

                    {step < 4 && (
                        <div className="mb-6 motion-enter motion-fast motion-delay-2">
                            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                                <span>Step {step + 1} di {INTERACTIVE_STEPS}</span>
                                <span>{Math.round(interactiveProgress)}%</span>
                            </div>
                            <Progress aria-label="Progressione step onboarding" value={interactiveProgress} className="h-2 rounded-full bg-muted" />
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5 motion-enter motion-delay-2" noValidate>
                        {step === 0 && (
                            <section className="space-y-4 motion-enter motion-delay-1">
                                <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
                                    <p className="font-semibold text-primary">Piacere di conoscerti, io sono TrAIner.</p>
                                    <p className="mt-1 text-sm text-primary/90">Ho il piacere di parlare con...</p>
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

                                <div>
                                    <label className="text-sm font-semibold mb-1 block">Qual è il tuo obiettivo con TrAIner?</label>
                                    <textarea
                                        required
                                        name="obiettivoPersonale"
                                        value={formData.obiettivoPersonale}
                                        onChange={handleChange as unknown as React.ChangeEventHandler<HTMLTextAreaElement>}
                                        placeholder="Es: Voglio rimettermi in forma per l'estate, voglio correre una maratona tra 6 mesi..."
                                        className="flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        rows={3}
                                    />
                                </div>
                            </section>
                        )}

                        {step === 1 && (
                            <section className="space-y-4 motion-enter motion-delay-1">
                                <h2 className="text-lg font-bold text-foreground">Dati corporei</h2>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold block">Altezza (cm)</label>
                                    <Input type="number" min="100" max="250" name="altezza" value={formData.altezza} onChange={handleChange} placeholder="Es: 178" required />
                                    <p className="text-xs text-muted-foreground">Mi serve per stimare meglio metabolismo e composizione del piano.</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold block">Età</label>
                                    <Input type="number" min="14" max="90" name="eta" value={formData.eta} onChange={handleChange} placeholder="Es: 30" required />
                                    <p className="text-xs text-muted-foreground">L’età influisce sul recupero e sulla distribuzione dei carichi.</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold block">Sesso</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['Uomo', 'Donna', 'Altro'].map((option) => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => updateFormField('sesso', option)}
                                                aria-pressed={formData.sesso === option}
                                                className={`h-10 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 ${formData.sesso === option
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border bg-card text-foreground hover:bg-surface-soft'
                                                    }`}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">Utile per una stima più coerente del fabbisogno energetico.</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold block">Peso (kg)</label>
                                    <Input type="number" min="30" max="250" name="peso" value={formData.peso} onChange={handleChange} placeholder="Es: 78" required />
                                    <p className="text-xs text-muted-foreground">Il peso mi serve per calcolare calorie, macro e progressione del piano.</p>
                                </div>
                            </section>
                        )}

                        {step === 2 && (
                            <section className="space-y-4 motion-enter motion-delay-1">
                                <h2 className="text-lg font-bold text-foreground">Sezione attitudinale</h2>

                                <p className="text-sm text-muted-foreground">
                                    Questo passaggio mi aiuta a calibrare progressione, volume e recupero in base al tuo comportamento reale.
                                </p>

                                <SliderField
                                    label="Disponibilità settimanale"
                                    reason="Fondamentale: indica su quanti giorni (1-7) posso organizzare il piano di allenamento."
                                    options={WEEKLY_AVAILABILITY_OPTIONS}
                                    value={formData.disponibilitaSettimanaleIndex}
                                    onChange={(nextValue) => updateFormField('disponibilitaSettimanaleIndex', nextValue)}
                                />

                                <SliderField
                                    label="Qualità del recupero"
                                    reason="Sonno e recupero guidano la frequenza e il carico sostenibile degli allenamenti."
                                    options={ATTITUDE_RECOVERY_OPTIONS}
                                    value={formData.attitudineRecuperoIndex}
                                    onChange={(nextValue) => updateFormField('attitudineRecuperoIndex', nextValue)}
                                />

                                <SliderField
                                    label="Stress quotidiano"
                                    reason="Un livello di stress più alto richiede una periodizzazione più conservativa."
                                    options={ATTITUDE_STRESS_OPTIONS}
                                    value={formData.attitudineStressIndex}
                                    onChange={(nextValue) => updateFormField('attitudineStressIndex', nextValue)}
                                />

                                <SliderField
                                    label="Propensione all'intensità"
                                    reason="Definisce se privilegiare progressione graduale o stimolo più aggressivo."
                                    options={ATTITUDE_INTENSITY_OPTIONS}
                                    value={formData.attitudineIntensitaIndex}
                                    onChange={(nextValue) => updateFormField('attitudineIntensitaIndex', nextValue)}
                                />
                            </section>
                        )}

                        {step === 3 && (
                            <section className="space-y-4 motion-enter motion-delay-1">
                                <h2 className="text-lg font-bold text-foreground">Preferenze operative</h2>

                                <SliderField
                                    label="Livello attuale"
                                    reason="Per calibrare volume e intensità iniziale in modo realistico."
                                    options={LEVEL_OPTIONS}
                                    value={formData.livelloAttualeIndex}
                                    onChange={(nextValue) => updateFormField('livelloAttualeIndex', nextValue)}
                                />

                                <SliderField
                                    label="Obiettivo principale"
                                    reason="Per scegliere priorità tra performance, composizione corporea e mantenimento."
                                    options={GOAL_OPTIONS}
                                    value={formData.obiettivoPrimarioIndex}
                                    onChange={(nextValue) => updateFormField('obiettivoPrimarioIndex', nextValue)}
                                />

                                <SliderField
                                    label="Equipaggiamento"
                                    reason="Mi serve per selezionare esercizi realmente fattibili nel tuo contesto."
                                    options={EQUIPMENT_OPTIONS}
                                    value={formData.equipaggiamentoIndex}
                                    onChange={(nextValue) => updateFormField('equipaggiamentoIndex', nextValue)}
                                />

                                <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
                                    <div>
                                        <p className="font-semibold text-foreground">Hai allergie o casi alimentari specifici?</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Esempi: celiachia, intolleranza al lattosio, allergia a frutta secca. Questo dato è usato direttamente dall’AI nel piano alimentare.</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormData((prev) => ({ ...prev, allergieScelta: 'nessuna', allergieNote: '' }))}
                                            aria-pressed={formData.allergieScelta === 'nessuna'}
                                            className={`h-10 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 ${formData.allergieScelta === 'nessuna'
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-card text-foreground hover:bg-surface-soft'
                                                }`}
                                        >
                                            No
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateFormField('allergieScelta', 'presenti')}
                                            aria-pressed={formData.allergieScelta === 'presenti'}
                                            className={`h-10 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 ${formData.allergieScelta === 'presenti'
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-card text-foreground hover:bg-surface-soft'
                                                }`}
                                        >
                                            Sì
                                        </button>
                                    </div>

                                    {formData.allergieScelta === 'presenti' && (
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
                            <section className="space-y-5 py-2 motion-enter motion-delay-1" aria-live="polite">
                                <div className="flex items-center justify-center">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                                        <Sparkles className="h-6 w-6 text-primary" />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-foreground">Preparazione del tuo piano personalizzato</p>
                                    <p className="mt-1 text-sm text-muted-foreground">{loadingMessage}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>Completamento</span>
                                        <span>{Math.round(progress)}%</span>
                                    </div>
                                    <Progress aria-label="Progressione generazione piano" value={progress} className="h-2.5 rounded-full bg-muted" />
                                </div>
                                <div className="flex items-center justify-center gap-2 text-sm text-primary">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Ti tengo aggiornato passo per passo...</span>
                                </div>
                            </section>
                        )}

                        {errorMessage && (
                            <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" aria-live="assertive">
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
                                    <Button type="button" onClick={nextStep} className="flex-1">
                                        Continua <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                ) : (
                                    <Button type="submit" disabled={isLoading} className="h-11 flex-1">
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
