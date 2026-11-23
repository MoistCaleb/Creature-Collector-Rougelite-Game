# Hexbound: notes for Claude

## Bug reports
Players send bug reports from Settings › Report a bug. They're stored in the Supabase table
`bug_reports` (set up by `supabase/bug-reports.sql`). At the start of a work session, check them:

    node scripts/bugs.mjs              # list all reports, oldest first
    node scripts/bugs.mjs delete 3 7   # delete reports once fixed and logged

Reading and deleting need the private bug-report key (header `x-bug-token`), saved as a network
credential for the Supabase host in the cloud environment. Without it the list always looks empty.
Never ask for the key in chat, and never use Supabase secret or service_role keys.
When a report is fixed, log it (commit message, and the changelog when it's player-facing), then delete it.
