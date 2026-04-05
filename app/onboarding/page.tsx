'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Flame, Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { USER_ID_COOKIE_NAME, USER_ID_STORAGE_KEY } from '@/lib/config/user';
import { extractApiError, readJsonResponse } from '@/lib/utils';

const SEX_OPTIONS = ['Uomo', 'Donna', 'Altro'] as const;
const WEEKLY_AVAILABILITY_OPTIONS = ['1 giorno/sett.', '2 giorni/sett.', '3 giorni/sett.', '4 giorni/sett.', '5 giorni/sett.', '6 giorni/sett.', '7 giorni/sett.'] as const;
const STRESS_UI_OPTIONS = ['Rilassata', 'Impegnativa', 'Frenetica'] as const;
const RECOVERY_UI_OPTIONS = ['<6h tormentate', '7h discrete', '+8h rigeneranti'] as const;

const GOAL_UI_OPTIONS = [
    {
        label: 'Dimagrimento',
        description: 'Ridurre gradualmente la massa grassa mantenendo performance e recupero.',
    },
    {
        label: 'Definizione',
        description: 'Migliorare composizione e tono con focus su precisione nutrizionale.',
    },
    {
        label: 'Massa Muscolare',
        description: 'Aumentare volume e forza con progressioni stabili nel tempo.',
    },
    {
        label: 'Performance',
        description: 'Migliorare resistenza, capacita atletica e qualita del movimento.',
    },
] as const;

const LEVEL_UI_OPTIONS = [
    {
        label: 'Mai',
        description: 'Zero esperienza strutturata. Partiamo con fondamentali e tecnica.',
    },
    {
        label: '<6 mesi',
        description: 'Hai iniziato da poco. Consolidiamo abitudini e progressione.',
    },
    {
        label: '1-2 anni',
        description: 'Hai una base solida. Possiamo alzare volume e qualita del lavoro.',
    },
    {
        label: '+3 anni',
        description: 'Profilo avanzato: periodizzazione e dettagli fanno la differenza.',
    },
] as const;

const EQUIPMENT_UI_OPTIONS = [
    {
        label: 'Casa corpo libero',
        description: 'Sessioni senza macchine, con focus su efficacia e semplicità.',
    },
    {
        label: 'Home Gym con pesi',
        description: 'Allenamento con manubri/elastici/attrezzi base direttamente a casa.',
    },
    {
        label: 'Palestra Completa',
        description: 'Accesso pieno a macchine e bilancieri per massima varieta.',
    },
] as const;

const DIET_REGIME_OPTIONS = [
    {
        label: 'Vegano',
        description: 'Solo fonti vegetali e combinazioni proteiche complete.',
    },
    {
        label: 'Vegetariano',
        description: 'Senza carne e pesce, con latticini/uova se previsti.',
    },
    {
        label: 'Onnivoro',
        description: 'Mix bilanciato di fonti animali e vegetali.',
    },
    {
        label: 'Keto',
        description: 'Approccio low-carb con focus su grassi di qualita.',
    },
    {
        label: 'Paleo',
        description: 'Alimenti minimamente processati e selezione essenziale.',
    },
] as const;

const INTENSITY_OPTIONS = [
    {
        value: 1,
        label: 'Progressiva',
        description: 'Adattamento graduale e sostenibile.',
    },
    {
        value: 2,
        label: 'Bilanciata',
        description: 'Volume e recupero in equilibrio.',
    },
    {
        value: 3,
        label: 'Spinta',
        description: 'Stimolo alto con gestione tecnica accurata.',
    },
] as const;

const GOAL_CANONICAL_BY_UI = {
    Dimagrimento: 'Dimagrimento',
    Definizione: 'Definizione',
    'Massa Muscolare': 'Ipertrofia',
    Performance: 'Mantenimento',
} as const;

const STRESS_CANONICAL_BY_UI = {
    Rilassata: 'Basso',
    Impegnativa: 'Medio',
    Frenetica: 'Alto',
} as const;

const RECOVERY_CANONICAL_BY_UI = {
    '<6h tormentate': 'Lento',
    '7h discrete': 'Normale',
    '+8h rigeneranti': 'Rapido',
} as const;

const LEVEL_CANONICAL_BY_UI = {
    Mai: 'Principiante',
    '<6 mesi': 'Principiante',
    '1-2 anni': 'Intermedio',
    '+3 anni': 'Esperto',
} as const;

