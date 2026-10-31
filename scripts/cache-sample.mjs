import fs from 'node:fs';
import path from 'node:path';

async function cacheSample() {
  const dataDir = path.resolve(process.cwd(), 'data');

  let transcriptPath = path.join(dataDir, 'sample-transcript.txt');
  if (!fs.existsSync(transcriptPath)) {
    transcriptPath = path.join(dataDir, 'sample transcript.txt');
  }

  if (!fs.existsSync(transcriptPath)) {
    console.error(`Error: Sample transcript file not found at ${transcriptPath}`);
    process.exit(1);
  }

  const transcript = fs.readFileSync(transcriptPath, 'utf8');

  console.log(`Read ${transcript.length} characters from ${path.basename(transcriptPath)}`);
  if (transcript.trim().length === 0) {
    console.error('Error: sample-transcript.txt is currently empty.');
    process.exit(1);
  }

  const endpoint = 'http://localhost:3000/api/lint';
  console.log(`Posting transcript to ${endpoint}...`);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcript }),
    });

    const status = res.status;
    const data = await res.json().catch(() => null);

    if (status !== 200 || !data) {
      console.error(`\nFailed with HTTP Status ${status}:`);
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    // Save the lint result without the request ID
    const { requestId: _id, cached: _c, ...lintResult } = data;

    const outputPath = path.join(dataDir, 'sample-lint.json');
    fs.writeFileSync(outputPath, JSON.stringify(lintResult, null, 2), 'utf8');

    // Also write to sample lint.json to cover both path conventions
    const altOutputPath = path.join(dataDir, 'sample lint.json');
    fs.writeFileSync(altOutputPath, JSON.stringify(lintResult, null, 2), 'utf8');

    console.log(`\nHTTP Status: ${status}`);
    console.log(`Success! Saved lint result without request ID to ${outputPath}`);
  } catch (err) {
    const isConnRefused =
      (err && typeof err === 'object' && ('code' in err && err.code === 'ECONNREFUSED')) ||
      (err && typeof err === 'object' && 'cause' in err && (err.cause?.code === 'ECONNREFUSED' || err.cause?.message?.includes('ECONNREFUSED')));

    if (isConnRefused || (err instanceof TypeError && err.message === 'fetch failed')) {
      console.error('\nError: Could not connect to http://localhost:3000. Is the Next.js dev server running?');
      console.error('Run "npm run dev" in another terminal before running "npm run cache:sample".');
    } else {
      console.error('\nRequest failed:', err instanceof Error ? err.message : err);
    }
    process.exit(1);
  }
}

cacheSample();

