import { UserProfile } from '@/lib/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Flame, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PROTOTYPE_USER_ID } from '@/lib/config/user';
import { headers } from 'next/headers';
import { extractApiError, readJsonResponse } from '@/lib/utils';

export const revalidate = 0;

type ProfileApiResponse = UserProfile | { profile?: UserProfile; error?: string; message?: string };

function isUserProfile(value: unknown): value is UserProfile {
    return !!value
        && typeof value === 'object'
        && ('name' in value || 'targets' in value || 'workout_plan' in value || 'diet_plan' in value);
}

async function resolveApiBaseUrl() {
    const headersList = await headers();
    const host = headersList.get('x-forwarded-host') || headersList.get('host');
    const proto = headersList.get('x-forwarded-proto') || (process.env.NODE_ENV === 'development' ? 'http' : 'https');

    if (host) {
        return `${proto}://${host}`;
    }

    const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (configuredBaseUrl) {
        return configuredBaseUrl;
    }

    const vercelUrl = process.env.VERCEL_URL?.trim();
    if (vercelUrl) {
        return `https://${vercelUrl}`;
    }

    return 'http://localhost:3000';
}

async function fetchProfileViaApi(userId: string): Promise<UserProfile | null> {
    const baseUrl = await resolveApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/profile?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    const data = await readJsonResponse<ProfileApiResponse>(response);

    if (!response.ok) {
        throw new Error(extractApiError(data) || `Errore nel recupero profilo (HTTP ${response.status})`);
    }

    if (isUserProfile(data)) {
        return data;
    }

    if (data && typeof data === 'object' && 'profile' in data && isUserProfile((data as { profile?: unknown }).profile)) {
        return (data as { profile: UserProfile }).profile;
    }

    return null;
}

export default async function Profile() {
    let userProfile: UserProfile | null = null;

    try {
        userProfile = await fetchProfileViaApi(PROTOTYPE_USER_ID);
    } catch (error) {
        console.error('Errore caricamento profilo via API:', error);
    }

    if (!userProfile) {
        return (
            <main className="flex-1 px-6 py-10 pb-28 text-center flex flex-col items-center justify-center gap-6">
                <h1 className="text-2xl font-bold">Nessun Profilo Trovato</h1>
                <p className="text-muted-foreground">Non hai ancora configurato un piano personalizzato.</p>
                <Link href="/onboarding">
                    <Button>Inizia l&apos;Onboarding</Button>
                </Link>
            </main>
        );
    }

    return (
        <main className="mx-auto flex-1 w-full max-w-lg overflow-y-auto px-4 py-6 pb-28">
            <header className="motion-enter rounded-3xl bg-gradient-to-br from-primary via-primary to-emerald-700 px-5 py-6 text-primary-foreground shadow-[0_14px_34px_-20px_rgba(27,100,67,0.65)]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/85">Profilo operativo</p>
                <h1 className="mt-2 text-3xl font-black">Ciao, {userProfile.name}</h1>
                <p className="mt-1 text-sm text-primary-foreground/90">Qui trovi obiettivi, split allenamento e piano alimentare in un unico flusso.</p>
            </header>

            <div className="mt-4 grid gap-4">
                <Card className="motion-enter motion-delay-1 border border-border/75 bg-card shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-primary">
                            <User className="h-5 w-5" /> Obiettivi Quotidiani
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between border-b border-border py-2">
                            <span className="text-muted-foreground">Calorie</span>
                            <span className="font-semibold text-primary">{userProfile.targets?.daily_calories || 0} kcal</span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                            <div className="flex flex-col rounded-lg border border-warning/25 bg-warning/10 p-2"><span className="font-bold text-warning">{userProfile.targets?.daily_carbs_g || 0}g</span><span className="text-muted-foreground">Carbo</span></div>
                            <div className="flex flex-col rounded-lg border border-success/25 bg-success/10 p-2"><span className="font-bold text-success">{userProfile.targets?.daily_protein_g || 0}g</span><span className="text-muted-foreground">Pro</span></div>
                            <div className="flex flex-col rounded-lg border border-info/25 bg-info/10 p-2"><span className="font-bold text-info">{userProfile.targets?.daily_fats_g || 0}g</span><span className="text-muted-foreground">Grassi</span></div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="motion-enter motion-delay-2 border border-border/75 bg-card shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-primary">
                            <Dumbbell className="h-5 w-5" /> {userProfile.workout_plan?.split_name || 'Piano d\'Allenamento'}
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">{userProfile.workout_plan?.description}</p>
                    </CardHeader>
                    <CardContent className="text-sm">
                        <ul className="mt-2 space-y-3">
                            {userProfile.workout_plan?.schedule?.map((day, i) => (
                                <li key={i} className="rounded-xl border border-border/70 bg-surface-soft/70 p-3">
                                    <div className="mb-2 font-bold text-foreground">{day.day_name} <span className="font-normal text-primary">- {day.workout_type}</span></div>
                                    {day.exercises?.map((ex, exIndex) => (
                                        <div key={exIndex} className="mb-1 flex items-center justify-between border-l-2 border-primary/30 pl-2 text-muted-foreground last:mb-0">
                                            <span className="font-medium">{ex.name}</span>
                                            <span className="rounded bg-card px-2 py-1 text-xs shadow-sm">{ex.sets}x{ex.reps}</span>
                                        </div>
                                    ))}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <Card className="motion-enter motion-delay-3 border border-border/75 bg-card shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-primary">
                            <Flame className="h-5 w-5" /> Menu Settimanale
                        </CardTitle>
                        {userProfile.diet_rules?.meal_timing && <p className="mt-1 text-xs text-muted-foreground">Regola: {userProfile.diet_rules.meal_timing}</p>}
                    </CardHeader>
                    <CardContent className="text-sm overflow-hidden">
                        <ul className="space-y-3">
                            {userProfile.diet_plan?.weekly_schedule?.map((day, dIdx) => (
                                <li key={dIdx} className="rounded-xl border border-border/70 bg-surface-soft/70 p-3">
                                    <div className="mb-2 font-bold text-foreground">{day.day_name}</div>
                                    <div className="space-y-2">
                                        <div><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colazione</span><p className="leading-tight text-foreground/85 pl-2">{day.meals?.colazione?.join(', ') || 'Nessuna specifica'}</p></div>
                                        <div><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pranzo</span><p className="leading-tight text-foreground/85 pl-2">{day.meals?.pranzo?.join(', ') || 'Nessuna specifica'}</p></div>
                                        <div><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Snack</span><p className="leading-tight text-foreground/85 pl-2">{day.meals?.snack?.join(', ') || 'Nessuna specifica'}</p></div>
                                        <div><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cena</span><p className="leading-tight text-foreground/85 pl-2">{day.meals?.cena?.join(', ') || 'Nessuna specifica'}</p></div>
                                    </div>
                                </li>
                            )) || <p className="text-muted-foreground">Nessun piano dietetico settimanale disponibile.</p>}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            <div className="motion-enter motion-delay-4 mt-4 pb-8 text-center">
                <Link href="/onboarding">
                    <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/10">Rigenera Piano (Perderai quello attuale)</Button>
                </Link>
            </div>
        </main>
    );
}