const EQUIPMENT_CANONICAL_BY_UI = {
    'Casa corpo libero': 'Corpo libero',
    'Home Gym con pesi': 'Attrezzatura base in casa',
    'Palestra Completa': 'Palestra attrezzata',
} as const;

const INTENSITY_CANONICAL_BY_SCALE = {
    1: 'Progressivo',
    2: 'Bilanciato',
    3: 'Spinto',
} as const;

const INTERACTIVE_STEPS = 5;
const MAX_LOADING_PROGRESS = 97;
const MIN_MEAL_FREQUENCY = 2;
const MAX_MEAL_FREQUENCY = 6;
const MEAL_FREQUENCY_OPTIONS = [2, 3, 4, 5, 6] as const;
const LOADING_PHASES = [
    { label: 'Consolidamento profilo', thresholdMs: 0 },
    { label: 'Generazione scheda allenamento', thresholdMs: 2800 },
    { label: 'Generazione piano alimentare', thresholdMs: 8800 },
    { label: 'Controllo coerenza e fallback', thresholdMs: 16500 },
    { label: 'Salvataggio del tuo piano', thresholdMs: 23000 },
] as const;

type GoalUiLabel = (typeof GOAL_UI_OPTIONS)[number]['label'];
type StressUiLabel = (typeof STRESS_UI_OPTIONS)[number];
type RecoveryUiLabel = (typeof RECOVERY_UI_OPTIONS)[number];
type LevelUiLabel = (typeof LEVEL_UI_OPTIONS)[number]['label'];
type EquipmentUiLabel = (typeof EQUIPMENT_UI_OPTIONS)[number]['label'];
type DietRegimeLabel = (typeof DIET_REGIME_OPTIONS)[number]['label'];
type SexOption = (typeof SEX_OPTIONS)[number];
type IntensityScale = (typeof INTENSITY_OPTIONS)[number]['value'];

type Step = 0 | 1 | 2 | 3 | 4 | 5;

type OnboardingFormData = {
    username: string;
    eta: string;
    sesso: SexOption | '';
    altezza: string;
    peso: string;
    missionePerche: string;
    goalUiLabel: GoalUiLabel;
    disponibilitaSettimanaleIndex: number;
    stressUiLabel: StressUiLabel;
    recoveryUiLabel: RecoveryUiLabel;
    levelUiLabel: LevelUiLabel;
    equipmentUiLabel: EquipmentUiLabel;
    intensityScale: IntensityScale;
    infortuniNote: string;
    dietRegime: DietRegimeLabel;
    limitazioniAlimentari: string;
    frequenzaPasti: string;
};

type GeneratePlanApiResponse = {
    success?: boolean;
    error?: string;
    message?: string;
};

const INITIAL_FORM_DATA: OnboardingFormData = {
    username: '',
    eta: '',
    sesso: '',
    altezza: '',
    peso: '',
    missionePerche: '',
    goalUiLabel: 'Dimagrimento',
    disponibilitaSettimanaleIndex: 3,
    stressUiLabel: 'Impegnativa',
    recoveryUiLabel: '7h discrete',
    levelUiLabel: '<6 mesi',
    equipmentUiLabel: 'Home Gym con pesi',
    intensityScale: 2,
    infortuniNote: '',
    dietRegime: 'Onnivoro',
    limitazioniAlimentari: '',
    frequenzaPasti: '4',
};

function getNextStep(currentStep: Step): Step {
    if (currentStep === 0) return 1;
    if (currentStep === 1) return 2;
    if (currentStep === 2) return 3;
    if (currentStep === 3) return 4;
    return 5;
}

function getPreviousStep(currentStep: Step): Step {
    if (currentStep === 5) return 4;
    if (currentStep === 4) return 3;
    if (currentStep === 3) return 2;
    if (currentStep === 2) return 1;
    return 0;
}

function getInteractiveProgress(currentStep: Step): number {
    const currentInteractiveStep = Math.min(currentStep + 1, INTERACTIVE_STEPS);
    return (currentInteractiveStep / INTERACTIVE_STEPS) * 100;
}

function parseMealFrequency(rawValue: string): number {
    return Number.parseInt(rawValue, 10);
}

