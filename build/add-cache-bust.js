#!/usr/bin/env node
"use strict";

const fs = require("fs");
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

function isFirstParty(url) {
  const u = url.trim();
  return !THIRD_PARTY_PREFIXES.some((p) => u.startsWith(p));
}

function relativeKey(absolutePath) {
  const rel = path.relative(prodRoot, absolutePath);
  return rel.split(path.sep).join("/");
}

function md5Base64Url(content) {
  const base64 = crypto.createHash("md5").update(content).digest("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildHashMap() {
  const hashMap = new Map();
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const key = relativeKey(full);
        const content = fs.readFileSync(full);
        const hash = md5Base64Url(content);
        hashMap.set(key, hash);
      }
    }
  }
  walk(prodRoot);
  return hashMap;
}

function resolveToKey(refPath, fromDir) {
  let pathPart = refPath.replace(/^\/+/, "");
  try {
    pathPart = decodeURIComponent(pathPart);
  } catch (_) {
    // leave pathPart as-is if not valid URI component
  }
  const isRootRelative = /^\//.test(refPath);
  const abs = isRootRelative
    ? path.join(prodRoot, pathPart)
    : path.resolve(fromDir, pathPart);
  if (!abs.startsWith(prodRoot)) return null;
  const key = path.relative(prodRoot, abs).split(path.sep).join("/");
  return key;
}

function addParam(url, hash) {
  const q = url.includes("?") ? "&" : "?";
  return `${url}${q}v=${hash}`;
}

function processHtml(content, filePath, hashMap) {
  const dir = path.dirname(filePath);
  let out = content;

  // href="..."
  out = out.replace(/href="([^"]*)"/g, (_, url) => {
    if (!isFirstParty(url)) return `href="${url}"`;
    const key = resolveToKey(url.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return `href="${url}"`;
    const hash = hashMap.get(key);
    return `href="${addParam(url, hash)}"`;
  });

  // src="..."
  out = out.replace(/src="([^"]*)"/g, (_, url) => {
    if (!isFirstParty(url)) return `src="${url}"`;
    const key = resolveToKey(url.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return `src="${url}"`;
    const hash = hashMap.get(key);
    return `src="${addParam(url, hash)}"`;
  });

  // srcset="url1 1x, url2 2x" — only the URL part of each descriptor
  out = out.replace(/srcset="([^"]*)"/g, (_, srcset) => {
    const parts = srcset.split(",").map((p) => p.trim());
    const newParts = parts.map((part) => {
      const idx = part.search(/\s/);
      const url = idx === -1 ? part : part.slice(0, idx);
      const rest = idx === -1 ? "" : part.slice(idx);
      if (!isFirstParty(url)) return part;
      const key = resolveToKey(url.split("?")[0], dir);
      if (!key || !hashMap.has(key)) return part;
      const hash = hashMap.get(key);
      return addParam(url, hash) + rest;
    });
    return `srcset="${newParts.join(", ")}"`;
  });

  // style="... url(...) ..."
  out = out.replace(/style="([^"]*)"/g, (_, styleContent) => {
    const newStyle = styleContent.replace(
      /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/g,
      (match, url) => {
        const u = url.trim();
        if (!isFirstParty(u)) return match;
        const key = resolveToKey(u.split("?")[0], dir);
        if (!key || !hashMap.has(key)) return match;
        const hash = hashMap.get(key);
        const newUrl = addParam(u, hash);
        return `url(${newUrl})`;
      }
    );
    return `style="${newStyle}"`;
  });

  // onclick="..." and similar: rewrite 1st-party URLs in single-quoted strings (e.g. window.location.href='...')
  out = out.replace(/onclick="([^"]*)"/g, (_, onclickContent) => {
    const newContent = onclickContent.replace(/'([^']*)'/g, (match, url) => {
      if (!isFirstParty(url)) return match;
      const key = resolveToKey(url.split("?")[0], dir);
      if (!key || !hashMap.has(key)) return match;
      const hash = hashMap.get(key);
      return `'${addParam(url, hash)}'`;
    });
    return `onclick="${newContent}"`;
  });

  return out;
}

function processCss(content, filePath, hashMap) {
  const dir = path.dirname(filePath);
  let out = content;

  // url('...') and url("...")
  out = out.replace(/url\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match, url) => {
    const u = url.trim();
    if (!isFirstParty(u)) return match;
    const key = resolveToKey(u.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return match;
    const hash = hashMap.get(key);
    const newUrl = addParam(u, hash);
    const quote = match.includes('"') ? '"' : "'";
    return `url(${quote}${newUrl}${quote})`;
  });

  // url(...) unquoted (e.g. minified url(img/bg0.avif))
  out = out.replace(/url\s*\(\s*([^'")\s]+)\s*\)/g, (match, url) => {
    const u = url.trim();
    if (!isFirstParty(u)) return match;
    const key = resolveToKey(u.split("?")[0], dir);
    if (!key || !hashMap.has(key)) return match;
    const hash = hashMap.get(key);
    return `url(${addParam(u, hash)})`;
  });

  return out;
}

function processHtaccess(content, hashMap) {
  let out = content;

  // Link header: </img/bg0.avif> -> </img/bg0.avif?v=HASH>
  out = out.replace(/<(\/[^>]+\.(?:avif|webp|svg|ico|css|js|json))>/g, (match, p) => {
    const key = p.replace(/^\//, "");
    if (!hashMap.has(key)) return match;
    const hash = hashMap.get(key);
    return `<${addParam(p, hash)}>`;
  });

  // Speculation-Rules: "\"/prerender.json\"" -> "\"/prerender.json?v=HASH\""
  out = out.replace(/\\"\/prerender\.json\\"/g, () => {
    const key = "prerender.json";
    if (!hashMap.has(key)) return '\\"/prerender.json\\"';
    const hash = hashMap.get(key);
    return `\\"/prerender.json?v=${hash}\\"`;
  });

  return out;
}

function main() {
  if (!fs.existsSync(prodRoot)) {
    console.error("add-cache-bust: prod directory not found:", prodRoot);
    process.exit(1);
  }

  const hashMap = buildHashMap();

  // HTML
  const htmlFiles = [];
  function findHtml(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) findHtml(full);
      else if (e.name.endsWith(".html")) htmlFiles.push(full);
    }
  }
  findHtml(prodRoot);
  for (const f of htmlFiles) {
    const content = fs.readFileSync(f, "utf8");
    const newContent = processHtml(content, f, hashMap);
    if (newContent !== content) fs.writeFileSync(f, newContent, "utf8");
  }

  // CSS
  const cssFiles = [];
  function findCss(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) findCss(full);
      else if (e.name.endsWith(".css")) cssFiles.push(full);
    }
  }
  findCss(prodRoot);
  for (const f of cssFiles) {
    const content = fs.readFileSync(f, "utf8");
    const newContent = processCss(content, f, hashMap);
    if (newContent !== content) fs.writeFileSync(f, newContent, "utf8");
  }

  // Root .htaccess only
  const htaccessPath = path.join(prodRoot, ".htaccess");
  if (fs.existsSync(htaccessPath)) {
    const content = fs.readFileSync(htaccessPath, "utf8");
    const newContent = processHtaccess(content, hashMap);
    if (newContent !== content) fs.writeFileSync(htaccessPath, newContent, "utf8");
  }

  console.log("Cache-bust complete.");
}

main();
