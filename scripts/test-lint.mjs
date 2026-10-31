import fs from 'node:fs';
import path from 'node:path';

async function testLint() {
  const filePath = path.resolve(process.cwd(), 'data', 'sample-transcript.txt');

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    process.exit(1);
  }

  const transcript = fs.readFileSync(filePath, 'utf8');

  console.log(`Read ${transcript.length} characters from data/sample-transcript.txt`);
  if (transcript.trim().length === 0) {
    console.warn('Notice: data/sample-transcript.txt is currently empty. The API route expects between 80 and 12,000 characters.');
  }

  const endpoint = 'http://localhost:3000/api/lint';
  console.log(`Sending POST request to ${endpoint}...`);

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

    console.log(`\nHTTP Status: ${status}`);
    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));

    if (!res.ok) {
      process.exitCode = 1;
    }
  } catch (err) {
    const isConnRefused =
      (err && typeof err === 'object' && ('code' in err && err.code === 'ECONNREFUSED')) ||
      (err && typeof err === 'object' && 'cause' in err && (err.cause?.code === 'ECONNREFUSED' || err.cause?.message?.includes('ECONNREFUSED')));

    if (isConnRefused || (err instanceof TypeError && err.message === 'fetch failed')) {
      console.error('\nError: Could not connect to http://localhost:3000. Is the Next.js dev server running?');
      console.error('Run "npm run dev" in another terminal before running "npm run test:lint".');
    } else {
      console.error('\nRequest failed:', err instanceof Error ? err.message : err);
    }
    process.exit(1);
  }
}

testLint();

