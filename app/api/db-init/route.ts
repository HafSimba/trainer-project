import { NextResponse } from 'next/server';
import clientPromise, { COLLECTIONS, DATABASE_NAME } from '@/lib/mongodb';
import { LEGACY_PROFILE_FILTER, LEGACY_PROFILE_UNSET } from '@/lib/profile-legacy';

export async function GET() {
    try {
        const client = await clientPromise;
        const db = client.db(DATABASE_NAME);

        // Crea la collezione esplicitamente se non esiste
        const collections = await db.listCollections({ name: COLLECTIONS.dailyLogs }).toArray();
        if (collections.length === 0) {
            await db.createCollection(COLLECTIONS.dailyLogs);
        }

        const collection = db.collection(COLLECTIONS.dailyLogs);

        // Crea l'indice composto: { userId: 1, date: -1 } come da Guida Tecnica
        // Questo rende istantanee le query che richiedono la cronologia dati di un utente.
        await collection.createIndex(
            { userId: 1, date: -1 },
            { unique: true } // userId e data devono essere combinati in modo univoco per "Documento Denso"
        );

        const profileCollections = await db.listCollections({ name: COLLECTIONS.userProfiles }).toArray();
        if (profileCollections.length === 0) {
            await db.createCollection(COLLECTIONS.userProfiles);
        }

        const profilesCollection = db.collection(COLLECTIONS.userProfiles);
        const cleanupResult = await profilesCollection.updateMany(
            LEGACY_PROFILE_FILTER,
            {
                $unset: LEGACY_PROFILE_UNSET,
            }
        );

        return NextResponse.json({
            success: true,
            message: `Database ${DATABASE_NAME} inizializzato, indici creati e cleanup legacy profilo completato.`,
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
