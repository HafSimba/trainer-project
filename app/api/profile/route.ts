import { NextResponse } from 'next/server';
import { COLLECTIONS, getCollection } from '@/lib/mongodb';
import { createConflictSafeLegacyUnset, sanitizeLegacyProfileFields } from '@/lib/profile-legacy';
import { UserProfile } from '@/lib/types/database';

type ProfileRequestBody = {
    userId?: string;
    profileData?: Partial<UserProfile>;
};

async function getUserProfilesCollection() {
    return getCollection<UserProfile>(COLLECTIONS.userProfiles);
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

        if (!profile) {
            return NextResponse.json({ error: 'Nessun profilo trovato.' }, { status: 200 });
        }

        return NextResponse.json(profile);
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
        const sanitizedProfileData = sanitizeLegacyProfileFields(profileData);
        const updateSetPayload = { ...sanitizedProfileData, userId };
        const conflictSafeLegacyUnset = createConflictSafeLegacyUnset(updateSetPayload);

        const updateResult = await collection.findOneAndUpdate(
            { userId },
            {
                $set: updateSetPayload,
                ...(Object.keys(conflictSafeLegacyUnset).length > 0 ? { $unset: conflictSafeLegacyUnset } : {}),
            },
            { upsert: true, returnDocument: 'after' }
        );

        return NextResponse.json({ success: true, profile: updateResult });
    } catch (error: unknown) {
        console.error("Errore API Profile:", error);
        return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
    }
}
