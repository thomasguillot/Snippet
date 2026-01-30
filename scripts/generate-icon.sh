#!/usr/bin/env bash
# Generates dist/app.icns from src/assets/app-icon.png with all required
# macOS icon sizes. Uses system sips + iconutil (macOS only).
set -e

if [[ "$(uname)" != "Darwin" ]]; then
	echo "Icon generation is supported only on macOS (uses sips/iconutil)."
	exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PNG="$ROOT/src/assets/app-icon.png"
OUT="$ROOT/dist/app.icns"
ICONSET="$ROOT/dist/app.iconset"

if [[ ! -f "$PNG" ]]; then
	echo "Missing icon source: src/assets/app-icon.png"
	echo "Add a PNG there (1024×1024 recommended), then run: npm run generate-icon"
	exit 1
fi

mkdir -p "$ROOT/dist"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

sips -z 16 16 "$PNG" --out "$ICONSET/icon_16x16.png"
sips -z 32 32 "$PNG" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32 32 "$PNG" --out "$ICONSET/icon_32x32.png"
sips -z 64 64 "$PNG" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128 "$PNG" --out "$ICONSET/icon_128x128.png"
sips -z 256 256 "$PNG" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256 "$PNG" --out "$ICONSET/icon_256x256.png"
sips -z 512 512 "$PNG" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512 "$PNG" --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 "$PNG" --out "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$OUT"
rm -rf "$ICONSET"
echo "Generated dist/app.icns"
