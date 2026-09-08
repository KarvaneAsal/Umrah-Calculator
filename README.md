# Karvan e Asal — A1.0.66

## Checkpoint
Audit Trail + Activity Architecture.

## Baseline
Built directly from A1.0.65.

## Architecture
- GitHub-friendly audit module: `js/kea-a1066-audit.js`
- Existing Supabase payload/persistence remains the storage path.
- No new Supabase table or schema change.
- No Firebase/Firestore.
- No `supabase.js`.

## Activity model
Booking payloads now carry a bounded `auditTrail[]` with action, label, timestamp, actor, source and structured details. It records meaningful saves, payment changes, lifecycle transitions and document actions. The record preview exposes the activity history read-only.

Historical financial values are not recalculated or replaced by the audit layer. Existing financial snapshots, fingerprints, payment logic, lifecycle rules and document snapshots remain authoritative.

## Verification target
All inline and external JavaScript must parse successfully and the final ZIP must pass ZIP integrity testing.
