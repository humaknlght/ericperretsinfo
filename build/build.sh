#!/bin/bash -p

set -ue

rm -rf ./prod
mkdir ./prod
cp -r ../src/* ./prod/
NUM=`stat -f "%Sm" -t "%s" ../src/resume/index.html`"000"
sed -i .bk "s:/\*LAST_MODIFIED\*/:$NUM:" ./prod/resume/index.html
rm -f ./prod/resume/index.html.bk
shopt -s nullglob
#npm install uglifycss -g
for FILE in ./prod/*.css
do
    echo "uglify ${FILE} to ${FILE}.min"
    uglifycss "$FILE" > "${FILE}.min"
    #workaround for bug in uglifycss
    sed -i .bk "s: or(: or (:" "${FILE}.min"
    rm -f "${FILE}.min.bk"
    mv "${FILE}.min" "$FILE"
done
#npm install html-minifier-cli -g
for FILE in ./prod/*.html ./prod/resume/*.html
do
    echo "Minifying ${FILE} to ${FILE}.min"
    htmlmin -o "${FILE}.min" "${FILE}"
    mv "${FILE}.min" "${FILE}"
done
for FILE in ./prod/*.{html,css} ./prod/resume/*.{html,svg,pdf}
do
    echo "$FILE"
    ./zopfli "$FILE"
    brotli "$FILE"
done