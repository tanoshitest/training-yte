import { copyFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const project = process.cwd();
const cssDirectory = path.join(project, ".open-next", "assets", "_next", "static", "css");
const cssFiles = (await readdir(cssDirectory)).filter((name) => name.endsWith(".css"));

if (cssFiles.length === 0) {
  throw new Error("Không tìm thấy CSS đã build của giao diện NZedu trong .open-next.");
}

await copyFile(
  path.join(cssDirectory, cssFiles[0]),
  path.join(project, "cloudflare", "public", "nz.css"),
);

const executable = path.join(project, "node_modules", "esbuild", "bin", "esbuild");
const args = [
  "cloudflare/client/syllabus-app.tsx",
  "--bundle",
  "--outfile=cloudflare/public/syllabus.js",
  "--format=iife",
  "--platform=browser",
  "--jsx=automatic",
  "--minify",
  "--tsconfig=tsconfig.json",
];

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [executable, ...args], { cwd: project, stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`esbuild kết thúc với mã ${code}.`)));
});
