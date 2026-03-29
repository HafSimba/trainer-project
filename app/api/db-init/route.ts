import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
    try {
        const client = await clientPromise;
        const db = client.db('trainer_db');

        // Crea la collezione esplicitamente se non esiste
        const collections = await db.listCollections({ name: 'daily_logs' }).toArray();
        if (collections.length === 0) {
            await db.createCollection('daily_logs');
        }

        const collection = db.collection('daily_logs');

        // Crea l'indice composto: { userId: 1, date: -1 } come da Guida Tecnica
        // Questo rende istantanee le query che richiedono la cronologia dati di un utente.
        await collection.createIndex(
            { userId: 1, date: -1 },
            { unique: true } // userId e data devono essere combinati in modo univoco per "Documento Denso"
        );

        const profileCollections = await db.listCollections({ name: 'user_profiles' }).toArray();
        if (profileCollections.length === 0) {
            await db.createCollection('user_profiles');
        }

        const profilesCollection = db.collection('user_profiles');
        const cleanupResult = await profilesCollection.updateMany(
            {
                $or: [
                    { etaGenere: { $exists: true } },
                    { 'onboarding_input.etaGenere': { $exists: true } },
                ],
            },
            {
                $unset: {
                    etaGenere: '',
                    'onboarding_input.etaGenere': '',
                },
            }
        );

        return NextResponse.json({
            success: true,
            message: 'Database trainer_db inizializzato, indici creati e cleanup etaGenere completato.',
            cleanup: {
                matched: cleanupResult.matchedCount,
                modified: cleanupResult.modifiedCount,
            },
        });
    } catch (error: unknown) {
        console.error('Errore durante l\'inizializzazione del database:', error);
        const details = error instanceof Error ? error.message : 'Errore sconosciuto';
        return NextResponse.json(
            { error: 'Impossibile inizializzare il database', details },
            { status: 500 }
        );
    }
}
