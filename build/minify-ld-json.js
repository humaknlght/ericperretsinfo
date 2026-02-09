#!/usr/bin/env node
/**
 * Minifies JSON inside <script type="application/ld+json"> tags in HTML files.
 * Usage: node minify-ld-json.js <dir>
 * Example: node minify-ld-json.js ./prod
 */

const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || './prod';

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  const regex = /<script([^>]*)\s+type\s*=\s*["']application\/ld\+json["']([^>]*)>([\s\S]*?)<\/script>/gi;
  let replaced = false;
  html = html.replace(regex, (_, before, after, jsonStr) => {
    try {
      const minified = JSON.stringify(JSON.parse(jsonStr.trim()));
      replaced = true;
      return `<script${before} type="application/ld+json"${after}>${minified}</script>`;
    } catch (e) {
      console.error(`Failed to minify JSON-LD in ${filePath}:`, e.message);
      return arguments[0];
    }
  });
  if (replaced) {
    fs.writeFileSync(filePath, html);
    console.log(`Minified JSON-LD in ${filePath}`);
  }
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dirPath, ent.name);
    if (ent.isDirectory()) {
      walk(full);
    } else if (ent.isFile() && /\.html$/i.test(ent.name)) {
      processFile(full);
    }
  }
}

if (!fs.existsSync(dir)) {
  console.error(`Directory not found: ${dir}`);
  process.exit(1);
}
walk(path.resolve(dir));
