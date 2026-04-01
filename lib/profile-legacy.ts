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