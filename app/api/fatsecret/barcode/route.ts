import { NextRequest, NextResponse } from 'next/server';
import { findFatSecretFoodByBarcode } from '@/lib/fatsecret';

export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    try {
        const barcode = request.nextUrl.searchParams.get('barcode')?.trim() || '';

        if (!barcode) {
            return NextResponse.json({ error: 'Parametro barcode mancante.' }, { status: 400 });
        }

        const product = await findFatSecretFoodByBarcode(barcode);

        if (!product) {
            return NextResponse.json({ error: 'Prodotto non trovato per questo barcode.', product: null }, { status: 404 });
        }

        return NextResponse.json({ product });
    } catch (error) {
        console.error('Errore API FatSecret barcode:', error);

        const message = error instanceof Error ? error.message : 'Errore interno durante la ricerca barcode.';
        return NextResponse.json({ product: null, error: message }, { status: 200 });
    }
}
