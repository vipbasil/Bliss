import Phaser from "phaser";

const BG = 0xffffff;
const LINE = 0xcbd5e1;
const NODE_FILL = 0xffffff;
const NODE_STROKE = 0x2563eb;
const NODE_LOCKED_STROKE = 0x94a3b8;
const TEXT = 0x0b1220;

function roundedRectContains(hitArea, x, y) {
  const hw = hitArea.w / 2;
  const hh = hitArea.h / 2;
  const r = hitArea.r;

  if (x < -hw || x > hw || y < -hh || y > hh) return false;

  const innerX = hw - r;
  const innerY = hh - r;

  if (Math.abs(x) <= innerX || Math.abs(y) <= innerY) return true;

  const cx = x > 0 ? innerX : -innerX;
  const cy = y > 0 ? innerY : -innerY;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

export class MapScene extends Phaser.Scene {
  constructor() {
    super({ key: "MapScene" });
    this.edges = [
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
      [5, 6],
    ];
    this.nodes = [
      { id: 1, unlocked: true },
      { id: 2, unlocked: false },
      { id: 3, unlocked: false },
      { id: 4, unlocked: false },
      { id: 5, unlocked: false },
      { id: 6, unlocked: false },
    ];
    this.nodeViews = new Map();
    this.lines = null;
  }

  create() {
    this.cameras.main.setBackgroundColor(BG);

    this.add.text(18, 16, "Puzzles", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      fontSize: "18px",
      color: "#0b1220",
    });

    this.add.text(18, 40, "Choose a node. (Only 1 is active for now.)", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      fontSize: "13px",
      color: "#475569",
    });

    const listLink = this.add
      .text(this.scale.width - 18, 22, "Bliss → Image list", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        fontSize: "14px",
        color: "#1d4ed8",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    listLink.on("pointerdown", () => {
      window.location.href = "./list.html";
    });

    this.lines = this.add.graphics();
    this.createNodes();
    this.layout();

    this.scale.on("resize", () => this.layout(), this);
  }

  createNodes() {
    for (const n of this.nodes) {
      const g = this.add.graphics();
      const label = this.add
        .text(0, 0, String(n.id), {
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
          fontSize: "26px",
          color: "#0b1220",
        })
        .setOrigin(0.5);

      const container = this.add.container(0, 0, [g, label]);
      container.setSize(88, 60);
      container.setInteractive({ w: 88, h: 60, r: 16 }, roundedRectContains);

      container.on("pointerdown", () => this.onNodePress(n));
      container.on("pointerover", () => this.drawNode(container, n, true));
      container.on("pointerout", () => this.drawNode(container, n, false));

      this.drawNode(container, n, false);
      this.nodeViews.set(n.id, { container, n, g, label });
    }
  }

  drawNode(container, node, hover) {
    const g = this.nodeViews.get(node.id)?.g || container.list[0];
    if (!g) return;
    const stroke = node.unlocked ? NODE_STROKE : NODE_LOCKED_STROKE;
    const strokeHover = node.unlocked ? 0x1d4ed8 : NODE_LOCKED_STROKE;
    const fill = hover && node.unlocked ? 0xf1f5ff : NODE_FILL;

    g.clear();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-44, -30, 88, 60, 16);
    g.lineStyle(4, hover ? strokeHover : stroke, 1);
    g.strokeRoundedRect(-44, -30, 88, 60, 16);
  }

  onNodePress(node) {
    if (node.id === 1) {
      this.scene.start("MatchGameScene", { from: "MapScene" });
      return;
    }

    const view = this.nodeViews.get(node.id);
    if (!view) return;
    this.tweens.add({
      targets: view.container,
      x: view.container.x + 8,
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: "Sine.InOut",
    });
  }

  layout() {
    const { width, height } = this.scale;
    const top = 84;
    const centerX = width / 2;
    const usableH = height - top - 24;
    const midY = top + usableH / 2;

    const positions = {
      1: { x: centerX - 260, y: midY + 40 },
      2: { x: centerX - 130, y: midY - 70 },
      3: { x: centerX, y: midY + 10 },
      4: { x: centerX + 140, y: midY - 90 },
      5: { x: centerX + 140, y: midY + 95 },
      6: { x: centerX + 280, y: midY + 15 },
    };

    for (const { container, n } of this.nodeViews.values()) {
      const pos = positions[n.id];
      if (!pos) continue;
      container.setPosition(pos.x, pos.y);
    }

    this.lines.clear();
    this.lines.lineStyle(6, LINE, 1);
    for (const [a, b] of this.edges) {
      const pa = positions[a];
      const pb = positions[b];
      if (!pa || !pb) continue;
      this.lines.beginPath();
      this.lines.moveTo(pa.x, pa.y);
      this.lines.lineTo(pb.x, pb.y);
      this.lines.strokePath();
    }

    // Keep nodes above lines
    this.lines.setDepth(0);
    for (const { container } of this.nodeViews.values()) {
      container.setDepth(10);
    }
  }
}
