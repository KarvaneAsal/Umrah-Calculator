# Karvan-e-Asal Umrah Calculator

Standalone calculator for Karvan-e-Asal Travel & Tours.

## Repository isolation

- This work lives on branch `kea-calculator-isolated` in the existing GitHub repository.
- Do not merge this branch into `main` until the owner approves.
- The original `main` branch and existing Supabase project `Karvan-e-Asal Umra Manager` are not used or modified.
- New Supabase project: `Umrah-Calculator`, Mumbai region.
- Supabase project ref: `qotddjchvpdyqlqxlivd`.

## Current release

`index.html` preserves the original calculator's embedded supplier rate datasets and calculation interface. It now uses browser-native file downloads instead of Claude-hosted download APIs.

This is an initial standalone calculator release, not yet the complete hosted office system:
- Login and owner/staff permissions are not yet connected to the frontend.
- Shared online rate editing and rate history are not yet connected.
- Customer and quotation persistence are not yet connected.
- Website hosting and a custom domain have not been configured.
- Supplier rates remain embedded in the HTML source in this release.

## Database

The new Supabase project has these tables: profiles, vendors, rate_versions, hotel_rates, customers and quotations. RLS is enabled on all six tables. Authorization helper functions are in the non-exposed private schema. The security advisor returned no security lints after migration.

Do not use the older Supabase project or import old customer/booking data.

## Local preview

Open `index.html` in a modern browser. PDF/JPG downloads use browser-native download. External PDF/image rendering libraries are loaded from CDN, so an internet connection is required for those exports.

## Free GitHub Pages deployment

A GitHub Actions workflow is included at `.github/workflows/deploy-umrah-calculator.yml`. It builds the static site from this folder whenever this branch is updated.

One-time owner setup:
1. Open the repository Settings.
2. Open Pages.
3. Under Build and deployment, set Source to **GitHub Actions**.
4. Open the Actions tab and check the workflow run for this branch.

After a successful deployment, the free URL will be:
`https://karvaneasal.github.io/Umrah-Calculator/`

This uses GitHub Pages on the public repository. No paid domain or hosting subscription is required. The URL is controlled by GitHub; it cannot be renamed to a custom `.com` address without owning that domain.

## Security

Never commit Supabase service-role or database password secrets. The browser publishable/anon key may be used only with correct RLS policies. Do not store customer personal data in this initial release until authentication and database integration are complete.
