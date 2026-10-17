#!/usr/bin/env python3
"""Monte les vidéos du mois à partir de clips Pexels (libres de droits).
Pour chaque vidéo : plans recadrés en 1080x1350, fondus, texte en surimpression, carte de fin."""
import json, os, subprocess, sys, urllib.request

EDITS = "media/edits"
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
SRC = "src"
os.makedirs(OUT, exist_ok=True); os.makedirs(SRC, exist_ok=True); os.makedirs("tmp", exist_ok=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"

def run(cmd):
    print("+", " ".join(cmd[:6]), "…", flush=True)
    subprocess.run(cmd, check=True)

def source(vid):
    path = f"{SRC}/{vid}.mp4"
    if not os.path.exists(path):
        req = urllib.request.Request(f"https://www.pexels.com/download/video/{vid}/", headers={"User-Agent": UA})
        with urllib.request.urlopen(req) as r, open(path, "wb") as f:
            f.write(r.read())
    return path

videos = json.load(open(f"{EDITS}/videos.json"))
only = os.environ.get("ONLY", "").split(",") if os.environ.get("ONLY") else None

for key, v in videos.items():
    if only and key not in only:
        continue
    parts = []
    for i, sg in enumerate(v["segments"]):
        d = sg["dur"]; seg = f"tmp/{key}-{i}.mp4"
        vf = (f"[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,fps=30,setsar=1,"
              f"eq=saturation=1.06:contrast=1.03,format=yuv420p[v];"
              f"[1:v]format=rgba,fade=t=in:st=0.5:d=0.7:alpha=1,fade=t=out:st={d-1.0:.2f}:d=0.6:alpha=1[o];"
              f"[v][o]overlay=0:0:format=auto,fade=t=in:st=0:d=0.35,fade=t=out:st={d-0.35:.2f}:d=0.35,format=yuv420p[out]")
        run(["ffmpeg", "-v", "error", "-y", "-ss", str(sg["start"]), "-t", str(d), "-i", source(sg["src"]),
             "-loop", "1", "-t", str(d), "-i", f"{EDITS}/{key}-{i}.png",
             "-filter_complex", vf, "-map", "[out]", "-an",
             "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-r", "30", seg])
        parts.append(seg)
    end = f"tmp/{key}-end.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", "3.2", "-i", f"{EDITS}/{key}-end.png",
         "-vf", "scale=1080:1350,fps=30,setsar=1,fade=t=in:st=0:d=0.6,format=yuv420p", "-an",
         "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-r", "30", end])
    parts.append(end)
    lst = f"tmp/{key}.txt"
    open(lst, "w").write("".join(f"file '{os.path.abspath(p)}'\n" for p in parts))
    final = f"{OUT}/{key}.mp4"
    # piste audio silencieuse : certains lecteurs n'aiment pas les vidéos sans audio
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
         "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
         "-map", "0:v", "-map", "1:a", "-shortest", "-c:v", "copy", "-c:a", "aac", "-b:a", "64k",
         "-movflags", "+faststart", final])
    run(["ffmpeg", "-v", "error", "-y", "-i", final, "-vf", "fps=1/3,scale=270:-2,tile=6x3:padding=4:color=0x222222",
         "-frames:v", "1", f"{OUT}/{key}-apercu.jpg"])
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", final],
                         capture_output=True, text=True).stdout.strip()
    print(f"OK {key} {dur}s {os.path.getsize(final)/1e6:.1f} Mo", flush=True)
