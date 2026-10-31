# Known Conflicts

- **Conflict c-1**: *Data storage vs shared total screen*
  - *Description*: The transcript requires that all expense data be saved only in the browser, yet also wants a total screen where everyone can see who owes whom. Storing data only locally on individual devices prevents sharing across multiple devices.
  - *Suggested fix*: Run the application on a single shared physical device (e.g., a tablet) kept on the floor. The device stores all data locally in the browser, satisfying both the "browser‑only" constraint and the shared total screen requirement.

- **Conflict c-2**: *Privacy vs no login*
  - *Description*: Users should only see their own balances, but the system has no login mechanism to identify users.
  - *Suggested fix*: Implement a lightweight local passcode/PIN system. Each user selects a personal PIN on first use; the PIN is stored locally (hashed) and used to unlock their private balance view. No external authentication service is required.

- **Conflict c-3**: *Admin deletion vs no login*
  - *Description*: Only an admin should be able to delete wrong expenses, yet there is no login to distinguish the admin.
  - *Suggested fix*: Use a dedicated admin PIN (different from regular user PINs). The admin PIN is set during initial setup and is required to perform deletions.

- **Conflict c-4**: *WhatsApp reminders vs offline operation*
  - *Description*: The app must work offline, but sending WhatsApp messages automatically requires network connectivity.
  - *Suggested fix*: Provide a pre‑filled `wa.me` link for each qualifying debt. The user can tap the link when the device is online; the app does not attempt to send messages automatically while offline.

- **Conflict c-5**: *Privacy vs total debt screen*
  - *Description*: Individual balances must be private, yet a total screen should display who owes whom. Showing exact amounts would expose private data.
  - *Suggested fix*: Show only net relationships (e.g., "Alice → Bob") on the total screen, masking the exact amount. Detailed amounts are visible only in a user’s private balance view after PIN entry.

# Overview
The application is a web‑based expense‑splitting tool for a hostel floor (30‑50 members). It runs entirely in the browser, stores all data locally on a single shared device, requires no external login, and works offline after the initial load.

# Goals
- Enable any floor member to record an expense and select participants.
- Provide each member a private view of their personal balance after authenticating with a local PIN.
- Show a shared summary screen that lists who owes whom (net relationships) without revealing exact amounts.
- Allow the floor admin (admin PIN) to delete erroneous expense entries.
- Generate WhatsApp reminder links for debts exceeding ₹500.
- Operate fully offline except when the user chooses to open a WhatsApp link.
- Support up to 50 users on a single device.

# Non-goals
- No cloud backend, real‑time synchronization, or multi‑device collaboration.
- No automated messaging service; WhatsApp reminders are user‑initiated.
- No integration with payment processors.
- No complex authentication (OAuth, SSO) – only local PINs.
- No support for more than one concurrent device.

# Users
- **Floor Member** – can add expenses, view personal balance, see summary, log settlements.
- **Floor Admin** – same as member plus ability to delete any expense after entering admin PIN.
- **Device Facilitator** – person who initially configures the app on the shared device (sets admin PIN, adds user names and PINs).

# Core Features
1. **Expense Entry** – description, total amount, participants (multi‑select), automatic equal split.
2. **Personal Balance View** – after PIN entry, shows net amount the user owes or is owed.
3. **Summary Screen** – lists net debtor‑creditor pairs (e.g., “Alice → Bob”) without amounts; highlights debts > ₹500 with a “Remind on WhatsApp” button.
4. **Admin Deletion** – admin PIN required to delete an expense; balances recalc automatically.
5. **WhatsApp Reminder** – generates a `wa.me` link containing a pre‑filled message with debtor’s name and amount.
6. **Settlement Logging** – users can record a payment transaction (payer, payee, amount) to clear debts.
7. **Data Export / Import** – manual JSON export for backup and optional import to a new device.
8. **Offline‑First Operation** – all features work without network; only WhatsApp link requires connectivity.

# Data and Storage
- **Storage Engine**: IndexedDB (fallback to LocalStorage if unavailable). All data is persisted locally on the device.
- **Schema**:
  - `users` – `{id, name, pinHash}`
  - `expenses` – `{id, description, amount, participantIds[], createdAt, createdByUserId}`
  - `settlements` – `{id, payerId, payeeId, amount, createdAt}`
  - `settings` – `{adminPinHash}`
- **Export**: Generates a JSON blob containing the full database.
- **Import**: Replaces current local data after user confirmation and schema validation.

# Screens and Flows
1. **Welcome / User Select** – dropdown of user names, PIN entry. First‑time users can set their PIN.
2. **Home Dashboard** – buttons: Add Expense, My Balance, Summary, Settlements, Settings.
3. **Add Expense** – form fields: Description, Amount (₹), Participants (checkbox list), Submit.
4. **My Balance** – after PIN, shows net balance (positive = others owe me, negative = I owe). Button to view settlement history.
5. **Summary** – list of debtor → creditor pairs. Rows with debt > ₹500 display “Remind on WhatsApp” button.
6. **Settlement Entry** – select payer, payee, amount, date; adds settlement record.
7. **Admin Delete** – long‑press or swipe on an expense entry → Delete button → admin PIN prompt → deletion.
8. **Settings** – set/change admin PIN, manage user PINs, export data, import data.

