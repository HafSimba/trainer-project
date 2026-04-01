import { Document, MongoClient, MongoClientOptions } from 'mongodb';

if (!process.env.MONGODB_URI) {
    throw new Error('Please add your Mongo URI to .env.local');
}

function normalizeMongoUri(rawUri: string): string {
    try {
        const parsed = new URL(rawUri);
        const params = new URLSearchParams(parsed.search);
        let hasChanges = false;

        for (const [key, value] of Array.from(params.entries())) {
            if (!value || !value.trim()) {
                params.delete(key);
                hasChanges = true;
            }
        }

        if (!hasChanges) {
            return rawUri;
        }

        const nextSearch = params.toString();
        parsed.search = nextSearch ? `?${nextSearch}` : '';
        return parsed.toString();
    } catch {
        // Fallback per URI non parseabili da URL: rimuove "w" vuoto e query vuote duplicate.
        return rawUri
            .replace(/([?&])w(?:=)?(?=(&|$))/g, '$1')
            .replace(/[?&]{2,}/g, '&')
            .replace(/\?&/g, '?')
            .replace(/[?&]$/g, '');
    }
}

const rawUri = process.env.MONGODB_URI as string;
const uri = normalizeMongoUri(rawUri);
const options: MongoClientOptions = {
    maxIdleTimeMS: 10000,
    serverSelectionTimeoutMS: 5000,
};

export const DATABASE_NAME = process.env.MONGODB_DB_NAME?.trim() || 'trainer_db';
export const COLLECTIONS = {
    dailyLogs: 'daily_logs',
    userProfiles: 'user_profiles',
} as const;

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
    // In development, utilizza una variabile globale per preservare 
    // il valore attraverso i ricaricamenti a caldo (HMR) del modulo.
    const globalWithMongo = global as typeof globalThis & {
        _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
        client = new MongoClient(uri, options);
        globalWithMongo._mongoClientPromise = client.connect();
    }
    clientPromise = globalWithMongo._mongoClientPromise;
} else {
    // In production, il modulo viene caricato una sola volta per istanza lambda.
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
}

export async function getDatabase() {
    const client = await clientPromise;
    return client.db(DATABASE_NAME);
}

export async function getCollection<TSchema extends Document = Document>(name: string) {
    const db = await getDatabase();
    return db.collection<TSchema>(name);
}

export default clientPromise;
