/**
 * Generates build/app.icns from src/assets/app-icon.png with all required
 * macOS icon sizes. On macOS uses sips + iconutil; otherwise exits with a message.
 * Run: npm run generate-icon
 */

const { execSync } = require("child_process");
const path = require("path");

const script = path.join(__dirname, "generate-icon.sh");
execSync(`bash "${script}"`, { stdio: "inherit" });
