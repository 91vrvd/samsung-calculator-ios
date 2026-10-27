#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"
node build.mjs

if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  echo '请先安装 Xcode，并用 xcode-select 选择 Xcode 开发目录。' >&2
  exit 1
fi

DERIVED_DIR="$PROJECT_DIR/build/DerivedData"
OUTPUT_DIR="$PROJECT_DIR/release"
mkdir -p "$OUTPUT_DIR"
xcodebuild -project "$PROJECT_DIR/iOS/XiaoMingCalc.xcodeproj" \
  -scheme XiaoMingCalc \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED_DIR" \
  CODE_SIGNING_ALLOWED=NO build

APP_PATH="$DERIVED_DIR/Build/Products/Release-iphoneos/XiaoMingCalc.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo '构建完成，但找不到 XiaoMingCalc.app。' >&2
  exit 1
fi

PACKAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$PACKAGE_DIR"' EXIT
mkdir -p "$PACKAGE_DIR/Payload"
cp -R "$APP_PATH" "$PACKAGE_DIR/Payload/"
ditto -c -k --sequesterRsrc "$PACKAGE_DIR" "$OUTPUT_DIR/三星计算器-unsigned.ipa"
echo "已生成 $OUTPUT_DIR/三星计算器-unsigned.ipa（需由 SideStore 等工具重新签名后安装）"
