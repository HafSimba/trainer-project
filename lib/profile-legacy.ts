import { Document, Filter, UpdateFilter } from 'mongodb';

type GenericRecord = Record<string, unknown>;

export const LEGACY_PROFILE_FILTER: Filter<Document> = {
    $or: [
        { etaGenere: { $exists: true } },
        { 'onboarding_input.etaGenere': { $exists: true } },
    ],
};

export const LEGACY_PROFILE_UNSET: NonNullable<UpdateFilter<Document>['$unset']> = {
    etaGenere: '',
    'onboarding_input.etaGenere': '',
};

function hasPathConflict(firstPath: string, secondPath: string): boolean {
    return firstPath === secondPath
        || firstPath.startsWith(`${secondPath}.`)
        || secondPath.startsWith(`${firstPath}.`);
}

export function createConflictSafeLegacyUnset(
    setPayload: GenericRecord
): NonNullable<UpdateFilter<Document>['$unset']> {
    const setPaths = Object.keys(setPayload);

    const safeUnsetEntries = Object.entries(LEGACY_PROFILE_UNSET).filter(([unsetPath]) => {
        return !setPaths.some((setPath) => hasPathConflict(unsetPath, setPath));
    });

    return Object.fromEntries(safeUnsetEntries);
}

export function sanitizeLegacyProfileFields<TProfile extends GenericRecord>(profile: TProfile): TProfile {
    const sanitized: GenericRecord = { ...profile };

    if ('etaGenere' in sanitized) {
        delete sanitized.etaGenere;
    }

    const onboardingInput = sanitized.onboarding_input;
    if (onboardingInput && typeof onboardingInput === 'object' && !Array.isArray(onboardingInput)) {
        const nextOnboardingInput: GenericRecord = { ...(onboardingInput as GenericRecord) };

        if ('etaGenere' in nextOnboardingInput) {
            delete nextOnboardingInput.etaGenere;
        }

        sanitized.onboarding_input = nextOnboardingInput;
    }

    return sanitized as TProfile;
}