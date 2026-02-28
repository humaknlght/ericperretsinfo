#!/usr/bin/env node
"use strict";

const fs = require("fs").promises;
const { existsSync } = require("fs");
const path = require("path");
const crypto = require("crypto");

const prodRoot = path.resolve(process.cwd(), process.argv[2] || "./prod");

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

function processHtaccess(content, hashMap) {
  let out = content;
  out = out.replace(/<(\/[^>]+\.(?:avif|webp|svg|ico|css|js|json))>/g, (match, p) => {
    const key = p.replace(/^\//, "");
    if (!hashMap.has(key)) return match;
    return `<${addParam(p, hashMap.get(key))}>`;
  });
  out = out.replace(/\\"\/prerender\.json\\"/g, () => {
    const key = "prerender.json";
    if (!hashMap.has(key)) return '\\"/prerender.json\\"';
    return `\\"/prerender.json?v=${hashMap.get(key)}\\"`;
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
  const htmlFiles = allFiles.filter(f => f.endsWith(".html"));
  const htaccessPath = path.join(prodRoot, ".htaccess");

  // 3. Update CSS (Pass 1)
  await Promise.all(cssFiles.map(async (f) => {
    const content = await fs.readFile(f, "utf8");
    const newContent = processCss(content, f, hashMap);
    if (newContent !== content) await fs.writeFile(f, newContent, "utf8");
  }));

  // 4. Re-Hash (because CSS content changed)
  hashMap = await buildHashMap();

  // 5. Update HTML and .htaccess (Pass 2)
  const finalTasks = htmlFiles.map(async (f) => {
    const content = await fs.readFile(f, "utf8");
    const newContent = processHtml(content, f, hashMap);
    if (newContent !== content) await fs.writeFile(f, newContent, "utf8");
  });

  if (existsSync(htaccessPath)) {
    finalTasks.push((async () => {
      const content = await fs.readFile(htaccessPath, "utf8");
      const newContent = processHtaccess(content, hashMap);
      if (newContent !== content) await fs.writeFile(htaccessPath, newContent, "utf8");
    })());
  }

  await Promise.all(finalTasks);
  console.log(`Cache-bust complete in ${(Date.now() - startTime) / 1000}s.`);
}

main();