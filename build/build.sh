#!/bin/bash
cp -r ../src ./prod 
shopt -s nullglob
for FILE in ./prod/*.{html,css} ./prod/resume/*.{html,svg,pdf}
do
    echo "$FILE"
    ./zopfli "$FILE"
    rm "$FILE.br"
    brotli "$FILE"
done