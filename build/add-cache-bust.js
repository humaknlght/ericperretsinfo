#!/usr/bin/env node
"use strict";

const fs = require("fs").promises;
const { existsSync } = require("fs");
const path = require("path");
const crypto = require("crypto");

// Default to build/prod beside this script (not cwd ./prod, which is wrong from repo root).
const prodRoot = path.resolve(process.argv[2] || path.join(__dirname, "prod"));
const defaultProdRoot = path.resolve(path.join(__dirname, "prod"));
const srcHtaccessPath = path.join(__dirname, "..", "src", ".htaccess");

const THIRD_PARTY_PREFIXES = [
  "http://",
  "https://",
  "//",
  "mailto:",
  "tel:",
  "data:",
  "#",
  "?",
];

// --- HELPER FUNCTIONS (Your Original Logic) ---

function isFirstParty(url) {
  const u = url.trim();
  return !THIRD_PARTY_PREFIXES.some((p) => u.startsWith(p));
}

function md5Base64Url(content) {
  const base64 = crypto.createHash("md5").update(content).digest("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function resolveToKey(refPath, fromDir) {
  let pathPart = refPath.replace(/^\/+/, "");
  try {
    pathPart = decodeURIComponent(pathPart);
  } catch (_) { }
  const isRootRelative = /^\//.test(refPath);
  const abs = isRootRelative
    ? path.join(prodRoot, pathPart)
    : path.resolve(fromDir, pathPart);
  if (!abs.startsWith(prodRoot)) return null;
  return path.relative(prodRoot, abs).split(path.sep).join("/");
}

function addParam(url, hash) {
  const q = url.includes("?") ? "&" : "?";
  return `${url}${q}v=${hash}`;
}

function withVersion(url, hash) {
  const base = url.split("?")[0];
  return `${base}?v=${hash}`;
}

// Link / Speculation-Rules refs in .htaccess: </path/file.ext> or </path/file.ext?v=old>
const HTACCESS_LINK_REF_RE =
  /<(\/[^>?]+\.(?:avif|webp|svg|ico|css|js|json|html|mp4|png))(?:\?v=[^>]*)?>/g;

// --- PROCESSING LOGIC (Your Original Regexes) ---

function processHtml(content, filePath, hashMap) {
  const dir = path.dirname(filePath);
  let out = content;

  out = out.replace(/href="([^"]*)"/g, (_, url) => {
    if (!isFirstParty(url)) return `href="${url}"`;
    const key = resolveToKey(url.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return `href="${url}"`;
    return `href="${addParam(url, hashMap.get(key))}"`;
  });

  out = out.replace(/src="([^"]*)"/g, (_, url) => {
    if (!isFirstParty(url)) return `src="${url}"`;
    const key = resolveToKey(url.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return `src="${url}"`;
    return `src="${addParam(url, hashMap.get(key))}"`;
  });

  out = out.replace(/srcset="([^"]*)"/g, (_, srcset) => {
    const parts = srcset.split(",").map((p) => p.trim());
    const newParts = parts.map((part) => {
      const idx = part.search(/\s/);
      const url = idx === -1 ? part : part.slice(0, idx);
      const rest = idx === -1 ? "" : part.slice(idx);
      if (!isFirstParty(url)) return part;
      const key = resolveToKey(url.split("?")[0], dir);
      if (!key || !hashMap.has(key)) return part;
      return addParam(url, hashMap.get(key)) + rest;
    });
    return `srcset="${newParts.join(", ")}"`;
  });

  out = out.replace(/style="([^"]*)"/g, (_, styleContent) => {
    return `style="${styleContent.replace(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, url) => {
      const u = url.trim();
      if (!isFirstParty(u)) return match;
      const key = resolveToKey(u.split("?")[0], dir);
      if (!key || !hashMap.has(key)) return match;
      return `url(${addParam(u, hashMap.get(key))})`;
    })}"`;
  });

  out = out.replace(/onclick="([^"]*)"/g, (_, onclickContent) => {
    return `onclick="${onclickContent.replace(/'([^']*)'/g, (match, url) => {
      if (!isFirstParty(url)) return match;
      const key = resolveToKey(url.split("?")[0], dir);
      if (!key || !hashMap.has(key)) return match;
      return `'${addParam(url, hashMap.get(key))}'`;
    })}"`;
  });

  return out;
}