function buildGeneratePlanPayload(formData: OnboardingFormData) {
    const restrictionNotes = formData.limitazioniAlimentari.trim();
    const mealFrequencyPerDay = parseMealFrequency(formData.frequenzaPasti);

    return {
        username: formData.username.trim(),
        missionePerche: formData.missionePerche.trim(),
        obiettivoPersonale: formData.missionePerche.trim(),
        eta: Number(formData.eta),
        sesso: formData.sesso,
        altezzaCm: Number(formData.altezza),
        pesoKg: Number(formData.peso),
        disponibilitaSettimanale: formData.disponibilitaSettimanaleIndex + 1,
        tempoDisponibile: WEEKLY_AVAILABILITY_OPTIONS[formData.disponibilitaSettimanaleIndex],
        obiettivoPrimario: GOAL_CANONICAL_BY_UI[formData.goalUiLabel],
        obiettivoPrimarioUI: formData.goalUiLabel,
        attitudineStress: STRESS_CANONICAL_BY_UI[formData.stressUiLabel],
        stileStressUI: formData.stressUiLabel,
        attitudineRecupero: RECOVERY_CANONICAL_BY_UI[formData.recoveryUiLabel],
        stileRecuperoUI: formData.recoveryUiLabel,
        livelloAttuale: LEVEL_CANONICAL_BY_UI[formData.levelUiLabel],
        livelloEsperienzaUI: formData.levelUiLabel,
        equipaggiamento: EQUIPMENT_CANONICAL_BY_UI[formData.equipmentUiLabel],
        equipaggiamentoUI: formData.equipmentUiLabel,
        attitudineIntensita: INTENSITY_CANONICAL_BY_SCALE[formData.intensityScale],
        scalaIntensita: formData.intensityScale,
        infortuniNote: formData.infortuniNote.trim(),
        regimeAlimentare: formData.dietRegime,
        frequenzaPasti: mealFrequencyPerDay,
        allergiePresenti: restrictionNotes.length > 0,
        allergieNote: restrictionNotes,
        limitazioniAlimentari: restrictionNotes,
    };
}

function getOrCreateClientUserId(): string {
    if (typeof window === 'undefined') return '';

    const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (existing && existing.trim()) {
        return existing;
    }

    const generated = typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    window.localStorage.setItem(USER_ID_STORAGE_KEY, generated);
    return generated;
}

function persistUserIdCookie(userId: string): void {
    if (!userId || typeof document === 'undefined') return;
    document.cookie = `${USER_ID_COOKIE_NAME}=${encodeURIComponent(userId)}; path=/; max-age=31536000; samesite=lax`;
}

type SelectionCardProps = {
    title: string;
    description: string;
    active: boolean;
    onClick: () => void;
};

