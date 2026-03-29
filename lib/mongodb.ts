import { MongoClient, MongoClientOptions } from 'mongodb';

if (!process.env.MONGODB_URI) {
    throw new Error('Please add your Mongo URI to .env.local');
}

const uri = process.env.MONGODB_URI as string;
const options: MongoClientOptions = {
    maxIdleTimeMS: 10000,
    serverSelectionTimeoutMS: 5000,
};

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

export default clientPromise;