function processCss(content, filePath, hashMap) {
  const dir = path.dirname(filePath);
  let out = content;

  out = out.replace(/url\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match, url) => {
    const u = url.trim();
    if (!isFirstParty(u)) return match;
    const key = resolveToKey(u.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return match;
    const quote = match.includes('"') ? '"' : "'";
    return `url(${quote}${addParam(u, hashMap.get(key))}${quote})`;
  });

  out = out.replace(/url\s*\(\s*([^'")\s]+)\s*\)/g, (match, url) => {
    const u = url.trim();
    if (!isFirstParty(u)) return match;
    const key = resolveToKey(u.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return match;
    return `url(${addParam(u, hashMap.get(key))})`;
  });

  return out;
}

// Rewrites quoted string literals in JS that look like first-party paths
// to .js / .css / .json / .html files. This covers dynamic import('./art.js'),
// ensureCss('art.css'), fetch('books/library.json'), and fragment fetches
// like fetch('/art/art.html') that the upstream CSS/HTML passes don't see.
function processJs(content, filePath, hashMap) {
  const dir = path.dirname(filePath);
  let out = content;

  out = out.replace(/(['"])((?:\.{1,2}\/|\/)?[\w./-]+\.(?:js|css|json|html))\1/g, (match, quote, url) => {
    if (!isFirstParty(url)) return match;
    const key = resolveToKey(url.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return match;
    return `${quote}${addParam(url, hashMap.get(key))}${quote}`;
  });

  return out;
}

function processHtaccess(content, hashMap) {
  let out = content;
  out = out.replace(HTACCESS_LINK_REF_RE, (match, p) => {
    const key = p.replace(/^\//, "");
    if (!hashMap.has(key)) return match;
    return `<${withVersion(p, hashMap.get(key))}>`;
  });
  out = out.replace(/\\"(\/prerender\.json)(?:\?v=[^\\"]*)?\\"/g, (match, p) => {
    const key = p.replace(/^\//, "");
    if (!hashMap.has(key)) return match;
    return `\\"${withVersion(p, hashMap.get(key))}\\"`;
  });
  out = out.replace(/(ErrorDocument\s+\d+\s+)(\/\S+\.html)(?:\?v=\S+)?/g, (match, prefix, p) => {
    const key = p.replace(/^\//, "");
    if (!hashMap.has(key)) return match;
    return prefix + withVersion(p, hashMap.get(key));
  });
  return out;
}

// --- OPTIMIZED CORE EXECUTION ---

async function buildHashMap() {
  const hashMap = new Map();
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(entries.map(async (e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) {
        const content = await fs.readFile(full);
        const key = path.relative(prodRoot, full).split(path.sep).join("/");
        hashMap.set(key, md5Base64Url(content));
      }
    }));
  }
  await walk(prodRoot);
  return hashMap;
}

async function main() {
  if (!existsSync(prodRoot)) {
    console.error("add-cache-bust: prod directory not found:", prodRoot);
    process.exit(1);
  }

  const startTime = Date.now();

  // 1. Initial Hash
  let hashMap = await buildHashMap();

  // 2. Scan directory once for all target files
  const allFiles = [];
  async function findFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await findFiles(full);
      else allFiles.push(full);
    }
  }
  await findFiles(prodRoot);

  const cssFiles = allFiles.filter(f => f.endsWith(".css"));
  const jsFiles = allFiles.filter(f => f.endsWith(".js"));
  // Split JS into lazy-loaded modules (subdirectories) and root entry points.
  // Modules must be processed first because their content changes (e.g. fetch
  // URLs get a ?v=hash) which in turn changes their own hash, which the entry
  // point must reference correctly.
  const jsModules    = jsFiles.filter(f => path.dirname(f) !== prodRoot);
  const jsEntryPoints = jsFiles.filter(f => path.dirname(f) === prodRoot);
  const htmlFiles = allFiles.filter(f => f.endsWith(".html"));
  const htaccessFiles = allFiles.filter((f) => path.basename(f) === ".htaccess");

  // 3. Update CSS (Pass 1) — rewrites url() refs to images
  await Promise.all(cssFiles.map(async (f) => {
    const content = await fs.readFile(f, "utf8");
    const newContent = processCss(content, f, hashMap);
    if (newContent !== content) await fs.writeFile(f, newContent, "utf8");
  }));

  // 4. Re-Hash (CSS content changed; JS will reference CSS, so we need fresh hashes)
  hashMap = await buildHashMap();

  // 5a. Update JS modules (Pass 2a) — lazy-loaded chunks like tea/tea.js and
  //     art/art.js. These contain fetch() calls to HTML fragments whose hashes
  //     just changed; rewriting them changes the module files themselves.
  await Promise.all(jsModules.map(async (f) => {
    const content = await fs.readFile(f, "utf8");
    const newContent = processJs(content, f, hashMap);
    if (newContent !== content) await fs.writeFile(f, newContent, "utf8");
  }));

  // 5b. Re-Hash (module content changed; entry points reference modules)
  hashMap = await buildHashMap();

  // 5c. Update JS entry points (Pass 2b) — script-of-awesomeness.js and any
  //     other root-level JS. Now references to ./tea/tea.js etc. use the hash
  //     that reflects the already-rewritten module content.
  await Promise.all(jsEntryPoints.map(async (f) => {
    const content = await fs.readFile(f, "utf8");
    const newContent = processJs(content, f, hashMap);
    if (newContent !== content) await fs.writeFile(f, newContent, "utf8");
  }));

  // 6. Re-Hash again (JS content changed; HTML will reference JS)
  hashMap = await buildHashMap();

  // 7. Update HTML and .htaccess (Pass 3)
  const finalTasks = htmlFiles.map(async (f) => {
    const content = await fs.readFile(f, "utf8");
    const newContent = processHtml(content, f, hashMap);
    if (newContent !== content) await fs.writeFile(f, newContent, "utf8");
  });

  for (const htaccessPath of htaccessFiles) {
    finalTasks.push((async () => {
      const content = await fs.readFile(htaccessPath, "utf8");
      const newContent = processHtaccess(content, hashMap);
      if (newContent !== content) await fs.writeFile(htaccessPath, newContent, "utf8");
    })());
  }

  // Keep src/.htaccess in sync so the next build copy starts with versioned URLs
  // that match the processed app (Link preload headers, prerender.json, 404 page).
  if (prodRoot === defaultProdRoot && existsSync(srcHtaccessPath)) {
    finalTasks.push((async () => {
      const content = await fs.readFile(srcHtaccessPath, "utf8");
      const newContent = processHtaccess(content, hashMap);
      if (newContent !== content) await fs.writeFile(srcHtaccessPath, newContent, "utf8");
    })());
  }

  await Promise.all(finalTasks);
  console.log(`Cache-bust complete in ${(Date.now() - startTime) / 1000}s.`);
}

main();