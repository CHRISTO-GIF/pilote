#!/usr/bin/env bash
# Télécharge les photos et vidéos candidates (libres de droits : Pexels, Unsplash)
# et produit des planches d'aperçu pour le choix éditorial.
set -uo pipefail
OUT=${1:-out}
mkdir -p "$OUT/photos" "$OUT/videos" "$OUT/sheets"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
LOG="$OUT/log.txt"; : > "$LOG"

for id in $(jq -r '.pexels_photos[]' media/candidates.json); do
  f="$OUT/photos/pexels-$id.jpg"
  if curl -sSfL -A "$UA" -o "$f" "https://images.pexels.com/photos/$id/pexels-photo-$id.jpeg?auto=compress&cs=tinysrgb&w=2000"; then
    echo "OK photo pexels-$id $(stat -c%s "$f")" >> "$LOG"
  else echo "ÉCHEC photo pexels-$id" >> "$LOG"; rm -f "$f"; fi
done

for id in $(jq -r '.unsplash_photos[]' media/candidates.json); do
  f="$OUT/photos/unsplash-$id.jpg"
  if curl -sSfL -A "$UA" -o "$f" "https://unsplash.com/photos/$id/download?force=true&w=2000"; then
    echo "OK photo unsplash-$id $(stat -c%s "$f")" >> "$LOG"
  else echo "ÉCHEC photo unsplash-$id" >> "$LOG"; rm -f "$f"; fi
done

for id in $(jq -r '.pexels_videos[]' media/candidates.json); do
  f="$OUT/videos/pexels-$id.mp4"
  if curl -sSfL -A "$UA" -o "$f" "https://www.pexels.com/download/video/$id/"; then
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" 2>/dev/null || echo "?")
    res=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$f" 2>/dev/null || echo "?")
    echo "OK video pexels-$id dur=$dur res=$res size=$(stat -c%s "$f")" >> "$LOG"
    # planche : une image toutes les 2 s, 4 colonnes
    ffmpeg -v error -y -i "$f" -vf "fps=1/2,scale=360:-2,tile=4x4:padding=4:color=0x333333" -frames:v 1 "$OUT/sheets/video-$id.jpg" || true
  else echo "ÉCHEC video pexels-$id" >> "$LOG"; rm -f "$f"; fi
done
cat "$LOG"
