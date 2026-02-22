#!/bin/bash -p

set -euo pipefail

# --- 1. SETUP ---
npm install -g typescript

# Same as before: clean and copy the source files
echo "Cleaning up and copying source files..."
rm -rf ./prod
mkdir ./prod
cp -r ../src/ ./prod/

 # Get the last modified timestamp for the resume
echo "Setting last modified timestamp..."
NUM=`stat -f "%Sm" -t "%s" ../src/resume/index.html`"000"
sed -i.bk "s:/\*LAST_MODIFIED\*/:$NUM:" ./prod/resume/index.html
rm -f ./prod/resume/index.html.bk

# --- 2. MINIFICATION ---

echo "Minifying all CSS files..."
#npm install --save-dev postcss-cli
find ./prod -type f -name '*.css' -exec dirname {} + | sort | uniq | while read -r DIR; do
    echo "Processing CSS in directory: ${DIR}"
    npx postcss "${DIR}"/*.css --dir "${DIR}" --no-map --verbose
done

echo "Minifying all HTML files..."
#npm install html-minifier-next -g
# This finds all .html files in ./prod and its subdirectories
find ./prod -name "*.html" -type f | while read -r file; do
    echo "Processing: $file"
    
    npx html-minifier-next "$file" \
        --output "$file" \
        --remove-comments \
        --collapse-whitespace \
        --collapse-boolean-attributes \
        --remove-redundant-attributes \
        --remove-script-type-attributes \
        --remove-style-link-type-attributes \
        --decode-entities \
        --use-short-doctype \
        --minify-js true \
        --minify-css true \
        --sort-class-names \
        --trim-custom-fragments
done

echo "Minifying JSON-LD in HTML files..."
node minify-ld-json.js ./prod

echo "Compiling typescript files..."
tsc

#npm install terser -g
echo "Minifying all JS files..."
find ./prod -name '*.js' | while read FILE; do
    echo "Minifying ${FILE}"
    # The '--source-map' option with 'url=inline' is a common practice.
    # The '--preamble' option is a clean way to add the header comment.
    npx terser "${FILE}" \
      --compress \
      --mangle \
      --config-file terser_options.json \
      --preamble "//# allFunctionsCalledOnLoad" \
      -o "${FILE}"
done

# --- 2b. CACHE-BUST 1ST PARTY RESOURCES ---
echo "Adding cache-bust parameters to 1st party resources..."
node add-cache-bust.js ./prod

# --- 3. COMPRESSION (PARALLELIZED) ---

# https://github.com/google/brotli
# https://github.com/google/zopfli
# https://github.com/facebook/zstd
echo "Compressing files with zopfli and brotli in parallel..."
NUM_CORES=$(getconf _NPROCESSORS_ONLN)
find ./prod -type f \( \
    -name "*.html" -o \
    -name "*.css" -o \
    -name "*.js" -o \
    -name "*.ico" -o \
    -name "*.svg" -o \
    -name "*.pdf" \
\) | xargs -P $NUM_CORES -I {} sh -c '
    echo "Compressing {}"
    ./zopfli -i100 "{}"
    brotli -f -q 11 --lgwin=24 "{}"
'

echo "Build complete!"