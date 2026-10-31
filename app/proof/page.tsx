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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-8">
        {/* Page Title */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cyan-400 font-semibold border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 rounded">
              EMPIRICAL PROOF &amp; BENCHMARK
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 font-sans">
            Raw Transcript vs. Linted Spec
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl font-sans">
            Direct comparison of software artifacts built by autonomous coding agents with raw spoken dictation versus Speech to Spec requirements.
          </p>
        </div>

        {/* State 1: Placeholder Data Banner */}
        {mode === 'placeholder' && (
          <div
            role="status"
            className="p-4 rounded-lg border border-amber-900/60 bg-amber-950/30 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-start gap-2.5">
              <svg
                className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"
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
                <span className="font-mono font-bold uppercase tracking-wider text-amber-300">
                  Placeholder Data Active
                </span>
                <span className="text-amber-200/90 font-sans">
                  Displaying simulated benchmark data from <code className="bg-amber-950 px-1 py-0.5 rounded border border-amber-800 font-mono text-[11px]">data/proof.example.json</code>.
                  To display your real benchmark results, create <code className="bg-amber-950 px-1 py-0.5 rounded border border-amber-800 font-mono text-[11px]">data/proof.json</code>.
                </span>
              </div>
            </div>
            <span className="px-2 py-1 rounded bg-amber-900/40 border border-amber-700/60 text-amber-300 font-mono text-[11px] shrink-0 self-start sm:self-center">
              DEMO MODE
            </span>
          </div>
        )}

        {/* State 2: Missing File Filling Instructions */}
        {mode === 'missing' && (
          <section
            aria-labelledby="filling-instructions-heading"
            className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/50 flex flex-col gap-4"
          >
            <h2 id="filling-instructions-heading" className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Proof Benchmark Filling Instructions
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed font-sans">
              Neither <code className="text-cyan-400 font-mono">data/proof.json</code> nor <code className="text-cyan-400 font-mono">data/proof.example.json</code> was found.
              To display an empirical comparison on this page, create a JSON file with the following structure:
            </p>
            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 overflow-x-auto text-xs font-mono text-cyan-300">
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
            <p className="text-xs text-zinc-400 font-sans">
              Place corresponding screenshot images inside the <code className="text-zinc-200 font-mono">public/proof/</code> directory.
            </p>
          </section>
        )}

        {/* Data Columns Display (Active or Placeholder) */}
        {data && (
          <div className="flex flex-col gap-6">
            {/* Defect Comparison Strip */}
            <section
              aria-label="Defect Comparison Strip"
              className="p-4 sm:p-5 rounded-lg border border-zinc-800 bg-zinc-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    Defect Comparison
                  </span>
                  <span className="text-sm font-semibold text-zinc-200 font-sans">
                    Agent Build Failure Rate
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 sm:gap-8 font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Raw Dictation:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-xs font-bold">
                    {data.rawTranscript?.defectCount ?? data.rawTranscript?.defects?.length ?? 0} defects
                  </span>
                </div>

                <span className="text-zinc-600 text-sm">&rarr;</span>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Linted Spec:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-bold">
                    {data.lintedSpec?.defectCount ?? data.lintedSpec?.defects?.length ?? 0} defects
                  </span>
                </div>

                {(data.rawTranscript?.defectCount ?? 0) > 0 && (
                  <div className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/80 text-cyan-300 text-xs font-bold">
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
              <article className="rounded-lg border border-rose-900/40 bg-zinc-900/50 overflow-hidden flex flex-col">
                {/* Screenshot Above */}
                <div className="relative w-full aspect-video bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-center overflow-hidden">
                  {data.rawTranscript.screenshot ? (
                    <img
                      src={data.rawTranscript.screenshot}
                      alt={data.rawTranscript.screenshotAlt || 'Screenshot of build from raw transcript'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="p-8 text-center text-xs text-zinc-600 font-mono">
                      No screenshot provided in public/proof
                    </div>
                  )}
                  <span className="absolute top-3 left-3 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-rose-950/90 text-rose-300 border border-rose-800/80 font-bold backdrop-blur-xs">
                    Raw Transcript Build
                  </span>
                </div>

                <div className="p-5 sm:p-6 flex flex-col gap-4 flex-1">
                  <div>
                    <h2 className="text-base font-semibold text-rose-300 tracking-tight">
                      {data.rawTranscript.title || 'Built from Raw Transcript'}
                    </h2>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed font-sans">
                      {data.rawTranscript.summary}
                    </p>
                  </div>

                  {/* Defect List */}
                  <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400 font-bold uppercase tracking-wider">
                        Documented Defects
                      </span>
                      <span className="text-rose-400 font-bold">
                        {data.rawTranscript.defects?.length || data.rawTranscript.defectCount || 0} issues
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                      {data.rawTranscript.defects && data.rawTranscript.defects.length > 0 ? (
                        data.rawTranscript.defects.map((defect) => (
                          <div
                            key={defect.id}
                            className="p-3 rounded-md bg-zinc-950/70 border border-zinc-800/80 flex flex-col gap-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] font-bold text-rose-300">
                                {defect.id}: {defect.title}
                              </span>
                              {defect.severity && (
                                <span
                                  className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                                    defect.severity === 'high'
                                      ? 'border-rose-900 bg-rose-950/60 text-rose-300'
                                      : 'border-amber-900 bg-amber-950/60 text-amber-300'
                                  }`}
                                >
                                  {defect.severity}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-normal font-sans">
                              {defect.description}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-zinc-500 font-mono italic">No defects recorded.</p>
                      )}
                    </div>
                  </div>
                </div>
              </article>

              {/* Column 2: Built from Linted Spec */}
              <article className="rounded-lg border border-emerald-900/40 bg-zinc-900/50 overflow-hidden flex flex-col">
                {/* Screenshot Above */}
                <div className="relative w-full aspect-video bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-center overflow-hidden">
                  {data.lintedSpec.screenshot ? (
                    <img
                      src={data.lintedSpec.screenshot}
                      alt={data.lintedSpec.screenshotAlt || 'Screenshot of build from linted specification'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="p-8 text-center text-xs text-zinc-600 font-mono">
                      No screenshot provided in public/proof
                    </div>
                  )}
                  <span className="absolute top-3 left-3 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-emerald-950/90 text-emerald-300 border border-emerald-800/80 font-bold backdrop-blur-xs">
                    Linted Spec Build
                  </span>
                </div>

                <div className="p-5 sm:p-6 flex flex-col gap-4 flex-1">
                  <div>
                    <h2 className="text-base font-semibold text-emerald-300 tracking-tight">
                      {data.lintedSpec.title || 'Built from Linted Spec'}
                    </h2>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed font-sans">
                      {data.lintedSpec.summary}
                    </p>
                  </div>

                  {/* Defect List */}
                  <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400 font-bold uppercase tracking-wider">
                        Documented Defects
                      </span>
                      <span className="text-emerald-400 font-bold">
                        {data.lintedSpec.defects?.length || data.lintedSpec.defectCount || 0} issues
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                      {data.lintedSpec.defects && data.lintedSpec.defects.length > 0 ? (
                        data.lintedSpec.defects.map((defect) => (
                          <div
                            key={defect.id}
                            className="p-3 rounded-md bg-zinc-950/70 border border-zinc-800/80 flex flex-col gap-1 text-xs"
                          >
                            <span className="font-mono text-[11px] font-bold text-emerald-300">
                              {defect.id}: {defect.title}
                            </span>
                            <p className="text-[11px] text-zinc-400 leading-normal font-sans">
                              {defect.description}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 rounded-md bg-emerald-950/20 border border-emerald-900/40 text-xs text-emerald-300 flex items-center gap-2 font-mono">
                          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        <div className="pt-4 border-t border-zinc-800 flex justify-between items-center text-xs font-mono">
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition">
            &larr; Return to Workspace
          </Link>
          <Link href="/about" className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition">
            Read Architecture &amp; Rules &rarr;
          </Link>
        </div>
      </main>
    </div>
  );
}

