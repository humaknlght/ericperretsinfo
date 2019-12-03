#!/bin/bash -p

set -ue

rm -rf ./prod
mkdir ./prod
cp -r ../src/ ./prod/
NUM=`stat -f "%Sm" -t "%s" ../src/resume/index.html`"000"
sed -i .bk "s:/\*LAST_MODIFIED\*/:$NUM:" ./prod/resume/index.html
rm -f ./prod/resume/index.html.bk
shopt -s nullglob
#npm install uglifycss -g
for FILE in ./prod/*.css ./prod/resume/.css
do
    echo "uglify ${FILE} to ${FILE}.min"
    uglifycss "$FILE" > "${FILE}.min"
    #workaround for bug in uglifycss
    sed -i .bk "s: or(: or (:" "${FILE}.min"
    rm -f "${FILE}.min.bk"
    mv "${FILE}.min" "$FILE"
done
#npm install html-minifier -g
for FILE in ./prod/*.html ./prod/resume/*.html ./prod/art/*.html
do
    echo "Minifying ${FILE} to ${FILE}.min"
    html-minifier --keep-closing-slash --remove-comments --collapse-whitespace --minify-js --minify-css --decode-entities --no-html5 --process-conditional-comments --remove-redundant-attributes --remove-script-type-attributes --remove-style-link-type-attributes --sort-attributes --use-short-doctype --trim-custom-fragments -o "${FILE}.min" "${FILE}"
    mv "${FILE}.min" "${FILE}"
done
#npm install @babel/core @babel/cli -g
#npm install babel-preset-minify -g
for FILE in ./prod/*.js
do
    echo "Minifying ${FILE} to ${FILE}.min"
    babel "${FILE}" --presets minify > "${FILE}.min"
    mv "${FILE}.min" "${FILE}"
done
# https://github.com/google/brotli
# https://github.com/google/zopfli
for FILE in ./prod/*.{html,css,js} ./prod/resume/*.{html,svg,pdf} ./prod/resume/.css ./prod/art/*.html
do
    echo "$FILE"
    ./zopfli "$FILE"
    brotli "$FILE"
done