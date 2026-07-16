#!/usr/bin/env node
const { spawn, execSync } = require("child_process");

const isLiveReload = process.argv.includes("--live");
const APP_PKG = "com.clypra.app";

console.log(
  `\n Clypra Mobile Dev (${isLiveReload ? "live reload" : "hot reload"})\n`,
);

// 1. Start Vite dev server
const vite = spawn("npx", ["vite", "--host"], {
  stdio: "inherit",
  shell: true,
});

// 2. After a delay, sync and deploy
setTimeout(() => {
  try {
    console.log("\n Syncing to Android...");
    const env = { ...process.env };
    if (isLiveReload) {
      env.CAPACITOR_LIVE_RELOAD = "true";
    }
    execSync("npx cap sync android", { stdio: "inherit", env });
  } catch (e) {
    console.error("cap sync failed:", e.message);
    process.exit(1);
  }

  console.log("\n Deploying to device...");
  const run = spawn("npx", ["cap", "run", "android"], {
    stdio: "inherit",
    shell: true,
  });
  run.on("close", (code) => {
    if (code !== 0) {
      console.error("Deploy failed. Is a device/emulator connected?");
    } else {
      console.log("\n App deployed! Watching logs...\n");
      startLogcat();
    }
  });
}, 3000);

function startLogcat() {
  try {
    const pid = execSync(`adb shell pidof ${APP_PKG}`, {
      encoding: "utf8",
    }).trim();
    if (pid) {
      console.log(` Filtering logs for PID ${pid} (Ctrl+C to stop)\n`);
      const logcat = spawn("adb", ["logcat", `--pid=${pid}`], {
        stdio: "inherit",
      });
      logcat.on("error", () => console.log("adb logcat failed"));
    } else {
      console.log(" App not running - logs unavailable");
    }
  } catch {
    console.log(" adb not found or app not running");
  }
}

// Cleanup on exit
process.on("SIGINT", () => {
  vite.kill();
  process.exit();
});
process.on("SIGTERM", () => {
  vite.kill();
  process.exit();
});
