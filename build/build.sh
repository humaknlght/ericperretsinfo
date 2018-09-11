#!/bin/bash

rm -rf ./prod
mkdir ./prod
cp -r ../src/* ./prod/
NUM=`stat -f "%Sm" -t "%s" ../src/resume/index.html`"000"
sed -i .bk "s:/\*LAST_MODIFIED\*/:$NUM:" ./prod/resume/index.html
rm -f ./prod/resume/index.html.bk
shopt -s nullglob
for FILE in ./prod/*.{html,css} ./prod/resume/*.{html,svg,pdf}
do
    echo "$FILE"
    ./zopfli "$FILE"
    brotli "$FILE"
done