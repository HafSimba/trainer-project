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

        return NextResponse.json({
            success: true,
            message: 'Database trainer_db inizializzato e indici creati con successo su daily_logs!'
        });
    } catch (error: any) {
        console.error('Errore durante l\'inizializzazione del database:', error);
        return NextResponse.json(
            { error: 'Impossibile inizializzare il database', details: error.message },
            { status: 500 }
        );
    }
}
