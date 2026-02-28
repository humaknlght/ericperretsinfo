#!/usr/bin/env node
/**
 * Optimized: Minifies JSON-LD using asynchronous parallel processing.
 * This version processes all files in a directory simultaneously.
 */

const fs = require('fs').promises;
const path = require('path');

const dir = process.argv[2] || './prod';

/**
 * Minifies a single HTML file's JSON-LD scripts.
 */
async function processFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const regex = /<script([^>]*)\s+type\s*=\s*["']application\/ld\+json["']([^>]*)>([\s\S]*?)<\/script>/gi;

    let replaced = false;
    const newHtml = data.replace(regex, (_, before, after, jsonStr) => {
      try {
        // Parse and re-stringify to strip all whitespace
        const minified = JSON.stringify(JSON.parse(jsonStr.trim()));
        replaced = true;
        return `<script${before} type="application/ld+json"${after}>${minified}</script>`;
      } catch (e) {
        console.error(`⚠️  Malformed JSON in ${filePath}:`, e.message);
        return _; // Return the original match if parsing fails
      }
    });

    if (replaced) {
      await fs.writeFile(filePath, newHtml);
      console.log(`✅ Minified: ${filePath}`);
    }
  } catch (err) {
    console.error(`❌ Error processing ${filePath}:`, err);
  }
}

/**
 * Recursively walks the directory and processes HTML files in parallel.
 */
async function walkAndProcess(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  // Create an array of promises for parallel execution
  const tasks = entries.map(async (ent) => {
    const fullPath = path.join(dirPath, ent.name);

    if (ent.isDirectory()) {
      // Recurse into subdirectories
      return walkAndProcess(fullPath);
    } else if (ent.isFile() && /\.html$/i.test(ent.name)) {
      // Process the HTML file
      return processFile(fullPath);
    }
  });

  // Execute all tasks in this directory level concurrently
  await Promise.all(tasks);
}



// --- Execution Entry Point ---
async function run() {
  const startTime = Date.now();
  try {
    const absolutePath = path.resolve(dir);

    // Ensure directory exists before starting
    await fs.access(absolutePath);

    await walkAndProcess(absolutePath);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`--- JSON-LD Minification Complete in ${duration}s ---`);
  } catch (err) {
    console.error(`Critical Error: ${err.message}`);
    process.exit(1);
  }
}

run();