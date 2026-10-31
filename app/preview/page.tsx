// TODO: remove before deployment
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { SpecViewer } from '@/components/SpecViewer';

export default function PreviewPage() {
  // Read downloaded spec markdown from data/sample/spec.md
  let specMarkdown = '';
  try {
    const specPath = path.join(process.cwd(), 'data', 'sample', 'spec.md');
    specMarkdown = fs.readFileSync(specPath, 'utf8');
  } catch {
    specMarkdown = '# Error\nCould not load data/sample/spec.md';
  }

  // Load sample lint questions to map IDs to real question texts
  let sampleQuestions: Array<{ id: string; question: string }> = [];
  try {
    const lintPath = path.join(process.cwd(), 'data', 'sample-lint.json');
    if (fs.existsSync(lintPath)) {
      const lintData = JSON.parse(fs.readFileSync(lintPath, 'utf8'));
      if (Array.isArray(lintData.questions)) {
        sampleQuestions = lintData.questions.map((q: { id: string; question: string }) => ({
          id: q.id,
          question: q.question,
        }));
      }
    }
  } catch {
    // optional sample questions fallback
  }

  // Mock answer conflicts for preview demonstration of the card UI
  const mockConflicts = [
    {
      questionIds: ['q-1', 'q-4'],
      description:
        'The answer for q-1 relies on a single shared tablet on the floor, while the answer for q-4 displays only masked net balances, leaving private details vulnerable to shoulder surfing without individual authentication.',
      suggestedFix:
        'Introduce a lightweight local PIN or session timeout before displaying personal balances on the shared tablet.',
    },
    {
      questionIds: ['q-3'],
      description:
        'The answer for q-3 generates wa.me links on the user’s mobile device, but the host environment is designated as a shared offline tablet without an active WhatsApp desktop client.',
      suggestedFix:
        'Display QR codes containing wa.me deep links so roommates can scan and send reminders directly from their personal phones.',
    },
  ];

  const mockTestCases = [
    {
      id: 'TC-01',
      title: 'Expense addition with equal split',
      given: 'A hostel resident on the shared dashboard with 3 roommates registered',
      when: 'The resident records an expense of $60 split equally',
      then: 'Each roommate balance increases by $15 and total hostel ledger updates to $60',
      relatedChecklistItem: 'Allow anyone on floor to record expenses',
    },
    {
      id: 'TC-02',
      title: 'Offline ledger sync upon reconnection',
      given: 'Shared tablet operates without active internet connection',
      when: 'Local SQLite database registers 5 expenses and network reconnects',
      then: 'Transactions reconcile without data loss and net balances update',
      relatedChecklistItem: 'Local storage fallback with background sync',
    },
  ];

  const mockDiagrams = {
    flowchart: `flowchart TD
  A["User Opens Shared App"] --> B["View Floor Expenses"]
  B --> C{"Choose Action"}
  C -->|"Add Expense"| D["Enter Amount and Select Roommates"]
  C -->|"Settle Up"| E["Record Direct Settlement"]
  D --> F["Write to Local SQLite"]
  E --> F
  F --> G["Recalculate Net Balances"]`,
    erDiagram: `erDiagram
  USER {
    string id PK
    string name
    string roomNumber
  }
  EXPENSE {
    string id PK
    float amount
    string paidById FK
    datetime createdAt
  }
  EXPENSE_SPLIT {
    string id PK
    string expenseId FK
    string userId FK
    float owedAmount
  }
  USER ||--o{ EXPENSE : "pays"
  EXPENSE ||--|{ EXPENSE_SPLIT : "contains"
  USER ||--o{ EXPENSE_SPLIT : "owes"`,
  };

  const mockPreviousSpec = specMarkdown
    ? `${specMarkdown.slice(0, 300)}\n\n## Legacy Draft Notes\n- Previous draft before contradiction resolution.\n\n${specMarkdown.slice(300, 1200)}`
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* Preview Banner */}
        <div className="border border-cyan-800/80 bg-cyan-950/40 rounded-lg p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="bg-cyan-500 text-zinc-950 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[11px]">
              Preview Mode
            </span>
            <span className="text-cyan-300">
              Iterating on data/sample/spec.md without calling models
            </span>
          </div>
          <Link
            href="/"
            className="text-zinc-400 hover:text-zinc-200 underline underline-offset-4"
          >
            &larr; Back to Main App
          </Link>
        </div>

        {/* Spec Viewer Component */}
        <SpecViewer
          specMarkdown={specMarkdown}
          answerConflicts={mockConflicts}
          questions={sampleQuestions}
          showConflictsWarning={true}
          testCases={mockTestCases}
          diagrams={mockDiagrams}
          previousSpecMarkdown={mockPreviousSpec}
        />
      </div>
    </div>
  );
}

