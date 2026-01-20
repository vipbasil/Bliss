import Phaser from "phaser";
import { toddlerData } from "./toddlerData.js";
import { excludedNotCharacterIds } from "./excludedNotCharacterIds.js";

const CANVAS_BG = 0xffffff;
const CARD_BG = 0xffffff;
const CARD_BG_HI = 0xf6f8ff;
const CARD_STROKE = 0xd2d8ea;
const CARD_STROKE_HI = 0x2563eb;
const CARD_STROKE_OK = 0x16a34a;
const CARD_STROKE_BAD = 0xdc2626;
const TEXT = 0x0b1220;
const TEXT_MUTED = 0x475569;

const PROGRESS_KEY = "bliss.progress.v1";
const MAX_STAGE = 4;
const PROMOTE_STREAK = 5;
const WINDOW_ATTEMPTS = 8;
const MAX_ERRORS_IN_WINDOW = 1;
const LEARNED_DISTRACTOR_P = 0.18;
const REVIEW_TARGET_P = 0.2;

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

function safeParseJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function nowMs() {
  return Date.now();
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.version !== 1) return null;
  if (!raw.symbols || typeof raw.symbols !== "object") return null;
  return raw;
}

function initProgress(symbolIds) {
  const symbols = {};
  for (const id of symbolIds) {
    symbols[String(id)] = {
      status: "NOT_INTRODUCED",
      success_streak: 0,
      total_attempts: 0,
      last_seen_timestamp: 0,
      recent: [],
      stage4_success: false,
    };
  }

  const first = symbolIds[0];
  if (first != null) symbols[String(first)].status = "LEARNING";

  return {
    version: 1,
    currentLearningId: first ?? null,
    stage: 1,
    symbols,
  };
}

function loadProgress(symbolIds) {
  let state = null;
  try {
    state = normalizeState(safeParseJSON(localStorage.getItem(PROGRESS_KEY) || ""));
  } catch {
    state = null;
  }

  if (!state) state = initProgress(symbolIds);

  // Ensure newly-added IDs exist.
  for (const id of symbolIds) {
    const k = String(id);
    if (!state.symbols[k]) {
      state.symbols[k] = {
        status: "NOT_INTRODUCED",
        success_streak: 0,
        total_attempts: 0,
        last_seen_timestamp: 0,
        recent: [],
        stage4_success: false,
      };
    }
  }

  // Enforce "single learning symbol" invariant.
  const learningIds = [];
  for (const id of symbolIds) {
    if (state.symbols[String(id)]?.status === "LEARNING") learningIds.push(id);
  }
  const desired = symbolIds.includes(state.currentLearningId) ? state.currentLearningId : null;
  const keeper = desired ?? learningIds[0] ?? symbolIds[0] ?? null;

  for (const id of learningIds) {
    if (id !== keeper) state.symbols[String(id)].status = "LEARNED";
  }
  if (keeper != null) {
    state.currentLearningId = keeper;
    state.symbols[String(keeper)].status = "LEARNING";
  }

  state.stage = Math.max(1, Math.min(MAX_STAGE, Number(state.stage) || 1));
  return state;
}

function saveProgress(state) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state));
  } catch {
    // ignore (private mode / disabled storage)
  }
}

function countErrorsInWindow(recent, windowSize) {
  if (!Array.isArray(recent)) return 0;
  const tail = recent.slice(-windowSize);
  return tail.reduce((acc, ok) => acc + (ok ? 0 : 1), 0);
}

