const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { defineConfig } = require("vite");

function pickPythonForGradio() {
  const candidates = [];
  if (process.env.BLISS_PYTHON) candidates.push(process.env.BLISS_PYTHON);

  candidates.push("python3", "python3.12", "python3.11", "python3.10", "python");

  const absoluteCandidates = [
    "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.10/bin/python3",
    "/usr/local/bin/python3",
  ];
  for (const p of absoluteCandidates) {
    if (fs.existsSync(p)) candidates.push(p);
  }

  const tried = [];
  const seen = new Set();
  for (const cmd of candidates) {
    if (!cmd || seen.has(cmd)) continue;
    seen.add(cmd);
    tried.push(cmd);
    const r = spawnSync(cmd, ["-c", "import gradio_client; import sys; print(sys.executable)"], {
      encoding: "utf8",
    });
    if (r.status === 0) return { cmd, tried };
  }

  return { cmd: process.env.BLISS_PYTHON || "python3", tried };
}

function copyToddlerImages() {
  return {
    name: "copy-toddler-images",
    apply: () => true,
    configureServer(server) {
      const idsPath = path.resolve(__dirname, "Docs/toddler_nouns_yellow_ids.txt");
      const pngSrcDir = path.resolve(__dirname, "bliss_h188_documentation_id_png");
      const svgSrcDir = path.resolve(__dirname, "bliss_svg_id");
      const pngDestDir = path.resolve(__dirname, "public", "bliss_h188_documentation_id_png");
      const svgDestDir = path.resolve(__dirname, "public", "bliss_svg_id");

      if (fs.existsSync(idsPath)) {
        if (fs.existsSync(pngSrcDir)) fs.mkdirSync(pngDestDir, { recursive: true });
        if (fs.existsSync(svgSrcDir)) fs.mkdirSync(svgDestDir, { recursive: true });

        const ids = fs
          .readFileSync(idsPath, "utf8")
          .split(/\s+/)
          .filter(Boolean);

        for (const id of ids) {
          if (fs.existsSync(pngSrcDir)) {
            const src = path.join(pngSrcDir, `${id}.png`);
            const dest = path.join(pngDestDir, `${id}.png`);
            if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
          }
          if (fs.existsSync(svgSrcDir)) {
            const src = path.join(svgSrcDir, `${id}.svg`);
            const dest = path.join(svgDestDir, `${id}.svg`);
            if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
          }
        }
      }

      const python = pickPythonForGradio();

      server.middlewares.use("/api/regenerate", (req, res) => {
        try {
          const url = new URL(req.url || "", "http://localhost");
          const id = url.searchParams.get("id");
          const endpoint = url.searchParams.get("endpoint");

          if (!id || !/^[0-9]+$/.test(id)) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false, error: "missing or invalid id" }));
            return;
          }

          const repoRoot = __dirname;
          const outDir = path.join(repoRoot, "public", "picto");
          fs.mkdirSync(outDir, { recursive: true });

          const args = [
            "scripts/generate_pictos_flux.py",
            "--in-csv",
            "Docs/toddler_nouns_yellow.csv",
            "--out-dir",
            "public/picto",
            "--width",
            "512",
            "--height",
            "512",
            "--steps",
            "15",
            "--guidance",
            "3.5",
            "--ids",
            id,
            "--overwrite",
            "--auto-install-deps",
          ];
          if (endpoint) {
            args.push("--endpoint", endpoint);
          }

          const child = spawn(python.cmd, args, { cwd: repoRoot });

          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (d) => {
            stdout += String(d);
          });
          child.stderr.on("data", (d) => {
            stderr += String(d);
          });

          child.on("error", (err) => {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({
                ok: false,
                error: `Failed to start python (${python.cmd}): ${String(err)}`,
                details: { python: python.cmd, tried: python.tried },
              })
            );
          });

          child.on("close", (code) => {
            if (code !== 0) {
              res.statusCode = 500;
              res.setHeader("content-type", "application/json");
              res.end(
                JSON.stringify({
                  ok: false,
                  error: `Flux regenerate failed (python: ${python.cmd}). ${stderr || `exit ${code}`}`.trim(),
                  details: { code, python: python.cmd, tried: python.tried, stdout, stderr },
                })
              );
              return;
            }

            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({
                ok: true,
                url: `./picto/${id}.png?ts=${Date.now()}`,
              })
            );
          });
        }
        catch (e) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        }
      });
    },
    closeBundle() {
      const idsPath = path.resolve(__dirname, "Docs/toddler_nouns_yellow_ids.txt");
      const pngSrcDir = path.resolve(__dirname, "bliss_h188_documentation_id_png");
      const svgSrcDir = path.resolve(__dirname, "bliss_svg_id");
      const outDir = path.resolve(__dirname, "dist");
      const pngDestDir = path.resolve(outDir, "bliss_h188_documentation_id_png");
      const svgDestDir = path.resolve(outDir, "bliss_svg_id");

      const ids = fs
        .readFileSync(idsPath, "utf8")
        .split(/\s+/)
        .filter(Boolean);

      if (fs.existsSync(pngSrcDir)) fs.mkdirSync(pngDestDir, { recursive: true });
      if (fs.existsSync(svgSrcDir)) fs.mkdirSync(svgDestDir, { recursive: true });

      for (const id of ids) {
        if (fs.existsSync(pngSrcDir)) {
          const src = path.join(pngSrcDir, `${id}.png`);
          const dest = path.join(pngDestDir, `${id}.png`);
          if (fs.existsSync(src)) fs.copyFileSync(src, dest);
        }
        if (fs.existsSync(svgSrcDir)) {
          const src = path.join(svgSrcDir, `${id}.svg`);
          const dest = path.join(svgDestDir, `${id}.svg`);
          if (fs.existsSync(src)) fs.copyFileSync(src, dest);
        }
      }
    },
  };
}

module.exports = defineConfig({
  base: "./",
  plugins: [copyToddlerImages()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        list: path.resolve(__dirname, "list.html")
      }
    }
  }
});
