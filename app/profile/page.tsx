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
            <main className="flex-1 p-6 flex flex-col items-center justify-center gap-6 pt-10 pb-24 text-center">
                <h1 className="text-2xl font-bold">Nessun Profilo Trovato</h1>
                <p className="text-gray-500">Non hai ancora configurato un piano personalizzato.</p>
                <Link href="/onboarding">
                    <Button>Inizia l&apos;Onboarding</Button>
                </Link>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 flex flex-col gap-6 pt-8 pb-24 max-w-lg mx-auto w-full">
            <header className="mb-2">
                <h1 className="text-3xl font-bold text-gray-900">Ciao, {userProfile.name}</h1>
                <p className="text-gray-500">Ecco il tuo piano d&apos;azione.</p>
            </header>

            <div className="grid gap-4">
                <Card className="shadow-sm border-none bg-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                            <User className="h-5 w-5" /> Obiettivi Quotidiani
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Calorie</span>
                            <span className="font-semibold text-green-600">{userProfile.targets?.daily_calories || 0} kcal</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3 text-center text-sm">
                            <div className="flex flex-col bg-blue-50 p-2 rounded-lg"><span className="font-bold text-blue-700">{userProfile.targets?.daily_carbs_g || 0}g</span><span>Carbo</span></div>
                            <div className="flex flex-col bg-red-50 p-2 rounded-lg"><span className="font-bold text-red-700">{userProfile.targets?.daily_protein_g || 0}g</span><span>Pro</span></div>
                            <div className="flex flex-col bg-amber-50 p-2 rounded-lg"><span className="font-bold text-amber-700">{userProfile.targets?.daily_fats_g || 0}g</span><span>Grassi</span></div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-none bg-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                            <Dumbbell className="h-5 w-5" /> {userProfile.workout_plan?.split_name || 'Piano d\'Allenamento'}
                        </CardTitle>
                        <p className="text-xs text-gray-500 mt-1">{userProfile.workout_plan?.description}</p>
                    </CardHeader>
                    <CardContent className="text-sm">
                        <ul className="space-y-4 mt-2">
                            {userProfile.workout_plan?.schedule?.map((day, i) => (
                                <li key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <div className="font-bold text-gray-800 mb-2">{day.day_name} <span className="text-blue-600 font-normal">- {day.workout_type}</span></div>
                                    {day.exercises?.map((ex, exIndex) => (
                                        <div key={exIndex} className="flex justify-between items-center text-gray-600 mb-1 pl-2 border-l-2 border-orange-200">
                                            <span className="font-medium">{ex.name}</span>
                                            <span className="text-xs bg-white px-2 py-1 rounded shadow-sm">{ex.sets}x{ex.reps}</span>
                                        </div>
                                    ))}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-none bg-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-green-700">
                            <Flame className="h-5 w-5" /> Menu Settimanale
                        </CardTitle>
                        {userProfile.diet_rules?.meal_timing && <p className="text-xs text-gray-500 mt-1">Regola: {userProfile.diet_rules.meal_timing}</p>}
                    </CardHeader>
                    <CardContent className="text-sm overflow-hidden">
                        <ul className="space-y-3">
                            {userProfile.diet_plan?.weekly_schedule?.map((day, dIdx) => (
                                <li key={dIdx} className="border p-3 border-gray-100 bg-green-50/30 rounded-xl">
                                    <div className="font-bold text-green-800 mb-2">{day.day_name}</div>
                                    <div className="space-y-2">
                                        <div><span className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Colazione</span><p className="text-gray-600 pl-2 leading-tight">{day.meals?.colazione?.join(', ') || 'Nessuna specifica'}</p></div>
                                        <div><span className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Pranzo</span><p className="text-gray-600 pl-2 leading-tight">{day.meals?.pranzo?.join(', ') || 'Nessuna specifica'}</p></div>
                                        <div><span className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Snack</span><p className="text-gray-600 pl-2 leading-tight">{day.meals?.snack?.join(', ') || 'Nessuna specifica'}</p></div>
                                        <div><span className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Cena</span><p className="text-gray-600 pl-2 leading-tight">{day.meals?.cena?.join(', ') || 'Nessuna specifica'}</p></div>
                                    </div>
                                </li>
                            )) || <p className="text-gray-500">Nessun piano dietetico settimanale disponibile.</p>}
                        </ul>
                    </CardContent>
                </Card>
            </div>
            <div className="mt-4 text-center pb-8">
                <Link href="/onboarding">
                    <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50">Rigenera Piano (Perderai quello attuale)</Button>
                </Link>
            </div>
        </main>
    );
}
