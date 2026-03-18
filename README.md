This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Variables

To enable food search and barcode lookup via FatSecret, configure these variables:

```bash
# Preferred single-variable format
FAT_SECRET_API_KEY="<CLIENT_ID>:<CLIENT_SECRET>"

# Alternative format (equivalent)
FAT_SECRET_CLIENT_ID="<CLIENT_ID>"
FAT_SECRET_CLIENT_SECRET="<CLIENT_SECRET>"
```

Notes:

- Requests are performed server-side via OAuth2 Client Credentials.
- In Vercel, add the variables in Project Settings → Environment Variables.
- For barcode lookup, your FatSecret app must have `barcode` scope enabled.

### FatSecret Troubleshooting

- `invalid_client`: ensure values are OAuth 2.0 Client ID/Client Secret (not OAuth 1.0 Consumer Key/Secret).
- If using `FAT_SECRET_API_KEY`, format must be exactly `CLIENT_ID:CLIENT_SECRET` (single line, no quotes, no spaces).
- If deployment is on Vercel, check FatSecret IP allowlist requirements for OAuth2 token requests.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
