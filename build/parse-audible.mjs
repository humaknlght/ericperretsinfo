#!/usr/bin/env node
/**
 * Converts an Audible Library Extractor "Raw data" CSV export into
 * src/books/library.json for the site to consume.
 *
 * Usage:
 *   node build/parse-audible.mjs path/to/AudibleLibrary.csv
 *
 * The Audible Library Extractor Chrome extension can be found at:
 * https://chromewebstore.google.com/detail/audible-library-extractor/deifcolkciolkllaikijldnjeloeaall
 *
 * After exporting, if the cover URL field is empty for a book this script
 * will attempt to retrieve a cover from the Open Library Covers API
 * (https://openlibrary.org) using the book title and author.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dirname, '..', 'src');
const OUT_PATH = resolve(SRC_ROOT, 'books', 'library.json');

const csvPath = process.argv[2];
if (!csvPath) {
    console.error('Usage: node build/parse-audible.mjs path/to/AudibleLibrary.csv');
    process.exit(1);
}

console.log(`Reading ${csvPath}…`);
// Strip UTF-8 BOM if present — some apps prepend \uFEFF which corrupts the first header name
const rawText = readFileSync(resolve(csvPath), 'utf8');
const csvText = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText;
const rows = parseCsv(csvText);

if (rows.length === 0) {
    console.error('No rows found in CSV. Check that the file is a valid Raw data export.');
    process.exit(1);
}

// Print all column names to help diagnose mismatches
const columnNames = Object.keys(rows[0]);
console.log(`Columns found (${columnNames.length}): ${columnNames.join(', ')}`);

// Find the status column — match any column whose name contains "status" or "progress"
const statusColumnName = columnNames.find(k => {
    const l = k.toLowerCase();
    return l === 'status' || l === 'myprogress' || l.includes('status') || l.includes('progress');
});

if (statusColumnName) {
    const uniqueValues = [...new Set(rows.map(r => r[statusColumnName]).filter(Boolean))];
    console.log(`Status column: "${statusColumnName}" — values: ${uniqueValues.join(', ')}`);
} else {
    console.warn('⚠ No status/progress column found — all books will be included.');
}

console.log(`Parsed ${rows.length} books from CSV. Resolving covers…`);

const books = await Promise.all(rows.map(async row => {
    const title       = str(row, 'title');
    const author      = normalizeList(str(row, 'authors') || str(row, 'author'));
    const narrator    = normalizeList(str(row, 'narrators') || str(row, 'narrator'));
    const durationMin = parseInt(str(row, 'runtimeLengthMin') || str(row, 'runtimelengthmin') || '0', 10);
    const ratingRaw   = parseInt(str(row, 'myRating') || str(row, 'myrating') || str(row, 'rating') || '0', 10);
    const rating      = ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : 0;
    const purchaseDate = str(row, 'dateAdded') || str(row, 'dateadded') || str(row, 'purchaseDate') || str(row, 'purchasedate');
    const status      = statusColumnName ? (row[statusColumnName] ?? '').trim() : '';
    const asin        = str(row, 'asin');
    const audibleUrl  = asin ? `https://www.audible.com/pd/${asin}` : '';
    let coverUrl      = str(row, 'cover') || str(row, 'coverUrl') || str(row, 'coverurl') || str(row, 'image') || str(row, 'imageUrl') || str(row, 'imageurl');

    if (!coverUrl && title) {
        coverUrl = await fetchOpenLibraryCover(title, author);
    }

    return { title, author, narrator, duration: formatDuration(durationMin), rating, purchaseDate, coverUrl, audibleUrl, status };
}));

// Only include books the user has finished. If the CSV has no status column,
// every row passes through (supports hand-maintained files).
const filtered = books.filter(b => {
    if (!b.title) return false;
    if (statusColumnName) return b.status.toLowerCase() === 'finished';
    return true;
}).map(({ status: _status, ...rest }) => rest); // drop internal status field from output

console.log(`Filtered to ${filtered.length} finished books (excluded ${rows.length - filtered.length}).`);

mkdirSync(resolve(SRC_ROOT, 'books'), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(filtered, null, 2), 'utf8');
console.log(`✓ Wrote ${filtered.length} books to src/books/library.json`);


// --- Helpers ---

/**
 * Looks up a book cover via the Open Library Search API and returns
 * a cover thumbnail URL, or an empty string if nothing is found.
 */
async function fetchOpenLibraryCover(title, author) {
    try {
        const q = new URLSearchParams({ title, author, limit: '1', fields: 'cover_i' });
        const res = await fetch(`https://openlibrary.org/search.json?${q}`);
        if (!res.ok) return '';
        const data = await res.json();
        const coverId = data?.docs?.[0]?.cover_i;
        if (!coverId) return '';
        return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
    } catch {
        return '';
    }
}

/** Convert raw minutes to a human-readable string like "8 hr 23 min". */
function formatDuration(minutes) {
    if (!minutes || isNaN(minutes) || minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
}

/**
 * The extractor sometimes wraps list fields in JSON-array notation:
 *   ["Andy Weir"] or ["Ray Porter","Someone Else"]
 * This strips the brackets/quotes and joins with ", ".
 */
function normalizeList(raw) {
    if (!raw) return '';
    const cleaned = raw.replace(/^\[/, '').replace(/\]$/, '').replace(/"/g, '');
    return cleaned.split(',').map(s => s.trim()).filter(Boolean).join(', ');
}

/** Case-insensitive column lookup (returns trimmed string or ''). */
function str(row, key) {
    const lower = key.toLowerCase();
    const found = Object.keys(row).find(k => k.toLowerCase() === lower);
    return found ? (row[found] ?? '').trim() : '';
}

/**
 * Minimal RFC 4180 CSV parser. Handles:
 *   - quoted fields (commas/newlines inside quotes)
 *   - doubled-quote escape ("")
 *   - CRLF and LF line endings
 * Returns an array of objects keyed by the header row.
 */
function parseCsv(text) {
    const rows = tokenize(text);
    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(fields => {
        const obj = {};
        headers.forEach((h, i) => { obj[h.trim()] = fields[i] ?? ''; });
        return obj;
    });
}

function tokenize(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(field);
                field = '';
            } else if (ch === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else if (ch === '\r') {
                // skip — handled by '\n'
            } else {
                field += ch;
            }
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    // Drop trailing blank rows
    while (rows.length && rows[rows.length - 1].every(f => f === '')) {
        rows.pop();
    }
    return rows;
}
