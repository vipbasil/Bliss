const fs = require("node:fs");
const path = require("node:path");
const { defineConfig } = require("vite");

function copyToddlerImages() {
  return {
    name: "copy-toddler-images",
    apply: () => true,
    configureServer() {
      const idsPath = path.resolve(__dirname, "Docs/toddler_nouns_yellow_ids.txt");
      const pngSrcDir = path.resolve(__dirname, "bliss_h188_documentation_id_png");
      const svgSrcDir = path.resolve(__dirname, "bliss_svg_id");
      const pngDestDir = path.resolve(__dirname, "public", "bliss_h188_documentation_id_png");
      const svgDestDir = path.resolve(__dirname, "public", "bliss_svg_id");

      if (!fs.existsSync(idsPath)) return;
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
});
