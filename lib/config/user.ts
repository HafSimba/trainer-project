const DEFAULT_PROTOTYPE_USER_ID = 'tester-user-123';
const USER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,63}$/;

const configuredPrototypeUserId = process.env.NEXT_PUBLIC_PROTOTYPE_USER_ID?.trim();

export const PROTOTYPE_USER_ID = configuredPrototypeUserId && configuredPrototypeUserId.length > 0
    ? configuredPrototypeUserId
    : DEFAULT_PROTOTYPE_USER_ID;

export const USER_ID_COOKIE_NAME = 'trainer_user_id';
export const USER_ID_STORAGE_KEY = 'trainer_user_id';

export function normalizeUserId(candidate: unknown): string | null {
    if (typeof candidate !== 'string') return null;
    const normalized = candidate.trim();
    if (!normalized) return null;
    return USER_ID_PATTERN.test(normalized) ? normalized : null;
}

export function resolveUserId(...candidates: Array<unknown>): string {
    for (const candidate of candidates) {
        const normalized = normalizeUserId(candidate);
        if (normalized) return normalized;
    }

    return PROTOTYPE_USER_ID;
}
