import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Inizializza il client per reindirizzare il traffico sul PC locale tramite il tunnel Cloudflare.
// Per rispettare Zero-Trust, iniettiamo anche gli header CF Access richiesti.
const aiClient = new OpenAI({
    baseURL: process.env.TUNNEL_CLOUDFLARED,
    apiKey: "not-needed",
    defaultHeaders: {
        "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID || "",
        "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET || ""
    }
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Formato messaggi non valido' }, { status: 400 });
        }

        // Aggiungo un system prompt per istruire il modello a comportarsi da personal trainer e nutrizionista
        const systemPrompt = {
            role: 'system',
            content: 'Sei TrAIner, il tuo personal trainer e nutrizionista virtuale. Rispondi in italiano. Sii conciso, motivante e professionale.',
        };

        // Chiama il completamento di LMStudio locale passando la storia della chat
        const response = await aiClient.chat.completions.create({
            model: 'gemma-3-4b-it',
            messages: [systemPrompt, ...messages.map((m: any) => ({ role: m.role, content: m.content }))],
            temperature: 0.7,
            max_tokens: 1500,
        });

        // Estrai il contenuto generato o prevedi un fallback sicuro in caso di errori strutturali
        const replyContent = response.choices[0]?.message?.content || "Scusa, non sono riuscito a elaborare una risposta.";

        return NextResponse.json({ content: replyContent });

    } catch (error: any) {
        console.error("Errore API Chat TrAIner:", error);
        return NextResponse.json(
            { error: "Errore durante la connessione all'agente AI. Verifica che LMStudio e il tunnel Cloudflare siano operativi." },
            { status: 500 }
        );
    }
}
