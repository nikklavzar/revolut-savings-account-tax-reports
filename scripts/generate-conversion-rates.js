#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { TextDecoder } = require('node:util');
const Papa = require('papaparse');

const ECB_ARCHIVE_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip';
const ECB_ARCHIVE_ENTRY = 'eurofxref-hist.csv';

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const csv = await fetchHistoricalCsv();
    const rows = buildYearlyRates(csv, options.year);

    if (!rows.length) {
      throw new Error(`No conversion rates found for year ${options.year}.`);
    }

    ensureDirectory(options.outputPath);

    if (fs.existsSync(options.outputPath) && !options.force) {
      throw new Error(
        `Refusing to overwrite existing file at ${options.outputPath}. Use --force to override.`
      );
    }

    const payload = JSON.stringify(rows, null, 2) + '\n';
    fs.writeFileSync(options.outputPath, payload, 'utf8');
    console.log(
      `Saved ${rows.length} daily rate entries for ${options.year} to ${options.outputPath}`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  let year;
  let outputPath;
  let force = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--year' || token === '-y') {
      i += 1;
      year = parseYear(argv[i], token);
    } else if (token.startsWith('--year=')) {
      year = parseYear(token.split('=')[1], '--year');
    } else if (token === '--out' || token === '-o') {
      i += 1;
      outputPath = resolveOutput(argv[i]);
    } else if (token.startsWith('--out=')) {
      outputPath = resolveOutput(token.split('=')[1]);
    } else if (token === '--force' || token === '-f') {
      force = true;
    } else if (!token.startsWith('--') && year === undefined) {
      year = parseYear(token, 'year');
    } else if (!token.startsWith('--') && outputPath === undefined) {
      outputPath = resolveOutput(token);
    } else {
      throw new Error(`Unrecognised argument: ${token}`);
    }
  }

  if (year === undefined) {
    throw new Error('Missing required year argument. Pass --year=<YYYY> or provide it as the first positional argument.');
  }

  const resolvedOutput = outputPath ?? path.join(process.cwd(), 'public', `conversion-rates-${year}.json`);
  return { year, outputPath: resolvedOutput, force };
}

function parseYear(raw, label) {
  const year = Number.parseInt(raw, 10);
  if (!Number.isFinite(year) || String(year).length !== 4) {
    throw new Error(`Invalid ${label} value: ${raw}`);
  }
  return year;
}

function resolveOutput(rawPath) {
  if (!rawPath) {
    throw new Error('Expected output path after --out');
  }
  return path.resolve(process.cwd(), rawPath);
}

async function fetchHistoricalCsv() {
  const response = await fetch(ECB_ARCHIVE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download ECB historical rates archive: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const csv = extractFromZip(buffer, ECB_ARCHIVE_ENTRY);
  if (!csv) {
    throw new Error(`Could not find ${ECB_ARCHIVE_ENTRY} in downloaded archive.`);
  }
  return csv;
}

function extractFromZip(buffer, expectedFile) {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder();

  const EOCD_SIGNATURE = 0x06054b50;
  let eocdOffset = -1;
  for (let i = arrayBuffer.byteLength - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('End of central directory signature not found. Archive may be corrupt.');
  }

  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  const CENTRAL_SIGNATURE = 0x02014b50;
  const LOCAL_SIGNATURE = 0x04034b50;

  let targetEntry;
  let offset = centralDirectoryOffset;
  while (offset < centralDirectoryOffset + centralDirectorySize) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('Central directory signature mismatch.');
    }
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const fileName = decoder.decode(new Uint8Array(arrayBuffer, offset + 46, fileNameLength));

    if (fileName === expectedFile) {
      targetEntry = {
        compressionMethod,
        compressedSize,
        localHeaderOffset,
      };
      break;
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  if (!targetEntry) {
    return null;
  }

  const localOffset = targetEntry.localHeaderOffset;
  if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
    throw new Error('Local file header signature mismatch.');
  }

  const fileNameLength = view.getUint16(localOffset + 26, true);
  const extraFieldLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + fileNameLength + extraFieldLength;

  const compressedData = Buffer.from(arrayBuffer, dataStart, targetEntry.compressedSize);

  if (targetEntry.compressionMethod === 0) {
    return compressedData.toString('utf8');
  }

  if (targetEntry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressedData).toString('utf8');
  }

  throw new Error(`Unsupported compression method: ${targetEntry.compressionMethod}`);
}

function buildYearlyRates(csv, targetYear) {
  const parseResult = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: (field) => field !== 'Date',
  });

  if (parseResult.errors?.length) {
    const message = parseResult.errors.map((err) => err.message).join('; ');
    throw new Error(`Failed to parse CSV: ${message}`);
  }

  const rows = parseResult.data;
  const output = [];

  for (const row of rows) {
    const date = row.Date;
    if (!date) continue;
    const year = Number.parseInt(date.slice(0, 4), 10);
    if (year !== targetYear) continue;

    const rates = {};
    for (const [currency, value] of Object.entries(row)) {
      if (currency === 'Date') continue;
      if (typeof value === 'number' && Number.isFinite(value)) {
        rates[currency] = value;
      }
    }

    output.push({ date, rates });
  }

  output.sort((a, b) => (a.date < b.date ? 1 : -1));
  return output;
}

function ensureDirectory(targetPath) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
}

if (require.main === module) {
  main();
}

module.exports = { buildYearlyRates };
