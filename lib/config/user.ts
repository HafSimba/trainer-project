const DEFAULT_PROTOTYPE_USER_ID = 'tester-user-123';

const configuredPrototypeUserId = process.env.NEXT_PUBLIC_PROTOTYPE_USER_ID?.trim();

export const PROTOTYPE_USER_ID = configuredPrototypeUserId && configuredPrototypeUserId.length > 0
    ? configuredPrototypeUserId
    : DEFAULT_PROTOTYPE_USER_ID;
