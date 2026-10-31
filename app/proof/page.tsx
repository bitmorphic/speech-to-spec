import fs from 'node:fs';
import path from 'node:path';
import Image from 'next/image';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

interface DefectItem {
  id: string;
  title: string;
  description: string;
  severity?: 'high' | 'medium' | 'low';
}

interface SpecProofColumn {
  title: string;
  screenshot?: string;
  screenshotAlt?: string;
  summary: string;
  defectCount: number;
  defects: DefectItem[];
}

interface ProofData {
  title?: string;
  description?: string;
  rawTranscript: SpecProofColumn;
  lintedSpec: SpecProofColumn;
}

export const metadata = {
  title: 'Proof | Speech to Spec',
  description: 'Empirical comparison between coding agent builds from raw transcripts versus linted specs',
};

function loadProofData(): {
  data: ProofData | null;
  mode: 'actual' | 'placeholder' | 'missing';
} {
  const dataDir = path.resolve(process.cwd(), 'data');
  const actualPath = path.join(dataDir, 'proof.json');
  const examplePath = path.join(dataDir, 'proof.example.json');

  if (fs.existsSync(actualPath)) {
    try {
      const content = fs.readFileSync(actualPath, 'utf8');
      const parsed = JSON.parse(content) as ProofData;
      return { data: parsed, mode: 'actual' };
    } catch {
      // Fall through if file invalid
    }
  }

  if (fs.existsSync(examplePath)) {
    try {
      const content = fs.readFileSync(examplePath, 'utf8');
      const parsed = JSON.parse(content) as ProofData;
      return { data: parsed, mode: 'placeholder' };
    } catch {
      // Fall through
    }
  }

  return { data: null, mode: 'missing' };
}

