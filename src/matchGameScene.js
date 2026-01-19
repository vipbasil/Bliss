import Phaser from "phaser";
import { toddlerData } from "./toddlerData.js";

const CANVAS_BG = 0xffffff;
const CARD_BG = 0xffffff;
const CARD_BG_HI = 0xf6f8ff;
const CARD_STROKE = 0xd2d8ea;
const CARD_STROKE_HI = 0x2563eb;
const CARD_STROKE_OK = 0x16a34a;
const CARD_STROKE_BAD = 0xdc2626;
const TEXT = 0x0b1220;
const TEXT_MUTED = 0x475569;

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function fitImageWithin(image, maxW, maxH) {
  const tex = image.texture;
  const src = tex && tex.source && tex.source[0] && tex.source[0].source;
  const w = src?.width || image.width || 1;
  const h = src?.height || image.height || 1;
  const scale = Math.min(maxW / w, maxH / h);
  image.setScale(scale);
  return image;
}

function roundedRectContains(hitArea, x, y) {
  const hw = hitArea.w / 2;
  const hh = hitArea.h / 2;
  const r = hitArea.r;

  if (x < -hw || x > hw || y < -hh || y > hh) return false;

  const innerX = hw - r;
  const innerY = hh - r;

  // inside the vertical or horizontal "cross" (not in rounded corners)
  if (Math.abs(x) <= innerX || Math.abs(y) <= innerY) return true;

  // check the corner circle
  const cx = x > 0 ? innerX : -innerX;
  const cy = y > 0 ? innerY : -innerY;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

export class MatchGameScene extends Phaser.Scene {
  constructor() {
    super({ key: "MatchGameScene" });
    this.symbols = [];
    this.byId = new Map();
    this.correctId = null;
    this.optionIds = [];
    this.leftPrompt = null;
    this.leftHitArea = null;
    this.draggables = [];
    this.rng = mulberry32(Date.now());
    this.progressInSet = 0;
  }

  init() {
    const symbols = toddlerData?.symbols || [];
    this.symbols = symbols;
    this.byId = new Map(symbols.map((s) => [s.id, s]));
  }

  create() {
    this.cameras.main.setBackgroundColor(CANVAS_BG);

    this.title = this.add
      .text(16, 14, "Match", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        fontSize: "18px",
        color: "#0b1220",
      })
      .setDepth(1000);

    this.hint = this.add
      .text(16, 38, "Drag the correct Bliss symbol onto the left card.", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        fontSize: "13px",
        color: "#475569",
      })
      .setDepth(1000);

    this.progressDots = this.add.container(0, 0).setDepth(1000);

    this.input.setTopOnly(true);
    this.buildQuestion();
    this.scale.on("resize", () => this.layout(), this);
    this.layout();
  }

  buildQuestion() {
    this.clearQuestion();

    const ids = this.symbols.map((s) => s.id);
    shuffleInPlace(ids, this.rng);
    this.correctId = ids[0] ?? null;

    const optionCount = 6;
    const optionSet = new Set([this.correctId]);
    for (let i = 1; i < ids.length && optionSet.size < optionCount; i += 1) {
      optionSet.add(ids[i]);
    }
    this.optionIds = shuffleInPlace([...optionSet], this.rng);

    this.loadAssets({ blissIds: this.optionIds, pictoId: this.correctId }).then(() => {
      this.createLeftPrompt();
      this.createRightOptions();
      this.updateProgress();
      this.layout();
    });
  }

  clearQuestion() {
    if (this.leftPrompt) this.leftPrompt.destroy();
    this.leftPrompt = null;
    this.leftHitArea = null;
    for (const d of this.draggables) d.destroy();
    this.draggables = [];
  }

  loadAssets({ blissIds, pictoId }) {
    return new Promise((resolve) => {
      const baseUrl = this.game.config?.baseUrl || "";
      const blissBase = `${baseUrl}bliss_svg_id/`;
      const pictoBase = `${baseUrl}picto/`;

      let toLoad = 0;
      for (const id of blissIds) {
        const key = `bliss-${id}`;
        if (this.textures.exists(key)) continue;
        toLoad += 1;
        // Do not force width/height here. Many source SVGs have `preserveAspectRatio="none"`,
        // so resizing to a square would distort them. Let the browser rasterize at the SVGs
        // intrinsic size (inches -> px) and scale at render time.
        this.load.svg(key, `${blissBase}${id}.svg`);
      }

      if (pictoId && Number.isFinite(pictoId)) {
        const pid = Number(pictoId);
        const key = `picto-${pid}`;
        if (!this.textures.exists(key)) {
          toLoad += 1;
          this.load.image(key, `${pictoBase}${pid}.png`);
        }
      }

      if (toLoad === 0) {
        resolve();
        return;
      }

      // `loaderror` can fire for individual files; we still want to wait for the loader to finish,
      // otherwise we'd build the UI before any textures are available (showing fallback IDs).
      this.load.once("complete", () => resolve());
      this.load.start();
    });
  }

  createLeftPrompt() {
    const sym = this.correctId ? this.byId.get(this.correctId) : null;
    const label = sym?.primary || "";
    const pictoKey = this.correctId ? `picto-${this.correctId}` : null;

    const cardBg = this.makeCard({
      width: 360,
      height: 260,
      stroke: CARD_STROKE_HI,
      fill: CARD_BG_HI,
    });

    let content;
    if (pictoKey && this.textures.exists(pictoKey)) {
      content = fitImageWithin(this.add.image(0, 0, pictoKey).setOrigin(0.5), 280, 200);
    }
    else {
      content = this.add
        .text(0, 0, label ? label.toUpperCase() : "?", {
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
          fontSize: "34px",
          color: "#0b1220",
          align: "center",
          wordWrap: { width: 320 },
        })
        .setOrigin(0.5);
    }

    const container = this.add.container(0, 0, [cardBg, content]);
    container.setSize(360, 260);
    container.setDataEnabled();
    container.setData("id", this.correctId);
    container.setData("flash", null);

    this.leftPrompt = container;
    this.leftHitArea = null;
  }

  createRightOptions() {
    this.draggables = this.optionIds.map((id) => {
      const key = `bliss-${id}`;
      const cardBg = this.makeCard({ width: 170, height: 120, stroke: CARD_STROKE });
      const img = this.textures.exists(key)
        ? fitImageWithin(this.add.image(0, -4, key).setOrigin(0.5), 92, 92)
        : this.add
            .text(0, 0, String(id), {
              fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
              fontSize: "18px",
              color: "#0b1220",
            })
            .setOrigin(0.5);

      const container = this.add.container(0, 0, [cardBg, img]);
      container.setSize(170, 120);
      container.setInteractive({ w: 170, h: 120, r: 16 }, roundedRectContains);
      this.input.setDraggable(container);

      container.setDataEnabled();
      container.setData("id", id);
      container.setData("homeX", 0);
      container.setData("homeY", 0);

      container.on("dragstart", () => {
        container.setScale(1.03);
        this.children.bringToTop(container);
      });

      container.on("drag", (_pointer, dragX, dragY) => {
        container.x = dragX;
        container.y = dragY;
        this.updateHoverLeftForCard(container);
      });

      container.on("dragend", () => {
        container.setScale(1);
        this.handleDropOnLeft(container);
      });

      return container;
    });
  }

  makeCard({ width, height, fill = CARD_BG, stroke = CARD_STROKE }) {
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 16);
    g.lineStyle(4, stroke, 1);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 16);
    return g;
  }

  setLeftBorder(strokeColor) {
    if (!this.leftPrompt) return;
    const g = this.leftPrompt.list[0];
    if (!g) return;
    g.clear();
    g.fillStyle(CARD_BG_HI, 1);
    g.fillRoundedRect(-180, -130, 360, 260, 18);
    g.lineStyle(6, strokeColor, 1);
    g.strokeRoundedRect(-180, -130, 360, 260, 18);
  }

  layout() {
    const { width, height } = this.scale;
    const margin = 18;

    this.title.setPosition(margin, margin - 2);
    this.hint.setPosition(margin, margin + 22);

    const topUi = margin + 56;
    const usableH = height - topUi - margin;

    const leftX = Math.max(240, width * 0.30);
    const rightX = Math.min(width - 220, width * 0.75);

    if (this.leftPrompt) {
      this.leftPrompt.setPosition(leftX, topUi + usableH / 2);
    }

    const cols = 2;
    const rows = Math.ceil(this.draggables.length / cols);
    const cardW = 170;
    const cardH = 120;
    const gapX = 18;
    const gapY = 16;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const totalH = rows * cardH + (rows - 1) * gapY;
    const startX = rightX - totalW / 2 + cardW / 2;
    const startY = topUi + usableH / 2 - totalH / 2 + cardH / 2;

    for (let i = 0; i < this.draggables.length; i += 1) {
      const d = this.draggables[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      d.setPosition(x, y);
      d.setData("homeX", x);
      d.setData("homeY", y);
    }

    this.progressDots.setPosition(width / 2, margin + 22);
    this.updateProgress();
  }

  updateProgress() {
    this.progressDots.removeAll(true);
    if (!this.correctId) return;
    const total = 5;
    const filledCount = Math.min(total, this.progressInSet);
    this.progressDots.removeAll(true);
    const dotSpacing = 14;
    const startX = -((total - 1) * dotSpacing) / 2;
    for (let i = 0; i < total; i += 1) {
      const filled = i < filledCount;
      const color = filled ? 0x25c26e : 0x2a3a5d;
      const dot = this.add.circle(startX + i * dotSpacing, 0, 5, color, 1);
      this.progressDots.add(dot);
    }
  }

  updateHoverLeftForCard(card) {
    if (!this.leftPrompt || !card) return;
    const targetRect = this.leftPrompt.getBounds();
    const cardRect = card.getBounds();
    const intersects = Phaser.Geom.Intersects.RectangleToRectangle(cardRect, targetRect);
    this.setLeftBorder(intersects ? CARD_STROKE_OK : CARD_STROKE_HI);
  }

  flashLeft(strokeColor) {
    if (!this.leftPrompt) return;
    this.setLeftBorder(strokeColor);
    this.time.delayedCall(220, () => this.setLeftBorder(CARD_STROKE_HI));
  }

  handleDropOnLeft(card) {
    if (!this.leftPrompt || !this.correctId) return;

    const targetRect = this.leftPrompt.getBounds();
    const cardRect = card.getBounds();
    const inside = Phaser.Geom.Intersects.RectangleToRectangle(cardRect, targetRect);

    if (!inside) {
      this.tweens.add({
        targets: card,
        x: card.getData("homeX"),
        y: card.getData("homeY"),
        duration: 240,
        ease: "Back.Out",
      });
      this.setLeftBorder(CARD_STROKE_HI);
      return;
    }

    const correct = card.getData("id") === this.correctId;
    if (!correct) {
      this.flashLeft(CARD_STROKE_BAD);
      this.tweens.add({
        targets: card,
        x: card.getData("homeX"),
        y: card.getData("homeY"),
        duration: 240,
        ease: "Back.Out",
      });
      return;
    }

    this.flashLeft(CARD_STROKE_OK);
    this.progressInSet += 1;
    this.updateProgress();

    this.tweens.add({
      targets: card,
      x: this.leftPrompt.x,
      y: this.leftPrompt.y,
      duration: 160,
      ease: "Sine.Out",
      onComplete: () => {
        this.tweens.add({
          targets: card,
          alpha: 0,
          duration: 120,
          onComplete: () => {
            if (this.progressInSet >= 5) {
              this.progressInSet = 0;
              const { width, height } = this.scale;
              const msg = this.add
                .text(width / 2, height / 2, "Great!", {
                  fontFamily:
                    "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
                  fontSize: "44px",
                  color: "#e8eefc",
                })
                .setOrigin(0.5)
                .setDepth(2000);
              this.tweens.add({
                targets: msg,
                alpha: 0,
                duration: 650,
                delay: 500,
                onComplete: () => {
                  msg.destroy();
                  this.buildQuestion();
                },
              });
              return;
            }

            this.buildQuestion();
          },
        });
      },
    });
  }
}
