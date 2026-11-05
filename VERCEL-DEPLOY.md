# Deploy the frontend preview to Vercel

This repository includes a standalone local-data preview at `/preview.html`. It is built alongside the existing React application; the existing homepage remains unchanged.

## Configure Vercel

1. Import `danger600/UBUBIKO-SMART` into your Vercel account (or open its existing project).
2. If the project is configured to build from the repository root, keep the root directory as `.`. The repository-level `vercel.json` installs and builds `frontend` and publishes `frontend/dist`.
3. If the Vercel project instead has its Root Directory set to `frontend`, remove/override those root-level build settings in the Vercel dashboard and set the output directory to `dist`. The Vite configuration will still emit `preview.html` as a second page.
4. Merge `feature/ububiko-standalone-frontend` into the branch Vercel deploys, or enable a preview deployment for this branch. Assign `ububiko-smart.vercel.app` to the production deployment in Vercel's Domains settings.
5. After deployment, open `https://ububiko-smart.vercel.app/preview.html` to view the standalone preview.

The preview stores sample data in each visitor's browser and does not connect to the backend. A Git push alone cannot deploy to Vercel unless this repository is linked to a Vercel project with the necessary account permissions.
