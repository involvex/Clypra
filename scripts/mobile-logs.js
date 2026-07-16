#!/usr/bin/env node
const { spawn, execSync } = require("child_process");

const APP_PKG = "com.clypra.app";

try {
  const pid = execSync(`adb shell pidof ${APP_PKG}`, {
    encoding: "utf8",
  }).trim();
  if (pid) {
    console.log(`\n Filtering logs for PID ${pid} (Ctrl+C to stop)\n`);
    const logcat = spawn("adb", ["logcat", `--pid=${pid}`], {
      stdio: "inherit",
    });
    logcat.on("error", () => console.log("adb logcat failed"));
  } else {
    console.log("\n App not running. Start it first: bun run mobile:dev\n");
  }
} catch {
  console.log("\n adb not found or app not running.");
  console.log(" Start app first: bun run mobile:dev\n");
}