function pickLearnedDistractors(learnedIds, needed, rng, p) {
  if (needed <= 0) return [];
  const shuffled = shuffleInPlace([...learnedIds], rng);
  const picked = [];
  const seen = new Set();

  for (const id of shuffled) {
    if (picked.length >= needed) break;
    if (rng() < p && !seen.has(id)) {
      picked.push(id);
      seen.add(id);
    }
  }

  // Always fill remaining slots (early game has few learned symbols).
  for (const id of shuffled) {
    if (picked.length >= needed) break;
    if (!seen.has(id)) {
      picked.push(id);
      seen.add(id);
    }
  }

  return picked.slice(0, needed);
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
    this.progress = null;
    this.stageUsed = 1;
    this.isReviewRound = false;
  }

  init() {
    const symbols = toddlerData?.symbols || [];
    this.symbols = symbols.filter((s) => !excludedNotCharacterIds.has(s.id));
    this.byId = new Map(this.symbols.map((s) => [s.id, s]));
    this.progress = loadProgress(this.symbols.map((s) => s.id));
  }

  create() {
    this.cameras.main.setBackgroundColor(CANVAS_BG);

    const home = this.add
      .text(18, 16, "← Puzzles", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        fontSize: "14px",
        color: "#1d4ed8",
      })
      .setDepth(1200)
      .setInteractive({ useHandCursor: true });
    home.on("pointerdown", () => this.scene.start("MapScene"));

    this.title = this.add
      .text(18, 40, "Match", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        fontSize: "18px",
        color: "#0b1220",
      })
      .setDepth(1000);

    this.hint = this.add
      .text(18, 64, "Drag the correct Bliss symbol onto the left card.", {
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

    const state = this.progress;
    if (!state || state.currentLearningId == null) return;

    const learningId = state.currentLearningId;
    const learningKey = String(learningId);
    if (!state.symbols[learningKey]) return;

    const learnedIds = this.symbols
      .map((s) => s.id)
      .filter((id) => state.symbols[String(id)]?.status === "LEARNED");

    // 20% of rounds: review a LEARNED symbol as the target (if any exist).
    let targetId = learningId;
    this.isReviewRound = false;
    if (learnedIds.length > 0 && this.rng() < REVIEW_TARGET_P) {
      targetId = learnedIds[Math.floor(this.rng() * learnedIds.length)];
      this.isReviewRound = targetId !== learningId;
    }

    this.correctId = targetId;

    const targetStage = Math.max(1, Math.min(MAX_STAGE, state.stage || 1));
    // Review rounds should still include the learning symbol as a distractor to keep it in circulation.
    const minChoices = this.isReviewRound ? 2 : 1;
    const targetChoices = Math.min(
      Math.max(minChoices, targetStage),
      this.isReviewRound ? 2 + learnedIds.length : 1 + learnedIds.length
    );
    this.stageUsed = targetChoices;

    const base = new Set([targetId]);
    if (this.isReviewRound) base.add(learningId);

    const distractorPool = learnedIds.filter((id) => !base.has(id));
    const learnedDistractors = pickLearnedDistractors(
      distractorPool,
      Math.max(0, targetChoices - base.size),
      this.rng,
      LEARNED_DISTRACTOR_P
    );

    this.optionIds = shuffleInPlace([...base, ...learnedDistractors], this.rng);

    this.loadAssets({ blissIds: this.optionIds, pictoId: this.correctId }).then(() => {
      this.createLeftPrompt();
      this.createRightOptions();
      this.updateProgress();
      this.updateHint();
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
    if (!this.progress) return;
    const total = MAX_STAGE;
    const filledCount = Math.max(1, Math.min(total, this.progress.stage || 1));
    const dotSpacing = 14;
    const startX = -((total - 1) * dotSpacing) / 2;
    for (let i = 0; i < total; i += 1) {
      const filled = i < filledCount;
      const color = filled ? 0x25c26e : 0x2a3a5d;
      const dot = this.add.circle(startX + i * dotSpacing, 0, 5, color, 1);
      this.progressDots.add(dot);
    }
  }

  updateHint() {
    const stage = this.progress?.stage || 1;
    const stageLabel = Math.max(1, Math.min(MAX_STAGE, stage));
    this.hint.setText(
      this.isReviewRound
        ? `Review: match a learned symbol. Stage ${stageLabel}/${MAX_STAGE}.`
        : `Drag the matching Bliss symbol. Stage ${stageLabel}/${MAX_STAGE}.`
    );
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
      this.recordAttempt(false, this.correctId);
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
    const promoted = this.recordAttempt(true, this.correctId);
    this.updateProgress();
    this.updateHint();

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
            if (promoted) this.showCelebration("Learned!");
            this.buildQuestion();
          },
        });
      },
    });
  }

  showCelebration(text) {
    const { width, height } = this.scale;
    const msg = this.add
      .text(width / 2, height / 2, text, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        fontSize: "42px",
        color: "#0b1220",
        backgroundColor: "rgba(255,255,255,0.85)",
        padding: { x: 18, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(2000);
    this.tweens.add({
      targets: msg,
      alpha: 0,
      duration: 650,
      delay: 450,
      onComplete: () => msg.destroy(),
    });
  }

  recordAttempt(ok, targetId) {
    const state = this.progress;
    if (!state || state.currentLearningId == null) return false;

    const learningId = state.currentLearningId;
    const targetKey = String(targetId);
    const symState = state.symbols[targetKey];
    if (!symState) return false;

    symState.total_attempts = (symState.total_attempts || 0) + 1;
    symState.last_seen_timestamp = nowMs();
    if (!Array.isArray(symState.recent)) symState.recent = [];
    symState.recent.push(Boolean(ok));
    if (symState.recent.length > WINDOW_ATTEMPTS) symState.recent = symState.recent.slice(-WINDOW_ATTEMPTS);

    // Only the current LEARNING symbol drives stage/progression/promotion.
    const isLearningTarget = targetId === learningId;

    if (ok) {
      if (isLearningTarget) {
        symState.success_streak = (symState.success_streak || 0) + 1;
        if (this.stageUsed >= 4) symState.stage4_success = true;
        state.stage = Math.min(MAX_STAGE, (state.stage || 1) + 1);
      }
    } else {
      // Non-punitive: don't drop stage; don't wipe streak completely.
      if (isLearningTarget) {
        symState.success_streak = Math.max(0, (symState.success_streak || 0) - 1);
      }
    }

    if (!isLearningTarget) {
      saveProgress(state);
      return false;
    }

    const learnedCount = this.symbols.filter(
      (s) => state.symbols[String(s.id)]?.status === "LEARNED"
    ).length;
    const canReachStage4 = learnedCount >= 3;

    const errorsInWindow = countErrorsInWindow(symState.recent, WINDOW_ATTEMPTS);
    const eligible =
      symState.success_streak >= PROMOTE_STREAK &&
      errorsInWindow <= MAX_ERRORS_IN_WINDOW &&
      (!canReachStage4 || symState.stage4_success);

    if (!eligible) {
      saveProgress(state);
      return false;
    }

    // Promote learning -> learned, pick next not introduced.
    symState.status = "LEARNED";
    symState.success_streak = 0;
    symState.stage4_success = false;

    const next = this.symbols
      .map((s) => s.id)
      .find((id) => state.symbols[String(id)]?.status === "NOT_INTRODUCED");

    if (next == null) {
      state.currentLearningId = null;
      state.stage = 1;
      saveProgress(state);
      return true;
    }

    state.currentLearningId = next;
    state.stage = 1;
    state.symbols[String(next)].status = "LEARNING";
    saveProgress(state);
    return true;
  }
}
