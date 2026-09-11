# Karvan e Asal — A1.0.80

## Accounting Period / Closing Architecture

Built from A1.0.79. Supabase remains the backend and the existing booking financial engine remains authoritative.

### Added
- `js/kea-a1080-periods.js`
- Accounting periods with explicit start/end dates
- Open / Closed state
- Super Admin period creation, closing and reopening
- Period profitability summaries derived from existing bookings, payments and expenses
- Closed-period protection for booking saves/finalization
- Supabase `app_config` key `accounting_periods` using the existing Supabase client
- Local offline cache for periods

### Financial integrity
Closing a period never rewrites historical booking totals, cost snapshots, frozen FX or fingerprints. It only controls subsequent writes to bookings dated inside the closed period.

### Backend
- Supabase: retained
- Firebase/Firestore: not used
- New Supabase tables/schema: none
- New Supabase client: none

# Karvan e Asal — A1.0.81

## Hajj Quota & Group Capacity Architecture

Built from A1.0.80. Supabase remains the backend and the existing Hajj quota guards remain authoritative for booking navigation/finalization.

### Added
- `js/kea-a1081-hajj-quota.js`
- Structured Hajj quota allocation model by agency/year
- Quota usage derived from existing Hajj booking records
- Remaining-capacity calculation
- Booking-local `hajjQuotaAllocation` snapshot metadata
- Hajj group capacity support through `hajjGroup` references when present
- Super Admin-only quota allocation management
- Settings dashboard for Hajj quota capacity
- Existing local quota cache retained for backward compatibility
- Existing Hajj hard-block and Super Admin override behavior preserved

### Integrity
- No new customer or booking database
- No new Supabase table/schema
- Existing `app_config` is used for structured quota configuration when available
- Cancelled Hajj bookings do not consume quota
- Financial calculations, cost snapshots, FX and payment data are untouched
- No government entitlement is assumed; configured quota remains agency-controlled data


# Karvan e Asal — A1.0.82

## Supplier Settlement / Payables Architecture

Built from A1.0.81. Supabase remains the backend and the existing customer financial engine remains authoritative.

### Added
- `js/kea-a1082-payables.js`
- Booking-local supplier payable obligations for hotels, airlines, transport, visa providers and other suppliers
- Supplier payment history with frozen currency/FX snapshots
- Open / approved / partially paid / paid / cancelled payable states
- Outstanding and overdue supplier settlement reporting
- Supplier-level payable balances on the dashboard
- Links payables to existing supplier master records and supplier references where available

### Separation / integrity
- Supplier payables are separate from customer payment history and customer receivables.
- Supplier payments never change `amount_paid`, `amount_due`, `payment_status`, `total_sar`, `total_pkr` or frozen customer booking totals.
- A1.0.76 expenses remain the procurement/expense accounting source; payables are settlement/liability state and are not counted as a second expense.
- Supplier payable amounts use a frozen FX snapshot rather than current global FX.

### Backend
- Supabase: retained
- Existing booking payload: retained as payable storage
- Firebase/Firestore: not used
- New Supabase tables/schema: none
- New Supabase client: none


# Karvan e Asal — A1.0.83

## Supplier Reconciliation & Settlement Controls

Built from A1.0.82. Supabase remains the backend and supplier payables remain separate from customer receivables and expense accounting.

### Added
- `js/kea-a1083-reconciliation.js`
- Supplier-level reconciliation summaries
- Payable-to-payment matching and variance detection
- Reconciliation states: unreconciled / matched / discrepancy / closed
- Frozen SAR-base settlement comparison using existing A1.0.82 payable snapshots
- Controlled reconciliation records stored inside the existing booking payload
- Supplier outstanding and overdue settlement controls on the dashboard

### Financial integrity
Reconciliation is a control layer only. It never changes customer totals, customer payment history, receivables, frozen booking financial snapshots, or A1.0.76 expense records. Supplier payables are not counted a second time as expenses.

### Backend
- Supabase: retained
- Firebase/Firestore: not used
- New Supabase tables/schema: none
- New Supabase client: none


# Karvan e Asal — A1.0.84

## Supplier Statement & Settlement Reporting Architecture

Built from A1.0.83. Supabase remains the backend and supplier statements are derived from the existing supplier payable and supplier settlement records.

### Added
- `js/kea-a1084-supplier-statements.js`
- Supplier statement model with opening balance, new obligations, supplier payments and closing balance
- Supplier-level statement generation from existing A1.0.82 payable/payment data
- Frozen SAR-base amounts retained for historical settlement reporting
- Supplier statement summary on the dashboard
- Reconciliation data can be surfaced alongside settlement reporting without rewriting payable or expense records

### Financial integrity
Supplier statements are a settlement/reporting layer only. They do not change customer revenue, customer receivables, customer payment history, booking totals, frozen cost snapshots, or A1.0.76 expenses. Supplier payables are not counted a second time as expenses.

### Backend
- Supabase: retained
- Firebase/Firestore: not used
- New Supabase tables/schema: none
- New Supabase client: none

# Karvan e Asal — A1.0.85

## Supplier Aging & Payables Due Management

Built from A1.0.84. Supabase remains the backend and supplier aging is a settlement/reporting layer over existing supplier payables and supplier payment records.

### Added
- `js/kea-a1085-supplier-aging.js`
- Current / upcoming supplier payable classification
- Aging buckets: 1–30, 31–60, 61–90 and 90+ days
- No-due-date review bucket
- Upcoming settlement views for 7 and 30 days
- Supplier-level outstanding, overdue and aging summaries
- Settlement-priority helper
- Dashboard Supplier Aging & Payables Due Management card
- Frozen SAR-base payable amounts remain the source for aging calculations

### Financial integrity
Supplier aging is reporting/control only. It does not modify customer revenue, customer receivables, customer payment history, booking totals, frozen cost snapshots, A1.0.76 expenses, supplier payable amounts, or supplier settlement payments. Payables are not counted a second time as expenses.

### Backend
- Supabase: retained
- Firebase/Firestore: not used
- New Supabase tables/schema: none
- New Supabase client: none
