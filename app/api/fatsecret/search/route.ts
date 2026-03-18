import { NextRequest, NextResponse } from 'next/server';
import { searchFatSecretFoods } from '@/lib/fatsecret';

export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
    try {
        const query = request.nextUrl.searchParams.get('q')?.trim() || '';
        const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '10');
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.round(limitRaw), 1), 20) : 10;

        if (!query) {
            return NextResponse.json({ error: 'Parametro q mancante.' }, { status: 400 });
        }

        const products = await searchFatSecretFoods(query, limit);
        return NextResponse.json({ products });
    } catch (error) {
        console.error('Errore API FatSecret search:', error);

        const message = error instanceof Error ? error.message : 'Errore interno durante la ricerca alimenti.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