export default function ProofPage() {
  const { data, mode } = loadProofData();

  return (
    <div className="min-h-screen bg-[#F8F8F7] text-[#1B1B18] flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-8">
        {/* Page Title */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#6B6A63] font-medium border border-[#E4E2DA] bg-white px-2.5 py-0.5 rounded-full">
              EMPIRICAL PROOF &amp; BENCHMARK
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-normal tracking-tight text-[#1B1B18]">
            Raw transcript vs. Linted spec
          </h1>
          <p className="text-sm text-[#6B6A63] max-w-2xl font-sans">
            Direct comparison of software artifacts built by autonomous coding agents with raw spoken dictation versus Speech to Spec requirements.
          </p>
        </div>

        {/* State 1: Placeholder Data Banner */}
        {mode === 'placeholder' && (
          <div
            role="status"
            className="p-4 sm:p-5 rounded-[16px] border border-amber-200 bg-amber-50/80 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-warm-xs"
          >
            <div className="flex items-start gap-2.5">
              <svg
                className="w-4 h-4 text-amber-800 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex flex-col gap-0.5">
                <span className="font-sans font-medium uppercase tracking-wider text-amber-900">
                  Placeholder data active
                </span>
                <span className="text-amber-900/90 font-sans">
                  Displaying simulated benchmark data from <code className="bg-amber-100 px-1 py-0.5 rounded border border-amber-200 font-mono text-[11px]">data/proof.example.json</code>.
                  To display your real benchmark results, create <code className="bg-amber-100 px-1 py-0.5 rounded border border-amber-200 font-mono text-[11px]">data/proof.json</code>.
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 font-mono text-[11px] shrink-0 self-start sm:self-center">
              DEMO MODE
            </span>
          </div>
        )}

        {/* State 2: Missing File Filling Instructions */}
        {mode === 'missing' && (
          <section
            aria-labelledby="filling-instructions-heading"
            className="p-6 rounded-[16px] border border-[#E4E2DA] bg-white flex flex-col gap-4 shadow-warm-xs"
          >
            <h2 id="filling-instructions-heading" className="text-lg font-serif font-normal text-[#1B1B18] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#1B1B18]" />
              Proof benchmark filling instructions
            </h2>
            <p className="text-xs text-[#1B1B18]/80 leading-relaxed font-sans">
              Neither <code className="text-[#1B1B18] font-mono font-medium">data/proof.json</code> nor <code className="text-[#1B1B18] font-mono font-medium">data/proof.example.json</code> was found.
              To display an empirical comparison on this page, create a JSON file with the following structure:
            </p>
            <div className="bg-[#F7F6F3] p-4 rounded-xl border border-[#E4E2DA] overflow-x-auto text-xs font-mono text-[#1B1B18]">
              <pre>{`{
  "title": "Build Benchmark",
  "rawTranscript": {
    "title": "Built from Raw Transcript",
    "screenshot": "/proof/raw-build.png",
    "summary": "Summary of agent build failures from raw speech...",
    "defectCount": 5,
    "defects": [
      { "id": "D1", "title": "Conflict", "description": "Details...", "severity": "high" }
    ]
  },
  "lintedSpec": {
    "title": "Built from Linted Spec",
    "screenshot": "/proof/linted-build.png",
    "summary": "Summary of clean agent build outcome...",
    "defectCount": 0,
    "defects": []
  }
}`}</pre>
            </div>
            <p className="text-xs text-[#6B6A63] font-sans">
              Place corresponding screenshot images inside the <code className="text-[#1B1B18] font-mono">public/proof/</code> directory.
            </p>
          </section>
        )}

        {/* Data Columns Display (Active or Placeholder) */}
        {data && (
          <div className="flex flex-col gap-6">
            {/* Defect Comparison Strip */}
            <section
              aria-label="Defect Comparison Strip"
              className="p-4 sm:p-5 rounded-[16px] border border-[#E4E2DA] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-warm-xs"
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B6A63]">
                    Defect comparison
                  </span>
                  <span className="text-sm font-serif font-normal text-[#1B1B18]">
                    Agent build failure rate
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 sm:gap-8 font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#6B6A63] font-sans">Raw dictation:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-medium">
                    {data.rawTranscript?.defectCount ?? data.rawTranscript?.defects?.length ?? 0} defects
                  </span>
                </div>

                <span className="text-[#E4E2DA] text-sm">&rarr;</span>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#6B6A63] font-sans">Linted spec:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
                    {data.lintedSpec?.defectCount ?? data.lintedSpec?.defects?.length ?? 0} defects
                  </span>
                </div>

                {(data.rawTranscript?.defectCount ?? 0) > 0 && (
                  <div className="hidden md:flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#1B1B18] text-white text-xs font-medium font-sans">
                    <span>
                      {Math.round(
                        (((data.rawTranscript?.defectCount ?? 0) - (data.lintedSpec?.defectCount ?? 0)) /
                          (data.rawTranscript?.defectCount ?? 1)) *
                          100
                      )}
                      % defect reduction
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Two Columns: Raw Transcript vs Linted Spec */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Column 1: Built from Raw Transcript */}
              <article className="rounded-[16px] border border-[#E4E2DA] bg-white overflow-hidden flex flex-col shadow-warm-xs">
                {/* Screenshot Above */}
                <div className="relative w-full aspect-video bg-[#F7F6F3] border-b border-[#E4E2DA] flex items-center justify-center overflow-hidden">
                  {data.rawTranscript.screenshot ? (
                    <img
                      src={data.rawTranscript.screenshot}
                      alt={data.rawTranscript.screenshotAlt || 'Screenshot of build from raw transcript'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="p-8 text-center text-xs text-[#6B6A63] font-sans">
                      No screenshot provided in public/proof
                    </div>
                  )}
                  <span className="absolute top-3 left-3 px-2.5 py-0.5 text-[11px] font-sans uppercase tracking-wider rounded-full bg-white text-rose-800 border border-rose-200 font-medium shadow-xs">
                    Raw transcript build
                  </span>
                </div>

                <div className="p-5 sm:p-6 flex flex-col gap-4 flex-1">
                  <div>
                    <h2 className="text-lg font-serif font-normal text-[#1B1B18] tracking-tight">
                      {data.rawTranscript.title || 'Built from raw transcript'}
                    </h2>
                    <p className="text-xs text-[#1B1B18]/80 mt-1 leading-relaxed font-sans">
                      {data.rawTranscript.summary}
                    </p>
                  </div>

                  {/* Defect List */}
                  <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-[#E4E2DA]">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className="text-[#6B6A63] font-medium">
                        Documented defects
                      </span>
                      <span className="text-rose-800 font-medium">
                        {data.rawTranscript.defects?.length || data.rawTranscript.defectCount || 0} issues
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                      {data.rawTranscript.defects && data.rawTranscript.defects.length > 0 ? (
                        data.rawTranscript.defects.map((defect) => (
                          <div
                            key={defect.id}
                            className="p-3.5 rounded-[12px] bg-[#F8F8F7] border border-[#E4E2DA] flex flex-col gap-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] font-medium text-[#1B1B18]">
                                {defect.id}: {defect.title}
                              </span>
                              {defect.severity && (
                                <span
                                  className={`text-[10px] font-sans uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                    defect.severity === 'high'
                                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                                      : 'border-amber-200 bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {defect.severity}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#6B6A63] leading-normal font-sans">
                              {defect.description}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#6B6A63] font-sans italic">No defects recorded.</p>
                      )}
                    </div>
                  </div>
                </div>
              </article>

              {/* Column 2: Built from Linted Spec */}
              <article className="rounded-[16px] border border-[#E4E2DA] bg-white overflow-hidden flex flex-col shadow-warm-xs">
                {/* Screenshot Above */}
                <div className="relative w-full aspect-video bg-[#F7F6F3] border-b border-[#E4E2DA] flex items-center justify-center overflow-hidden">
                  {data.lintedSpec.screenshot ? (
                    <img
                      src={data.lintedSpec.screenshot}
                      alt={data.lintedSpec.screenshotAlt || 'Screenshot of build from linted specification'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="p-8 text-center text-xs text-[#6B6A63] font-sans">
                      No screenshot provided in public/proof
                    </div>
                  )}
                  <span className="absolute top-3 left-3 px-2.5 py-0.5 text-[11px] font-sans uppercase tracking-wider rounded-full bg-white text-emerald-800 border border-emerald-200 font-medium shadow-xs">
                    Linted spec build
                  </span>
                </div>

                <div className="p-5 sm:p-6 flex flex-col gap-4 flex-1">
                  <div>
                    <h2 className="text-lg font-serif font-normal text-[#1B1B18] tracking-tight">
                      {data.lintedSpec.title || 'Built from linted spec'}
                    </h2>
                    <p className="text-xs text-[#1B1B18]/80 mt-1 leading-relaxed font-sans">
                      {data.lintedSpec.summary}
                    </p>
                  </div>

                  {/* Defect List */}
                  <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-[#E4E2DA]">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className="text-[#6B6A63] font-medium">
                        Documented defects
                      </span>
                      <span className="text-emerald-800 font-medium">
                        {data.lintedSpec.defects?.length || data.lintedSpec.defectCount || 0} issues
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                      {data.lintedSpec.defects && data.lintedSpec.defects.length > 0 ? (
                        data.lintedSpec.defects.map((defect) => (
                          <div
                            key={defect.id}
                            className="p-3.5 rounded-[12px] bg-[#F8F8F7] border border-[#E4E2DA] flex flex-col gap-1 text-xs"
                          >
                            <span className="font-mono text-[11px] font-medium text-[#1B1B18]">
                              {defect.id}: {defect.title}
                            </span>
                            <p className="text-[11px] text-[#6B6A63] leading-normal font-sans">
                              {defect.description}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 rounded-[12px] bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2 font-sans">
                          <svg className="w-4 h-4 text-emerald-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Zero contradictions or defects. Specification executed cleanly.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        )}

        {/* Navigation Footer */}
        <div className="pt-6 border-t border-[#E4E2DA] flex justify-between items-center text-xs font-sans">
          <Link href="/" className="text-[#1B1B18] font-medium hover:text-black flex items-center gap-1.5 transition">
            &larr; Return to workspace
          </Link>
          <Link href="/about" className="text-[#6B6A63] hover:text-[#1B1B18] flex items-center gap-1.5 transition">
            Read architecture &amp; rules &rarr;
          </Link>
        </div>
      </main>
    </div>
  );
}

