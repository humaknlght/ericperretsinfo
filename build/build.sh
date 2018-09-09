#!/bin/bash

rm -rf ./prod
mkdir ./prod
cp -r ../src/* ./prod/
shopt -s nullglob
for FILE in ./prod/*.{html,css} ./prod/resume/*.{html,svg,pdf}
do
    echo "$FILE"
    ./zopfli "$FILE"
    brotli "$FILE"
done