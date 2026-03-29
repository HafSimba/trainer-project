import { OpenAI } from 'openai';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';
const DEFAULT_MODEL = 'gemma3:27b';
const DEFAULT_API_KEY = 'ollama';

let llmClient: OpenAI | null = null;

function normalizeBaseUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) return DEFAULT_OLLAMA_BASE_URL;

    if (trimmed.endsWith('/v1')) return trimmed;
    if (trimmed.endsWith('/v1/')) return trimmed.slice(0, -1);
    if (trimmed.endsWith('/')) return `${trimmed}v1`;
    return `${trimmed}/v1`;
}

function parseModelList(rawModels: string | undefined): string[] {
    if (!rawModels) return [];

    return rawModels
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean);
}

export function getLlmClient(): OpenAI {
    if (!llmClient) {
        const baseURL = normalizeBaseUrl(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || DEFAULT_OLLAMA_BASE_URL);
        const apiKey = (process.env.OLLAMA_API_KEY || DEFAULT_API_KEY).trim() || DEFAULT_API_KEY;

        llmClient = new OpenAI({
            baseURL,
            apiKey,
        });
    }

    return llmClient;
}

export function getChatModel(): string {
    return (process.env.OLLAMA_MODEL || process.env.LLM_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

export function getGenerationModels(): string[] {
    const fromList = parseModelList(process.env.LLM_MODELS);
    if (fromList.length > 0) return fromList;
    return [getChatModel()];
}
