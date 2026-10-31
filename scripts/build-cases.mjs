import fs from 'node:fs';
import path from 'node:path';

const casesDir = path.resolve(process.cwd(), 'data', 'cases');
if (!fs.existsSync(casesDir)) {
  fs.mkdirSync(casesDir, { recursive: true });
}

// 1. Hostel Expense Splitter Case
const sampleTranscript = fs.readFileSync(path.resolve(process.cwd(), 'data', 'sample-transcript.txt'), 'utf8');
const sampleLint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data', 'sample-lint.json'), 'utf8'));
const sampleSpecMd = fs.readFileSync(path.resolve(process.cwd(), 'data', 'sample', 'spec.md'), 'utf8');

const hostelCase = {
  version: 1,
  timestamp: 1730370000000,
  transcript: sampleTranscript + " Actually scratch that, let's make sure the floor admin can export the database before deleting anything.",
  lintResult: {
    ...sampleLint,
    selfCorrections: [
      {
        id: "sc-1",
        earlierQuote: "I want the admin of the floor to be able to delete wrong expenses.",
        finalQuote: "let's make sure the floor admin can export the database before deleting anything",
        resolution: "Admin must be prompted to export data backup before confirming deletion of any expense record."
      }
    ]
  },
  answers: {
    "q-1": { "text": "Run the application on a single shared physical device kept on the floor", "youDecide": false },
    "q-2": { "text": "Use local passcode/PIN entry to switch user and admin profiles", "youDecide": false },
    "q-3": { "text": "Generate a wa.me pre-filled link that opens WhatsApp on the user's phone", "youDecide": false },
    "q-4": { "text": "Show total net balances on the summary screen but mask detailed breakdown per person", "youDecide": false },
    "q-5": { "text": "Allow users to log explicit settlement payment transactions", "youDecide": false }
  },
  specResult: {
    specMarkdown: sampleSpecMd,
    answerConflicts: []
  }
};

fs.writeFileSync(path.join(casesDir, 'hostel-expense-splitter.json'), JSON.stringify(hostelCase, null, 2), 'utf8');

// 2. Clinic Booking Case
const clinicTranscript = fs.readFileSync(path.resolve(process.cwd(), 'data', 'clinic-transcript.txt'), 'utf8');

const clinicCase = {
  version: 1,
  timestamp: 1730374000000,
  transcript: clinicTranscript,
  lintResult: {
    summary: "The user wants an account-free mobile-first appointment booking page for a local clinic, with role-based doctor and receptionist views, SMS confirmations, and cancellation policies.",
    selfCorrections: [
      {
        id: "sc-1",
        earlierQuote: "We don't want to store personal data though",
        finalQuote: "we need to keep at least their phone and name locally for appointment lookups",
        resolution: "Retain minimum phone and patient name in local storage for booking history retrieval."
      }
    ],
    contradictions: [
      {
        id: "c-1",
        severity: "high",
        quoteA: "book without creating an account",
        quoteB: "patients should be able to see their booking history",
        why: "Accessing private historical bookings without authentication exposes patient records unless scoped to a local token or secure reference code."
      },
      {
        id: "c-2",
        severity: "medium",
        quoteA: "We don't collect emails",
        quoteB: "Send SMS confirmations to the patient",
        why: "Sending carrier SMS requires an API gateway key and incurs per-message costs, unlike free web-based or email notifications."
      }
    ],
    missingDecisions: [
      {
        id: "md-1",
        topic: "SMS Gateway Provider",
        whyItMatters: "The system needs a defined transactional SMS service (e.g., Twilio or AWS SNS) and fallback logic when offline."
      },
      {
        id: "md-2",
        topic: "Staff Authentication",
        whyItMatters: "Segregating doctor-specific views from the receptionist dashboard requires credentials."
      }
    ],
    questions: [
      {
        id: "q-1",
        question: "How should patients retrieve past booking history without a password account?",
        relatesTo: ["c-1"],
        options: [
          "Store booking tokens in local browser storage on their phone",
          "Provide a secure booking reference code sent via SMS",
          "Require an SMS one-time passcode (OTP) on history lookup"
        ]
      },
      {
        id: "q-2",
        question: "Which SMS provider service should dispatch appointment confirmations?",
        relatesTo: ["c-2", "md-1"],
        options: [
          "Twilio transactional messaging API",
          "AWS SNS SMS service",
          "Simulate SMS notifications in development mode"
        ]
      }
    ]
  },
  answers: {
    "q-1": { "text": "Store booking tokens in local browser storage on their phone", "youDecide": false },
    "q-2": { "text": "Twilio transactional messaging API", "youDecide": false }
  },
  specResult: {
    specMarkdown: `# Overview
A lightweight, mobile-first appointment booking web application for a local clinic allowing patients to reserve 30-minute doctor slots without creating permanent accounts.

# Goals
- Enable patient booking with name and phone number in 30-minute increments.
- Deliver automated SMS confirmations via Twilio.
- Allow cancellations up to 2 hours before scheduled time.
- Provide doctor views restricted to their own schedule and receptionist master view.
- Store booking tokens locally so returning patients can view their history without credentials.

# Non-goals
- No patient email collection or marketing blasts.
- No integrated credit card processing (payments handled at clinic desk).
- No arbitrary multi-clinic tenancy.

# Users
- **Patient**: Books slots, views local booking history, cancels within policy window.
- **Doctor**: Logs in to see personal appointments for the day.
- **Receptionist**: Desktop dashboard to manage all doctors, slots, and manual bookings.

# Decisions Log
| ID | Decision | Source | Details |
|---|---|---|---|
| D1 | History access – local browser token persistence | Answer q-1 (stated) | Booking reference saved to phone storage without account registration. |
| D2 | SMS provider – Twilio transactional API | Answer q-2 (answered) | Confirmation messages dispatched through configured Twilio credentials. |
| D3 | Appointment duration – 30-minute fixed intervals | Stated | All available clinic slots adhere to 30-minute boundaries. |
| D4 | Cancellation cutoff – 2 hours prior to start | Stated | Cancellation button disables when current time is within 2 hours of slot. |
| D5 | Staff authentication – role-based credential login | Assumed | Doctor and receptionist access protected by credential session. |
| D6 | Personal data retention – phone and name retained | Stated (self-correction) | Minimum identifiers kept strictly for appointment matching. |

# Acceptance Checklist
- [ ] Patient can book a slot with name and phone without registering.
- [ ] SMS confirmation is sent via Twilio with appointment details.
- [ ] Cancellation is blocked when less than 2 hours remain before appointment.
- [ ] Doctor sees only assigned appointments upon logging in.
- [ ] Receptionist can view and reschedule any doctor's slot on desktop.
`,
    answerConflicts: []
  }
};

fs.writeFileSync(path.join(casesDir, 'local-clinic-booking.json'), JSON.stringify(clinicCase, null, 2), 'utf8');

console.log('Case studies successfully created in data/cases/');

