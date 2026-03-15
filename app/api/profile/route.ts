import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { UserProfile } from '@/lib/types/database';

type ProfileRequestBody = {
    userId?: string;
    profileData?: Partial<UserProfile>;
};

async function getUserProfilesCollection() {
    const client = await clientPromise;
    const db = client.db('trainer_db');
    return db.collection<UserProfile>('user_profiles');
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'Il parametro userId è obbligatorio' }, { status: 400 });
        }

        const collection = await getUserProfilesCollection();

        const profile = await collection.findOne({ userId });

        return NextResponse.json(profile || { message: "Nessun profilo trovato." });
    } catch (error: unknown) {
        console.error("Errore GET Profile:", error);
        return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as ProfileRequestBody;
        const { userId, profileData } = body;

        if (!userId || !profileData) {
            return NextResponse.json({ error: 'Mancano campi obbligatori (userId, profileData)' }, { status: 400 });
        }

        const collection = await getUserProfilesCollection();

        const updateResult = await collection.findOneAndUpdate(
            { userId },
            {
                $set: { ...profileData, userId }
            },
            { upsert: true, returnDocument: 'after' }
        );

        return NextResponse.json({ success: true, profile: updateResult });
    } catch (error: unknown) {
        console.error("Errore API Profile:", error);
        return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
    }
}
