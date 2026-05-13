import fs from "fs";
import path from "path";

const root = path.resolve(process.cwd());
const today = new Date().toISOString().slice(0, 10);
const backupRoot = path.join(root, "backups", `projects-snapshot-${today}`);
const workspaces = fs.readdirSync(root).filter((name) => name.startsWith("workspace-"));

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile() && (entry.name === "project.json" || entry.name === "tasks.json")) {
      fs.copyFileSync(from, to);
    }
  }
}

let copiedBrands = 0;
for (const workspace of workspaces) {
  const brandsDir = path.join(root, workspace, "brand");
  if (!fs.existsSync(brandsDir)) continue;
  for (const slug of fs.readdirSync(brandsDir)) {
    const projectsDir = path.join(brandsDir, slug, "projects");
    if (!fs.existsSync(projectsDir)) continue;
    copyDir(projectsDir, path.join(backupRoot, workspace, "brand", slug, "projects"));
    copiedBrands++;
  }
}

console.log(JSON.stringify({ ok: true, backupRoot, copiedBrands }, null, 2));