# Rules and Edge Cases
- **Expense Split**: Amount is divided equally among participants. Result is rounded to the nearest rupee (half‑up). Any rounding remainder is added to the first participant (alphabetical order) to keep total unchanged.
- **Balance Calculation**: For each user: `balance = sum(share of expenses) - sum(settlements where user is payer) + sum(settlements where user is payee)`.
- **Debt Threshold**: WhatsApp reminder button appears only for debts > ₹500.
- **Offline Mode**: All UI actions (add, delete, settlement) work offline. WhatsApp button is disabled when `navigator.onLine` is false.
- **Admin Deletion**: After deletion, all balances are recomputed from scratch to ensure consistency.
- **Data Import**: Import overwrites all existing data; a confirmation dialog warns the user.
- **PIN Security**: PINs are stored as salted SHA‑256 hashes (client‑side). No plaintext PINs are persisted.

# Assumptions
- The floor uses a **single shared device** (tablet or laptop) that stays on the floor; all members interact with the same browser instance.
- Users know their personal 4‑digit PIN; the admin PIN is known only to the floor admin.
- Phone numbers for WhatsApp reminders are entered during user setup and are valid.
- The device’s browser supports IndexedDB; otherwise, LocalStorage will be used with reduced capacity.
- The app is accessed via modern browsers (Chrome, Edge, Firefox) on desktop or tablet.

# Open Items
| ID | Topic | Recommended Default |
|----|-------|----------------------|
| O-1 | Rounding Rules for Expense Splits | Round to the nearest rupee (half‑up). Any remainder is assigned to the first participant alphabetically. |
| O-2 | Offline Persistence Fallback | If IndexedDB is unavailable, fallback to LocalStorage with JSON serialization. |
| O-3 | UI Design for Masked Balances | Show only debtor → creditor names on the summary screen; exact amounts are revealed only after PIN entry. |
| O-4 | Conflict Resolution for Simultaneous Edits | Not applicable due to single‑device usage; no concurrency handling required. |

# Decisions Log
| ID | Decision | Source | Details |
|----|----------|--------|---------|
| D1 | Data sharing method – single shared physical device | Answer q-1 (conservative default) | All data lives locally on the device; no network sync. |
| D2 | User identity – local PIN entry | Answer q-2 (conservative default) | Users select their name and enter a 4‑digit PIN to unlock private views. |
| D3 | Admin authentication – dedicated admin PIN | Answer q-2 (conservative default) | Admin PIN set during initial setup; required for deletions. |
| D4 | WhatsApp reminder mechanism – generate `wa.me` link | Answer q-3 (conservative default) | Link is displayed; user taps to open WhatsApp when online. |
| D5 | Balance privacy – mask detailed amounts on summary | Answer q-4 (conservative default) | Summary shows only “Who owes whom” without amounts. |
| D6 | Settlement recording – explicit payment transaction logging | Answer q-5 (conservative default) | Users can add settlement entries to clear debts. |
| D7 | Data storage engine – IndexedDB (fallback LocalStorage) | Assumption | Guarantees offline persistence. |
| D8 | Rounding rule – nearest rupee, remainder to first participant | Open Item O-1 | Ensures deterministic splits. |
| D9 | Export/Import format – JSON blob of full database | Assumption | Enables manual backup & transfer. |
| D10 | UI flow – single‑device access pattern | Assumption | Aligns with data sharing decision. |

# Acceptance Checklist
- [ ] Users can add an expense, select participants, and the amount is split equally with rounding applied.
- [ ] After entering their PIN, a user can view only their own net balance.
- [ ] The summary screen lists debtor → creditor pairs without showing amounts; debts > ₹500 display a WhatsApp reminder button.
- [ ] Admin can delete any expense after entering the admin PIN, and balances are recomputed correctly.
- [ ] Clicking the WhatsApp reminder button opens a pre‑filled `wa.me` link with the correct amount and debtor name.
- [ ] All core features (add, view, delete, settlement) work when the device is offline.
- [ ] Data persists across page reloads and browser restarts using IndexedDB (or LocalStorage fallback).
- [ ] Users can export the entire dataset as a JSON file and import it on another device.
- [ ] Settlement transactions can be recorded and affect subsequent balance calculations.
- [ ] Rounding follows the defined rule (nearest rupee, remainder to first participant).
- [ ] No user can view another member’s detailed balance without the correct PIN.
- [ ] Admin PIN and user PINs are stored hashed, not in plaintext.
- [ ] The app loads and runs on modern browsers (Chrome/Edge/Firefox) on desktop or tablet.

