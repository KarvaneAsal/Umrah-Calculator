# KEA Calculator (Isolated Project)

This folder is reserved for the new standalone Karvan-e-Asal Umrah Package Calculator.

## Separation rules
- This calculator is developed on the `kea-calculator-isolated` Git branch.
- Existing application files, history, and records on the default `main` branch are not to be modified.
- The existing Supabase project **Karvan-e-Asal Umra Manager** is not to be used by this calculator.
- The calculator will use a separate Supabase project and its own database once that project is created and connected.
- Do not copy or migrate old application/customer/booking data into this calculator.

## Source of truth
The original standalone calculator HTML and its supplier rate data must be reviewed before porting calculations. Preserve existing formulas and rate datasets; do not invent or replace rates.

## Planned structure
- `src/` — calculator application
- `supabase/migrations/` — schema for the new calculator database only
- `docs/` — setup, data mapping, and testing notes
- `.env.example` — public frontend configuration placeholders only; never commit secrets

## Status
Repository isolation branch created. Application implementation and separate database provisioning are pending.
