# NOVA Perfume — GitHub/Vercel Upload Bundle

## Folder structure

```text
nova-perfume/
├── App.tsx                         # Main Expo/React Native Web UI
├── index.ts                        # Expo entry point
├── package.json                    # Dependencies and build:web script
├── package-lock.json               # Locked dependencies
├── app.json                        # Expo + web output configuration
├── vercel.json                     # Vercel build, SPA routing and API config
├── babel.config.js                 # Expo + NativeWind Babel config
├── metro.config.js                 # Metro bundler config
├── tailwind.config.js              # NativeWind/Tailwind theme
├── tsconfig.json                   # TypeScript config
├── global.css                      # Web/Tailwind styles
├── nativewind-env.d.ts             # NativeWind types
├── api/
│   └── scent-advisor.mjs           # Vercel serverless AI Advisor endpoint
├── data/
│   ├── nova-catalog.json           # Official 32-product catalog
│   ├── nova-catalog.ts             # Typed catalog import
│   ├── catalog-import-report.json  # Catalog import evidence
│   └── image-import-report.json    # Image mapping evidence
├── assets/
│   ├── icon.png                    # App icon
│   ├── favicon.png                 # Website favicon
│   ├── splash-icon.png
│   └── products/                   # Local product assets, if used
├── public/
│   └── manus-routes.json           # Website route manifest
├── supabase/
│   └── schema.sql                  # Profile and purchase-history schema
├── .env.example                    # Variable names only; no secrets
└── *.md                            # Setup and architecture notes
```

## Do not upload

```text
.env
node_modules/
dist/
.expo/
```

Never upload OpenAI keys, Supabase service-role keys, or any private token to GitHub.

## Vercel settings

```text
Framework Preset: Other
Build Command: npm run build:web
Output Directory: dist
Install Command: npm ci
```

## Required Vercel variables

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
OPENAI_API_KEY
OPENAI_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-5-mini
```

Set these for Production (and Preview/Development if needed). After changing variables, redeploy.

## GitHub upload order

1. Create an empty GitHub repository, for example `nova-perfume`.
2. Upload the contents of this bundle while preserving folders.
3. Do not upload `.env`, `node_modules`, `dist`, or `.expo`.
4. In Vercel choose **Add New → Project → Import Git Repository**.
5. Select the repository and deploy with the settings above.
6. After a new Vercel domain is created, add it to Supabase **Authentication → URL Configuration**.
