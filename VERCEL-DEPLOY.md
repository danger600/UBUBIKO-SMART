# Vercel deployment

The standalone, local-data inventory preview is available at `/preview.html` and is also served at `/` as the default homepage. The existing React app remains part of the build at its own HTML entry point.

## Configure Vercel

1. Import `danger600/UBUBIKO-SMART` into your Vercel account or open its existing project.
2. Set the project Root Directory to the repository root (`.`). The root `vercel.json` installs and builds the frontend and publishes `frontend/dist`.
3. Deploy `feature/ububiko-standalone-frontend` as a Preview deployment to test, or merge it to the branch configured for Production.
4. In Vercel's Domains settings, ensure `ububiko-smart.vercel.app` is assigned to the Production deployment.
5. After deployment, visit `https://ububiko-smart.vercel.app/`. The preview also remains available at `https://ububiko-smart.vercel.app/preview.html`.

The preview saves sample data in the visitor's browser and is not connected to the backend. A Git push alone cannot deploy to Vercel unless the repository is linked to a Vercel project and automatic deployments are enabled. If the Vercel project is configured with Root Directory `frontend`, align its dashboard build/output settings with the root `vercel.json` configuration or reset the Root Directory to `.`.