function SelectionCard({ title, description, active, onClick }: SelectionCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 ${active
                ? 'border-primary bg-primary/10 shadow-sm'
                : 'border-border/80 bg-card hover:bg-surface-soft'
                }`}
        >
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </button>
    );
}

type SliderFieldProps = {
    label: string;
    reason: string;
    options: readonly string[];
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
    const [loadingElapsedMs, setLoadingElapsedMs] = useState(0);
    const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_FORM_DATA);

    const updateFormField = <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const fieldName = e.target.name as keyof OnboardingFormData;
        setFormData((prev) => ({ ...prev, [fieldName]: e.target.value }));
    };

    useEffect(() => {
        if (!isLoading) return;

        const loadingStartedAtMs = Date.now();

        const intervalId = setInterval(() => {
            const elapsedMs = Date.now() - loadingStartedAtMs;
            setLoadingElapsedMs(elapsedMs);

            const nextProgress = elapsedMs < 7000
                ? 8 + ((elapsedMs / 7000) * 56)
                : elapsedMs < 18000
                    ? 64 + (((elapsedMs - 7000) / 11000) * 24)
                    : 88 + Math.min((((elapsedMs - 18000) / 25000) * 9), 9);

            setProgress((prev) => Math.max(prev, Math.min(MAX_LOADING_PROGRESS, nextProgress)));
        }, 350);

        return () => clearInterval(intervalId);
    }, [isLoading]);

    const loadingMessage = useMemo(() => {
        if (loadingElapsedMs < 2400) return 'Sto consolidando i tuoi dati prima di avviare il motore AI...';
        if (loadingElapsedMs < 9000) return 'Sto costruendo la strategia di allenamento sui tuoi vincoli reali...';
        if (loadingElapsedMs < 17000) return 'Sto assemblando piano alimentare e timing pasti...';
        if (loadingElapsedMs < 26000) return 'Sto verificando coerenza, restrizioni e fallback qualitativo...';
        return 'L elaborazione richiede un po di tempo extra, sto finalizzando il tuo profilo.';
    }, [loadingElapsedMs]);

    const interactiveProgress = useMemo(() => getInteractiveProgress(step), [step]);

    const validateStep = (currentStep: Step) => {
        if (currentStep === 0) {
            if (!formData.username.trim()) return 'Inserisci il tuo nome per iniziare.';
            if (!formData.sesso) return 'Seleziona il sesso biologico per una stima metabolica piu accurata.';

            const age = Number(formData.eta);
            const height = Number(formData.altezza);
            const weight = Number(formData.peso);

            if (!Number.isFinite(age) || age < 14 || age > 90) {
                return 'Eta non valida: inserisci un valore compreso tra 14 e 90.';
            }

            if (!Number.isFinite(height) || height < 100 || height > 250) {
                return 'Altezza non valida: inserisci un valore compreso tra 100 e 250 cm.';
            }

            if (!Number.isFinite(weight) || weight < 30 || weight > 250) {
                return 'Peso non valido: inserisci un valore compreso tra 30 e 250 kg.';
            }
        }

        if (currentStep === 1) {
            if (!formData.missionePerche.trim()) {
                return 'Raccontami in poche righe il perche della tua missione.';
            }

            if (formData.missionePerche.trim().length < 8) {
                return 'Aggiungi qualche dettaglio in piu sulla tua motivazione per personalizzare meglio il piano.';
            }
        }

        if (currentStep === 4) {
            const meals = parseMealFrequency(formData.frequenzaPasti);
            if (!Number.isFinite(meals) || meals < MIN_MEAL_FREQUENCY || meals > MAX_MEAL_FREQUENCY) {
                return 'La frequenza pasti deve essere compresa tra 2 e 6.';
            }
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

        if (step < 4) {
            nextStep();
            return;
        }

        const validationError = validateStep(step);
        if (validationError) {
            setErrorMessage(validationError);
            return;
        }

        setErrorMessage('');
        setStep(5);
        setIsLoading(true);
        setLoadingElapsedMs(0);
        setProgress(8);

        try {
            const clientUserId = getOrCreateClientUserId();
            persistUserIdCookie(clientUserId);

            const payload = {
                ...buildGeneratePlanPayload(formData),
                userId: clientUserId,
            };

            const res = await fetch('/api/generate-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
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
            setStep(4);
            setProgress(0);
            setLoadingElapsedMs(0);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
            <Card className="motion-enter mx-auto w-full max-w-2xl border border-border/80 bg-card/95 shadow-lg backdrop-blur-sm">
                <CardContent className="p-5 sm:p-6">
                    <div className="mb-6 rounded-2xl bg-gradient-to-br from-primary via-primary to-emerald-700 px-4 py-5 text-primary-foreground motion-enter motion-fast motion-delay-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/85">Profilazione guidata</p>
                        <h1 className="mt-2 text-3xl font-black">TrAIner</h1>
                        <p className="mt-1 text-sm text-primary-foreground/90">Percorso in 5 step per creare un piano realmente aderente al tuo stile di vita.</p>
                    </div>

                    {step < 5 && (
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
                                    <p className="font-semibold text-primary">Iniziamo dal tuo profilo fisico.</p>
                                    <p className="mt-1 text-sm text-primary/90">Raccolgo i dati essenziali per calibrare target calorici, recupero e volume di allenamento.</p>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm font-semibold">Nome</label>
                                        <Input
                                            required
                                            name="username"
                                            value={formData.username}
                                            onChange={handleFieldChange}
                                            placeholder="Es: Mario"
                                            autoFocus
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm font-semibold">Eta</label>
                                        <Input type="number" min="14" max="90" name="eta" value={formData.eta} onChange={handleFieldChange} placeholder="Es: 30" required />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm font-semibold">Altezza (cm)</label>
                                        <Input type="number" min="100" max="250" name="altezza" value={formData.altezza} onChange={handleFieldChange} placeholder="Es: 178" required />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm font-semibold">Peso (kg)</label>
                                        <Input type="number" min="30" max="250" name="peso" value={formData.peso} onChange={handleFieldChange} placeholder="Es: 78" required />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold">Sesso biologico</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {SEX_OPTIONS.map((option) => (
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
                                </div>
                            </section>
                        )}

                        {step === 1 && (
                            <section className="space-y-4 motion-enter motion-delay-1">
                                <h2 className="text-lg font-bold text-foreground">Missione</h2>
                                <p className="text-sm text-muted-foreground">Seleziona la direzione principale e raccontami il perche: la motivazione migliora la personalizzazione.</p>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    {GOAL_UI_OPTIONS.map((goal) => (
                                        <SelectionCard
                                            key={goal.label}
                                            title={goal.label}
                                            description={goal.description}
                                            active={formData.goalUiLabel === goal.label}
                                            onClick={() => updateFormField('goalUiLabel', goal.label)}
                                        />
                                    ))}
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-semibold">Perche vuoi raggiungere questo obiettivo?</label>
                                    <textarea
                                        required
                                        name="missionePerche"
                                        value={formData.missionePerche}
                                        onChange={handleFieldChange}
                                        placeholder="Es: Voglio sentirmi piu forte e costante nei prossimi 6 mesi, senza piani estremi."
                                        className="flex min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        rows={4}
                                    />
                                </div>
                            </section>
                        )}

                        {step === 2 && (
                            <section className="space-y-4 motion-enter motion-delay-1">
                                <h2 className="text-lg font-bold text-foreground">Stile di vita e carburante</h2>
                                <p className="text-sm text-muted-foreground">Definisco carico e recupero in base al tuo ritmo reale, non su un utente medio.</p>

                                <SliderField
                                    label="Disponibilita settimanale"
                                    reason="Quanti giorni reali puoi dedicare all allenamento ogni settimana."
                                    options={WEEKLY_AVAILABILITY_OPTIONS}
                                    value={formData.disponibilitaSettimanaleIndex}
                                    onChange={(nextValue) => updateFormField('disponibilitaSettimanaleIndex', nextValue)}
                                />

                                <SliderField
                                    label="Stress quotidiano"
                                    reason="Lo stress impatta sul margine di recupero e sulla periodizzazione del volume."
                                    options={STRESS_UI_OPTIONS}
                                    value={STRESS_UI_OPTIONS.indexOf(formData.stressUiLabel)}
                                    onChange={(nextValue) => updateFormField('stressUiLabel', STRESS_UI_OPTIONS[nextValue])}
                                />

                                <SliderField
                                    label="Qualita recupero / sonno"
                                    reason="Qualita del sonno e recupero orientano intensita e densita delle sessioni."
                                    options={RECOVERY_UI_OPTIONS}
                                    value={RECOVERY_UI_OPTIONS.indexOf(formData.recoveryUiLabel)}
                                    onChange={(nextValue) => updateFormField('recoveryUiLabel', RECOVERY_UI_OPTIONS[nextValue])}
                                />
                            </section>
                        )}

                        {step === 3 && (
                            <section className="space-y-4 motion-enter motion-delay-1">
                                <h2 className="text-lg font-bold text-foreground">Esperienza e attrezzatura</h2>

                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-foreground">Livello esperienza</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {LEVEL_UI_OPTIONS.map((level) => (
                                            <SelectionCard
                                                key={level.label}
                                                title={level.label}
                                                description={level.description}
                                                active={formData.levelUiLabel === level.label}
                                                onClick={() => updateFormField('levelUiLabel', level.label)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-foreground">Attrezzatura disponibile</p>
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        {EQUIPMENT_UI_OPTIONS.map((equipment) => (
                                            <SelectionCard
                                                key={equipment.label}
                                                title={equipment.label}
                                                description={equipment.description}
                                                active={formData.equipmentUiLabel === equipment.label}
                                                onClick={() => updateFormField('equipmentUiLabel', equipment.label)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
                                    <p className="text-sm font-semibold text-foreground">Intensita desiderata</p>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        {INTENSITY_OPTIONS.map((intensity) => (
                                            <button
                                                key={intensity.value}
                                                type="button"
                                                onClick={() => updateFormField('intensityScale', intensity.value)}
                                                aria-pressed={formData.intensityScale === intensity.value}
                                                className={`rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 ${formData.intensityScale === intensity.value
                                                    ? 'border-primary bg-primary/10'
                                                    : 'border-border bg-card hover:bg-surface-soft'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Flame className={`h-4 w-4 ${formData.intensityScale === intensity.value ? 'text-primary' : 'text-muted-foreground'}`} />
                                                    <p className="text-sm font-semibold text-foreground">{intensity.label}</p>
                                                </div>
                                                <p className="mt-1 text-xs text-muted-foreground">{intensity.description}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-semibold">Infortuni o dolori da considerare (opzionale)</label>
                                    <textarea
                                        name="infortuniNote"
                                        value={formData.infortuniNote}
                                        onChange={handleFieldChange}
                                        placeholder="Es: fastidio lombare in squat profondi, vecchio infortunio alla spalla destra..."
                                        className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        rows={3}
                                    />
                                </div>
                            </section>
                        )}

                        {step === 4 && (
                            <section className="space-y-4 motion-enter motion-delay-1">
                                <h2 className="text-lg font-bold text-foreground">Alimentazione e limiti</h2>

                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-foreground">Regime alimentare</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {DIET_REGIME_OPTIONS.map((regime) => (
                                            <SelectionCard
                                                key={regime.label}
                                                title={regime.label}
                                                description={regime.description}
                                                active={formData.dietRegime === regime.label}
                                                onClick={() => updateFormField('dietRegime', regime.label)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-semibold">Allergie / limiti alimentari (opzionale)</label>
                                    <textarea
                                        name="limitazioniAlimentari"
                                        value={formData.limitazioniAlimentari}
                                        onChange={handleFieldChange}
                                        placeholder="Es: celiachia, intolleranza al lattosio, no frutta secca..."
                                        className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        rows={3}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold">Frequenza pasti giornaliera</label>
                                    <select
                                        name="frequenzaPasti"
                                        value={formData.frequenzaPasti}
                                        onChange={handleFieldChange}
                                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                        {MEAL_FREQUENCY_OPTIONS.map((value) => (
                                            <option key={value} value={String(value)}>
                                                {value} pasti al giorno
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </section>
                        )}

                        {step === 5 && (
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
                                    <p className="text-center text-[11px] text-muted-foreground">Tempo trascorso: {Math.max(1, Math.floor(loadingElapsedMs / 1000))}s</p>
                                </div>

                                <ul className="space-y-2 rounded-xl border border-border/70 bg-surface-soft/40 p-3">
                                    {LOADING_PHASES.map((phase, index) => {
                                        const nextThreshold = LOADING_PHASES[index + 1]?.thresholdMs ?? Number.POSITIVE_INFINITY;
                                        const isCompleted = progress >= 100 || loadingElapsedMs >= nextThreshold;
                                        const isActive = !isCompleted && loadingElapsedMs >= phase.thresholdMs;

                                        return (
                                            <li key={phase.label} className="flex items-center justify-between text-xs">
                                                <span className={isActive ? 'font-semibold text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}>
                                                    {phase.label}
                                                </span>
                                                <span className={isCompleted ? 'text-success' : isActive ? 'text-primary' : 'text-muted-foreground'}>
                                                    {isCompleted ? 'Completato' : isActive ? 'In corso' : 'In attesa'}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>

                                <div className="flex items-center justify-center gap-2 text-sm text-primary">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Sto finalizzando ogni dettaglio del tuo piano...</span>
                                </div>
                            </section>
                        )}

                        {errorMessage && (
                            <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" aria-live="assertive">
                                {errorMessage}
                            </p>
                        )}

                        {step < 5 && (
                            <div className="flex gap-2 pt-2">
                                {step > 0 && (
                                    <Button type="button" variant="outline" className="flex-1" onClick={previousStep}>
                                        <ArrowLeft className="mr-2 h-4 w-4" /> Indietro
                                    </Button>
                                )}

                                {step < 4 ? (
                                    <Button type="button" onClick={nextStep} className="flex-1">
                                        Continua <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                ) : (
                                    <Button type="submit" disabled={isLoading} className="h-11 flex-1">
                                        Genera il Mio Piano <ArrowRight className="ml-2 h-4 w-4" />
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