import React, { useRef, useEffect, useState, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAP_W = 3000;
const MAP_H = 3000;
const PLAYER_RADIUS = 15;
const BULLET_RADIUS = 5;
const PICKUP_RADIUS = 20;
const ENEMY_RADIUS = 15;
const ZONE_INITIAL_RADIUS = 1300;
const ZONE_MIN_RADIUS = 100;
const ZONE_SHRINK_INTERVAL = 30000; // ms
const ZONE_SHRINK_AMOUNT = 200;
const ZONE_DAMAGE_PER_SEC = 2;
const ENEMY_SPAWN_INTERVAL = 20000;
const MAX_ENEMIES = 15;
const INITIAL_ENEMIES = 10;

const COLORS = {
  bg: "#0B0F12",
  grass: "#1a2410",
  grassDark: "#141c0d",
  dirt: "#2a1f12",
  wall: "#3a3530",
  wallDark: "#2a2520",
  tree: "#1a3010",
  treeDark: "#0f2008",
  player: "#FF5A1F",
  playerGlow: "rgba(255,90,31,0.4)",
  enemy: "#e03030",
  enemyGlow: "rgba(224,48,48,0.3)",
  bullet: "#FF8C42",
  enemyBullet: "#ff4444",
  zone: "rgba(50,100,255,0.6)",
  zoneFill: "rgba(30,80,220,0.12)",
  hud: "rgba(11,15,18,0.82)",
  hudBorder: "rgba(255,90,31,0.3)",
  text: "#E8ECEF",
  textDim: "rgba(232,236,239,0.6)",
  orange: "#FF5A1F",
  red: "#e03030",
  green: "#4caf50",
  blue: "#4488ff",
  yellow: "#FFD600",
  cyan: "#00e5ff",
};

type WeaponType = "pistol" | "rifle" | "shotgun";

interface WeaponDef {
  name: string;
  damage: number;
  range: number;
  fireRate: number;
  bulletSpeed: number;
  spread: number;
  magSize: number;
  reserveSize: number;
  pellets: number;
  color: string;
}

const WEAPONS: Record<WeaponType, WeaponDef> = {
  pistol: {
    name: "PISTOL",
    damage: 25,
    range: 400,
    fireRate: 3,
    bulletSpeed: 500,
    spread: 0.05,
    magSize: 30,
    reserveSize: 90,
    pellets: 1,
    color: COLORS.bullet,
  },
  rifle: {
    name: "RIFLE",
    damage: 35,
    range: 700,
    fireRate: 8,
    bulletSpeed: 800,
    spread: 0.02,
    magSize: 30,
    reserveSize: 120,
    pellets: 1,
    color: COLORS.bullet,
  },
  shotgun: {
    name: "SHOTGUN",
    damage: 15,
    range: 250,
    fireRate: 1.2,
    bulletSpeed: 400,
    spread: 0.3,
    magSize: 8,
    reserveSize: 32,
    pellets: 5,
    color: COLORS.bullet,
  },
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Circle {
  x: number;
  y: number;
  r: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  angle: number;
  weapon: WeaponType;
  ammo: Record<WeaponType, { mag: number; reserve: number }>;
  fireCooldown: number;
  kills: number;
  alive: boolean;
}

type EnemyState = "roam" | "chase" | "attack";

interface Enemy {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  angle: number;
  state: EnemyState;
  roamTimer: number;
  roamAngle: number;
  fireCooldown: number;
  alive: boolean;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  range: number;
  traveledDist: number;
  fromPlayer: boolean;
  pellets: number;
}

type PickupKind = "pistol" | "rifle" | "shotgun" | "medkit" | "ammo";

interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: PickupKind;
  collected: boolean;
}

interface FloatText {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
}

interface GameState {
  player: Player;
  enemies: Enemy[];
  bullets: Bullet[];
  pickups: Pickup[];
  obstacles: Rect[];
  trees: Circle[];
  floatTexts: FloatText[];
  zoneRadius: number;
  zoneX: number;
  zoneY: number;
  zoneShrinkTimer: number;
  zoneWarning: number;
  enemySpawnTimer: number;
  nextId: number;
  startTime: number;
  cameraX: number;
  cameraY: number;
  keys: Record<string, boolean>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  touch: {
    joystickActive: boolean;
    joystickBaseX: number;
    joystickBaseY: number;
    joystickCurrX: number;
    joystickCurrY: number;
    joystickId: number;
    shootActive: boolean;
    shootX: number;
    shootY: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rnd(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function rndInt(min: number, max: number) {
  return Math.floor(rnd(min, max));
}
function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function rectCircleCollide(rect: Rect, cx: number, cy: number, cr: number) {
  const nearX = clamp(cx, rect.x, rect.x + rect.w);
  const nearY = clamp(cy, rect.y, rect.y + rect.h);
  return dist(cx, cy, nearX, nearY) < cr;
}
function circleRect(cx: number, cy: number, cr: number, rect: Rect) {
  return rectCircleCollide(rect, cx, cy, cr);
}

function generateObstacles(): Rect[] {
  const obs: Rect[] = [];
  const margin = 200;
  // Border walls
  obs.push({ x: 0, y: 0, w: MAP_W, h: 20 });
  obs.push({ x: 0, y: MAP_H - 20, w: MAP_W, h: 20 });
  obs.push({ x: 0, y: 0, w: 20, h: MAP_H });
  obs.push({ x: MAP_W - 20, y: 0, w: 20, h: MAP_H });

  // Scatter buildings
  for (let i = 0; i < 80; i++) {
    const w = rndInt(40, 150);
    const h = rndInt(40, 150);
    const x = rndInt(margin, MAP_W - margin - w);
    const y = rndInt(margin, MAP_H - margin - h);
    // Don't place near center
    if (dist(x + w / 2, y + h / 2, MAP_W / 2, MAP_H / 2) < 200) continue;
    obs.push({ x, y, w, h });
  }
  return obs;
}

function generateTrees(): Circle[] {
  const trees: Circle[] = [];
  for (let i = 0; i < 60; i++) {
    const r = rndInt(15, 35);
    const x = rndInt(100, MAP_W - 100);
    const y = rndInt(100, MAP_H - 100);
    if (dist(x, y, MAP_W / 2, MAP_H / 2) < 200) continue;
    trees.push({ x, y, r });
  }
  return trees;
}

function generatePickups(): Pickup[] {
  const pickups: Pickup[] = [];
  let id = 1000;
  const kinds: PickupKind[] = ["pistol", "rifle", "shotgun"];
  for (const kind of kinds) {
    for (let i = 0; i < 5; i++) {
      pickups.push({
        id: id++,
        x: rndInt(200, MAP_W - 200),
        y: rndInt(200, MAP_H - 200),
        kind,
        collected: false,
      });
    }
  }
  for (let i = 0; i < 10; i++) {
    pickups.push({
      id: id++,
      x: rndInt(200, MAP_W - 200),
      y: rndInt(200, MAP_H - 200),
      kind: "medkit",
      collected: false,
    });
  }
  for (let i = 0; i < 10; i++) {
    pickups.push({
      id: id++,
      x: rndInt(200, MAP_W - 200),
      y: rndInt(200, MAP_H - 200),
      kind: "ammo",
      collected: false,
    });
  }
  return pickups;
}

function spawnEnemy(id: number, obstacles: Rect[]): Enemy {
  // Spawn from edges
  let x: number;
  let y: number;
  const side = rndInt(0, 4);
  if (side === 0) {
    x = rndInt(50, MAP_W - 50);
    y = rndInt(50, 200);
  } else if (side === 1) {
    x = rndInt(50, MAP_W - 50);
    y = rndInt(MAP_H - 200, MAP_H - 50);
  } else if (side === 2) {
    x = rndInt(50, 200);
    y = rndInt(50, MAP_H - 50);
  } else {
    x = rndInt(MAP_W - 200, MAP_W - 50);
    y = rndInt(50, MAP_H - 50);
  }

  // Push out of walls
  for (const obs of obstacles) {
    if (circleRect(x, y, ENEMY_RADIUS, obs)) {
      x = clamp(x, obs.x + obs.w + ENEMY_RADIUS, MAP_W);
    }
  }

  return {
    id,
    x,
    y,
    hp: 80,
    maxHp: 80,
    angle: Math.random() * Math.PI * 2,
    state: "roam",
    roamTimer: rnd(2, 4),
    roamAngle: Math.random() * Math.PI * 2,
    fireCooldown: rnd(1, 2),
    alive: true,
  };
}

function createInitialState(): GameState {
  const obstacles = generateObstacles();
  const trees = generateTrees();
  const pickups = generatePickups();
  const enemies: Enemy[] = [];
  for (let i = 0; i < INITIAL_ENEMIES; i++) {
    enemies.push(spawnEnemy(i, obstacles));
  }

  return {
    player: {
      x: MAP_W / 2,
      y: MAP_H / 2,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      armor: 50,
      maxArmor: 50,
      angle: 0,
      weapon: "pistol",
      ammo: {
        pistol: { mag: 30, reserve: 90 },
        rifle: { mag: 30, reserve: 120 },
        shotgun: { mag: 8, reserve: 32 },
      },
      fireCooldown: 0,
      kills: 0,
      alive: true,
    },
    enemies,
    bullets: [],
    pickups,
    obstacles,
    trees,
    floatTexts: [],
    zoneRadius: ZONE_INITIAL_RADIUS,
    zoneX: MAP_W / 2,
    zoneY: MAP_H / 2,
    zoneShrinkTimer: ZONE_SHRINK_INTERVAL / 1000,
    zoneWarning: 0,
    enemySpawnTimer: ENEMY_SPAWN_INTERVAL / 1000,
    nextId: 2000,
    startTime: performance.now(),
    cameraX: MAP_W / 2 - 400,
    cameraY: MAP_H / 2 - 300,
    keys: {},
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    touch: {
      joystickActive: false,
      joystickBaseX: 0,
      joystickBaseY: 0,
      joystickCurrX: 0,
      joystickCurrY: 0,
      joystickId: -1,
      shootActive: false,
      shootX: 0,
      shootY: 0,
    },
  };
}

// ─── Drawing ──────────────────────────────────────────────────────────────────
function drawGrass(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, w, h);

  // Draw dirt patches (seeded pattern)
  ctx.fillStyle = COLORS.dirt;
  for (let i = 0; i < 40; i++) {
    const px = ((i * 137 + 50) % (MAP_W - 100)) - cameraX;
    const py = ((i * 97 + 80) % (MAP_H - 100)) - cameraY;
    if (px > -80 && px < w + 80 && py > -80 && py < h + 80) {
      ctx.beginPath();
      ctx.ellipse(
        px,
        py,
        30 + (i % 3) * 20,
        20 + (i % 2) * 15,
        (i * 0.4) % Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  // Grass tufts
  ctx.fillStyle = "rgba(30,50,15,0.4)";
  for (let i = 0; i < 200; i++) {
    const px = ((i * 239 + 10) % (MAP_W - 20)) - cameraX;
    const py = ((i * 179 + 30) % (MAP_H - 20)) - cameraY;
    if (px > -5 && px < w + 5 && py > -5 && py < h + 5) {
      ctx.fillRect(px, py, 3, 6);
    }
  }
}

function drawObstacles(
  ctx: CanvasRenderingContext2D,
  obstacles: Rect[],
  cameraX: number,
  cameraY: number,
  w: number,
  h: number,
) {
  for (const obs of obstacles) {
    const sx = obs.x - cameraX;
    const sy = obs.y - cameraY;
    if (sx + obs.w < 0 || sx > w || sy + obs.h < 0 || sy > h) continue;
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(sx + 4, sy + 4, obs.w, obs.h);
    // Wall face
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(sx, sy, obs.w, obs.h);
    // Wall top highlight
    ctx.fillStyle = COLORS.wallDark;
    ctx.fillRect(sx, sy, obs.w, 4);
    ctx.fillRect(sx, sy, 4, obs.h);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, obs.w, obs.h);
  }
}

function drawTrees(
  ctx: CanvasRenderingContext2D,
  trees: Circle[],
  cameraX: number,
  cameraY: number,
  w: number,
  h: number,
) {
  for (const tree of trees) {
    const sx = tree.x - cameraX;
    const sy = tree.y - cameraY;
    if (
      sx + tree.r < -10 ||
      sx - tree.r > w + 10 ||
      sy + tree.r < -10 ||
      sy - tree.r > h + 10
    )
      continue;
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(sx + 3, sy + 5, tree.r, tree.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tree body
    const grad = ctx.createRadialGradient(
      sx - tree.r * 0.3,
      sy - tree.r * 0.3,
      0,
      sx,
      sy,
      tree.r,
    );
    grad.addColorStop(0, "#2a5020");
    grad.addColorStop(1, COLORS.treeDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, tree.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  w: number,
  h: number,
) {
  const sx = gs.zoneX - gs.cameraX;
  const sy = gs.zoneY - gs.cameraY;

  // Fill outside zone with blue tint
  ctx.save();
  ctx.fillStyle = COLORS.zoneFill;
  ctx.fillRect(0, 0, w, h);
  // Cut out zone circle
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(sx, sy, gs.zoneRadius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fill();
  ctx.restore();

  // Zone border
  ctx.strokeStyle = COLORS.zone;
  ctx.lineWidth = 6;
  ctx.shadowColor = "rgba(50,100,255,0.5)";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(sx, sy, gs.zoneRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawPickups(
  ctx: CanvasRenderingContext2D,
  pickups: Pickup[],
  cameraX: number,
  cameraY: number,
) {
  for (const p of pickups) {
    if (p.collected) continue;
    const sx = p.x - cameraX;
    const sy = p.y - cameraY;
    const size = 12;
    let color = COLORS.yellow;
    if (p.kind === "medkit") color = COLORS.green;
    else if (p.kind === "ammo") color = COLORS.cyan;

    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    const label =
      p.kind === "medkit"
        ? "+HP"
        : p.kind === "ammo"
          ? "AMM"
          : p.kind.substring(0, 3).toUpperCase();
    ctx.fillText(label, sx, sy + size / 2 + 10);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  cameraX: number,
  cameraY: number,
) {
  const sx = player.x - cameraX;
  const sy = player.y - cameraY;

  // Glow
  ctx.shadowColor = COLORS.playerGlow;
  ctx.shadowBlur = 20;

  // Body
  const grad = ctx.createRadialGradient(
    sx - 4,
    sy - 4,
    0,
    sx,
    sy,
    PLAYER_RADIUS,
  );
  grad.addColorStop(0, "#FF8C42");
  grad.addColorStop(1, COLORS.player);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(sx, sy, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Direction indicator
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(
    sx + Math.cos(player.angle) * (PLAYER_RADIUS + 10),
    sy + Math.sin(player.angle) * (PLAYER_RADIUS + 10),
  );
  ctx.stroke();

  ctx.shadowBlur = 0;

  // HP bar above player
  const barW = 36;
  const barH = 4;
  const barX = sx - barW / 2;
  const barY = sy - PLAYER_RADIUS - 10;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = "#e03030";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(barX, barY, barW * (player.hp / player.maxHp), barH);
}

function drawEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: Enemy[],
  cameraX: number,
  cameraY: number,
) {
  for (const e of enemies) {
    if (!e.alive) continue;
    const sx = e.x - cameraX;
    const sy = e.y - cameraY;

    ctx.shadowColor = COLORS.enemyGlow;
    ctx.shadowBlur = 15;

    const grad = ctx.createRadialGradient(
      sx - 3,
      sy - 3,
      0,
      sx,
      sy,
      ENEMY_RADIUS,
    );
    grad.addColorStop(0, "#ff6060");
    grad.addColorStop(1, COLORS.enemy);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, ENEMY_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Direction
    ctx.strokeStyle = "#ffaaaa";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(
      sx + Math.cos(e.angle) * (ENEMY_RADIUS + 8),
      sy + Math.sin(e.angle) * (ENEMY_RADIUS + 8),
    );
    ctx.stroke();
    ctx.shadowBlur = 0;

    // HP bar
    const barW = 32;
    const barH = 4;
    const barX = sx - barW / 2;
    const barY = sy - ENEMY_RADIUS - 10;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = "#600";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
  }
}

function drawBullets(
  ctx: CanvasRenderingContext2D,
  bullets: Bullet[],
  cameraX: number,
  cameraY: number,
) {
  for (const b of bullets) {
    const sx = b.x - cameraX;
    const sy = b.y - cameraY;
    const color = b.fromPlayer ? COLORS.bullet : COLORS.enemyBullet;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawFloatTexts(
  ctx: CanvasRenderingContext2D,
  floatTexts: FloatText[],
  cameraX: number,
  cameraY: number,
) {
  for (const ft of floatTexts) {
    const sx = ft.x - cameraX;
    const sy = ft.y - cameraY;
    const alpha = ft.life / ft.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ft.text, sx, sy);
    ctx.globalAlpha = 1;
  }
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  w: number,
  h: number,
  elapsed: number,
) {
  const { player } = gs;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  // ── Top-center: kills + time ──
  const topHudW = 280;
  const topHudH = 40;
  const topHudX = (w - topHudW) / 2;
  const topHudY = 12;
  ctx.fillStyle = COLORS.hud;
  ctx.strokeStyle = COLORS.hudBorder;
  ctx.lineWidth = 1;
  roundRect(ctx, topHudX, topHudY, topHudW, topHudH, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `KILLS: ${player.kills}   |   TIME: ${timeStr}`,
    w / 2,
    topHudY + 25,
  );

  // ── Zone warning ──
  if (gs.zoneWarning > 0) {
    const pulse = Math.sin(performance.now() / 200) > 0;
    ctx.fillStyle = pulse ? "rgba(50,100,255,0.9)" : "rgba(50,100,255,0.5)";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚠ ZONE CLOSING ⚠", w / 2, topHudY + topHudH + 22);
  }

  // ── Bottom-left: HP + Armor bars ──
  const blX = 14;
  const blY = h - 90;
  const blW = 180;
  const blH = 74;
  ctx.fillStyle = COLORS.hud;
  ctx.strokeStyle = COLORS.hudBorder;
  roundRect(ctx, blX, blY, blW, blH, 6);
  ctx.fill();
  ctx.stroke();

  const barX = blX + 10;
  const barW = blW - 20;
  const barH = 14;

  // HP
  ctx.fillStyle = COLORS.textDim;
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`HP  ${player.hp}/${player.maxHp}`, barX, blY + 18);
  drawBar(
    ctx,
    barX,
    blY + 22,
    barW,
    barH,
    player.hp / player.maxHp,
    "#e03030",
    COLORS.green,
  );

  // Armor
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(`ARMOR  ${player.armor}/${player.maxArmor}`, barX, blY + 46);
  drawBar(
    ctx,
    barX,
    blY + 50,
    barW,
    barH,
    player.armor / player.maxArmor,
    "#223",
    COLORS.blue,
  );

  // ── Bottom-right: weapon + ammo ──
  const wpDef = WEAPONS[player.weapon];
  const ammoData = player.ammo[player.weapon];
  const brW = 160;
  const brH = 60;
  const brX = w - brW - 14;
  const brY = h - 170;
  ctx.fillStyle = COLORS.hud;
  ctx.strokeStyle = COLORS.hudBorder;
  roundRect(ctx, brX, brY, brW, brH, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.orange;
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(wpDef.name, brX + brW / 2, brY + 22);
  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(
    `${ammoData.mag} / ${ammoData.reserve}`,
    brX + brW / 2,
    brY + 44,
  );

  // ── Minimap (bottom-right) ──
  drawMinimap(ctx, gs, w, h);
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  bgColor: string,
  fillColor: string,
) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, w, h);
  const grd = ctx.createLinearGradient(x, y, x + w * ratio, y);
  grd.addColorStop(0, fillColor);
  grd.addColorStop(1, `${fillColor}cc`);
  ctx.fillStyle = grd;
  ctx.fillRect(x, y, w * Math.max(0, ratio), h);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  canvasW: number,
  canvasH: number,
) {
  const MM_SIZE = 160;
  const MM_X = canvasW - MM_SIZE - 14;
  const MM_Y = canvasH - MM_SIZE - 14;
  const SCALE = MM_SIZE / MAP_W;

  // Background
  ctx.fillStyle = "rgba(5,8,12,0.9)";
  ctx.strokeStyle = COLORS.hudBorder;
  ctx.lineWidth = 1.5;
  ctx.fillRect(MM_X, MM_Y, MM_SIZE, MM_SIZE);
  ctx.strokeRect(MM_X, MM_Y, MM_SIZE, MM_SIZE);

  ctx.save();
  ctx.beginPath();
  ctx.rect(MM_X, MM_Y, MM_SIZE, MM_SIZE);
  ctx.clip();

  // Zone circle
  const zsx = gs.zoneX * SCALE + MM_X;
  const zsy = gs.zoneY * SCALE + MM_Y;
  ctx.strokeStyle = "rgba(50,100,255,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(zsx, zsy, gs.zoneRadius * SCALE, 0, Math.PI * 2);
  ctx.stroke();

  // Obstacles (tiny rects)
  ctx.fillStyle = "rgba(80,75,70,0.7)";
  for (const obs of gs.obstacles) {
    const ox = obs.x * SCALE + MM_X;
    const oy = obs.y * SCALE + MM_Y;
    const ow = Math.max(1, obs.w * SCALE);
    const oh = Math.max(1, obs.h * SCALE);
    ctx.fillRect(ox, oy, ow, oh);
  }

  // Enemies (red dots)
  ctx.fillStyle = COLORS.enemy;
  for (const e of gs.enemies) {
    if (!e.alive) continue;
    const ex = e.x * SCALE + MM_X;
    const ey = e.y * SCALE + MM_Y;
    ctx.beginPath();
    ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player dot (orange)
  const px = gs.player.x * SCALE + MM_X;
  const py = gs.player.y * SCALE + MM_Y;
  ctx.shadowColor = COLORS.playerGlow;
  ctx.shadowBlur = 6;
  ctx.fillStyle = COLORS.orange;
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();

  // Label
  ctx.fillStyle = COLORS.textDim;
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MAP", MM_X + MM_SIZE / 2, MM_Y - 3);
}

function drawJoystick(
  ctx: CanvasRenderingContext2D,
  touch: GameState["touch"],
) {
  if (!touch.joystickActive) return;
  // Outer ring
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(touch.joystickBaseX, touch.joystickBaseY, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Inner thumb
  ctx.fillStyle = "rgba(255,90,31,0.4)";
  ctx.strokeStyle = COLORS.orange;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(touch.joystickCurrX, touch.joystickCurrY, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
function updateGame(
  gs: GameState,
  dt: number,
  canvasW: number,
  canvasH: number,
) {
  if (!gs.player.alive) return;

  const { player, obstacles, trees } = gs;

  // ── Player movement ──
  let dx = 0;
  let dy = 0;
  const speed = 200;

  if (gs.touch.joystickActive) {
    const jdx = gs.touch.joystickCurrX - gs.touch.joystickBaseX;
    const jdy = gs.touch.joystickCurrY - gs.touch.joystickBaseY;
    const jlen = Math.sqrt(jdx * jdx + jdy * jdy);
    if (jlen > 5) {
      dx = (jdx / jlen) * speed;
      dy = (jdy / jlen) * speed;
    }
  } else {
    if (gs.keys.ArrowLeft || gs.keys.a || gs.keys.A) dx -= speed;
    if (gs.keys.ArrowRight || gs.keys.d || gs.keys.D) dx += speed;
    if (gs.keys.ArrowUp || gs.keys.w || gs.keys.W) dy -= speed;
    if (gs.keys.ArrowDown || gs.keys.s || gs.keys.S) dy += speed;
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
  }

  const newX = player.x + dx * dt;
  const newY = player.y + dy * dt;

  // Obstacle push-out
  let resolvedX = newX;
  let resolvedY = newY;
  for (const obs of obstacles) {
    if (circleRect(resolvedX, resolvedY, PLAYER_RADIUS, obs)) {
      // Push out
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      const overlapX = resolvedX - cx;
      const overlapY = resolvedY - cy;
      // Determine which axis has smaller overlap
      const halfW = obs.w / 2 + PLAYER_RADIUS;
      const halfH = obs.h / 2 + PLAYER_RADIUS;
      if (Math.abs(overlapX) / halfW > Math.abs(overlapY) / halfH) {
        resolvedX = cx + Math.sign(overlapX) * halfW;
      } else {
        resolvedY = cy + Math.sign(overlapY) * halfH;
      }
    }
  }
  for (const tree of trees) {
    const d = dist(resolvedX, resolvedY, tree.x, tree.y);
    const minD = PLAYER_RADIUS + tree.r;
    if (d < minD && d > 0) {
      const pushAngle = Math.atan2(resolvedY - tree.y, resolvedX - tree.x);
      resolvedX = tree.x + Math.cos(pushAngle) * minD;
      resolvedY = tree.y + Math.sin(pushAngle) * minD;
    }
  }

  player.x = clamp(resolvedX, PLAYER_RADIUS + 20, MAP_W - PLAYER_RADIUS - 20);
  player.y = clamp(resolvedY, PLAYER_RADIUS + 20, MAP_H - PLAYER_RADIUS - 20);

  // ── Camera ──
  gs.cameraX = clamp(player.x - canvasW / 2, 0, MAP_W - canvasW);
  gs.cameraY = clamp(player.y - canvasH / 2, 0, MAP_H - canvasH);

  // ── Player aim ──
  let aimX: number;
  let aimY: number;
  if (gs.touch.shootActive) {
    aimX = gs.touch.shootX + gs.cameraX;
    aimY = gs.touch.shootY + gs.cameraY;
  } else {
    aimX = gs.mouseX + gs.cameraX;
    aimY = gs.mouseY + gs.cameraY;
  }
  player.angle = Math.atan2(aimY - player.y, aimX - player.x);

  // ── Shooting ──
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  const wepDef = WEAPONS[player.weapon];
  const shouldFire = gs.mouseDown || gs.touch.shootActive;

  if (shouldFire && player.fireCooldown <= 0) {
    const ammoData = player.ammo[player.weapon];
    if (ammoData.mag > 0) {
      const cooldown = 1 / wepDef.fireRate;
      player.fireCooldown = cooldown;
      ammoData.mag--;

      for (let p = 0; p < wepDef.pellets; p++) {
        const spreadAngle =
          player.angle + (Math.random() - 0.5) * wepDef.spread;
        gs.bullets.push({
          id: gs.nextId++,
          x: player.x + Math.cos(player.angle) * (PLAYER_RADIUS + 6),
          y: player.y + Math.sin(player.angle) * (PLAYER_RADIUS + 6),
          vx: Math.cos(spreadAngle) * wepDef.bulletSpeed,
          vy: Math.sin(spreadAngle) * wepDef.bulletSpeed,
          damage: wepDef.damage,
          range: wepDef.range,
          traveledDist: 0,
          fromPlayer: true,
          pellets: wepDef.pellets,
        });
      }
    } else if (ammoData.reserve > 0) {
      // Auto-reload
      const needed = wepDef.magSize - ammoData.mag;
      const take = Math.min(needed, ammoData.reserve);
      ammoData.mag += take;
      ammoData.reserve -= take;
    }
  }

  // Switch weapon via number keys
  if (gs.keys["1"]) player.weapon = "pistol";
  if (gs.keys["2"]) player.weapon = "rifle";
  if (gs.keys["3"]) player.weapon = "shotgun";

  // ── Bullets ──
  const bulletsToRemove: number[] = [];
  for (let bi = 0; bi < gs.bullets.length; bi++) {
    const b = gs.bullets[bi];
    const step = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.traveledDist += step;

    let remove = false;
    if (b.traveledDist >= b.range) remove = true;
    if (b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H) remove = true;

    // vs obstacles
    if (!remove) {
      for (const obs of obstacles) {
        if (
          b.x >= obs.x &&
          b.x <= obs.x + obs.w &&
          b.y >= obs.y &&
          b.y <= obs.y + obs.h
        ) {
          remove = true;
          break;
        }
      }
    }
    // vs trees
    if (!remove) {
      for (const tree of trees) {
        if (dist(b.x, b.y, tree.x, tree.y) < tree.r) {
          remove = true;
          break;
        }
      }
    }

    // vs targets
    if (!remove) {
      if (b.fromPlayer) {
        for (const e of gs.enemies) {
          if (!e.alive) continue;
          if (dist(b.x, b.y, e.x, e.y) < ENEMY_RADIUS + BULLET_RADIUS) {
            e.hp -= b.damage;
            remove = true;
            if (e.hp <= 0) {
              e.alive = false;
              player.kills++;
              gs.floatTexts.push({
                id: gs.nextId++,
                x: e.x,
                y: e.y - 20,
                text: "+1 KILL",
                life: 1.5,
                maxLife: 1.5,
                color: COLORS.orange,
              });
              // Weapon drop
              if (Math.random() < 0.5) {
                const kinds: WeaponType[] = ["pistol", "rifle", "shotgun"];
                const kind = kinds[rndInt(0, 3)];
                gs.pickups.push({
                  id: gs.nextId++,
                  x: e.x + rnd(-20, 20),
                  y: e.y + rnd(-20, 20),
                  kind,
                  collected: false,
                });
              }
            }
            break;
          }
        }
      } else {
        if (
          dist(b.x, b.y, player.x, player.y) <
          PLAYER_RADIUS + BULLET_RADIUS
        ) {
          let dmg = b.damage;
          if (player.armor > 0) {
            const absorbed = Math.min(player.armor, dmg * 0.6);
            player.armor -= absorbed;
            dmg -= absorbed;
          }
          player.hp -= dmg;
          remove = true;
          if (player.hp <= 0) {
            player.hp = 0;
            player.alive = false;
          }
        }
      }
    }

    if (remove) bulletsToRemove.push(bi);
  }
  for (let i = bulletsToRemove.length - 1; i >= 0; i--) {
    gs.bullets.splice(bulletsToRemove[i], 1);
  }

  // ── Enemies AI ──
  for (const e of gs.enemies) {
    if (!e.alive) continue;

    const dp = dist(e.x, e.y, player.x, player.y);
    const atkRange = 280;
    const chaseRange = 400;

    // State transitions
    if (dp < atkRange) e.state = "attack";
    else if (dp < chaseRange) e.state = "chase";
    else e.state = "roam";

    if (e.state === "roam") {
      e.roamTimer -= dt;
      if (e.roamTimer <= 0) {
        e.roamAngle = Math.random() * Math.PI * 2;
        e.roamTimer = rnd(2, 4);
      }
      const eSpeed = 60;
      const ex = e.x + Math.cos(e.roamAngle) * eSpeed * dt;
      const ey = e.y + Math.sin(e.roamAngle) * eSpeed * dt;
      e.angle = e.roamAngle;

      let rx = ex;
      let ry = ey;
      for (const obs of obstacles) {
        if (circleRect(rx, ry, ENEMY_RADIUS, obs)) {
          e.roamAngle += Math.PI + rnd(-0.5, 0.5);
          rx = e.x;
          ry = e.y;
          break;
        }
      }
      e.x = clamp(rx, ENEMY_RADIUS + 20, MAP_W - ENEMY_RADIUS - 20);
      e.y = clamp(ry, ENEMY_RADIUS + 20, MAP_H - ENEMY_RADIUS - 20);
    } else if (e.state === "chase") {
      const angle = Math.atan2(player.y - e.y, player.x - e.x);
      e.angle = angle;
      const eSpeed = 120;
      const ex = e.x + Math.cos(angle) * eSpeed * dt;
      const ey = e.y + Math.sin(angle) * eSpeed * dt;
      let rx = ex;
      let ry = ey;
      for (const obs of obstacles) {
        if (circleRect(rx, ry, ENEMY_RADIUS, obs)) {
          rx = e.x;
          ry = e.y;
          break;
        }
      }
      e.x = clamp(rx, ENEMY_RADIUS + 20, MAP_W - ENEMY_RADIUS - 20);
      e.y = clamp(ry, ENEMY_RADIUS + 20, MAP_H - ENEMY_RADIUS - 20);
    } else {
      // Attack
      const angle = Math.atan2(player.y - e.y, player.x - e.x);
      e.angle = angle;
      e.fireCooldown -= dt;
      if (e.fireCooldown <= 0) {
        e.fireCooldown = rnd(1, 2);
        const spread = (Math.random() - 0.5) * 0.15;
        const fa = angle + spread;
        gs.bullets.push({
          id: gs.nextId++,
          x: e.x + Math.cos(angle) * (ENEMY_RADIUS + 6),
          y: e.y + Math.sin(angle) * (ENEMY_RADIUS + 6),
          vx: Math.cos(fa) * 450,
          vy: Math.sin(fa) * 450,
          damage: 20,
          range: 380,
          traveledDist: 0,
          fromPlayer: false,
          pellets: 1,
        });
      }
    }
  }

  // ── Enemy spawn ──
  gs.enemySpawnTimer -= dt;
  if (gs.enemySpawnTimer <= 0) {
    gs.enemySpawnTimer = ENEMY_SPAWN_INTERVAL / 1000;
    const alive = gs.enemies.filter((e) => e.alive).length;
    if (alive < MAX_ENEMIES) {
      gs.enemies.push(spawnEnemy(gs.nextId++, obstacles));
    }
  }

  // ── Zone ──
  gs.zoneShrinkTimer -= dt;
  if (gs.zoneShrinkTimer <= 0) {
    gs.zoneShrinkTimer = ZONE_SHRINK_INTERVAL / 1000;
    gs.zoneRadius = Math.max(
      ZONE_MIN_RADIUS,
      gs.zoneRadius - ZONE_SHRINK_AMOUNT,
    );
  }
  gs.zoneWarning =
    gs.zoneShrinkTimer <= 5 && gs.zoneRadius > ZONE_MIN_RADIUS
      ? gs.zoneShrinkTimer
      : 0;

  // Zone damage
  const dToCenter = dist(player.x, player.y, gs.zoneX, gs.zoneY);
  if (dToCenter > gs.zoneRadius) {
    player.hp = Math.max(0, player.hp - ZONE_DAMAGE_PER_SEC * dt);
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
    }
  }

  // ── Pickups ──
  for (const p of gs.pickups) {
    if (p.collected) continue;
    if (dist(player.x, player.y, p.x, p.y) < PICKUP_RADIUS) {
      p.collected = true;
      let msg = "";
      let color = COLORS.yellow;
      if (p.kind === "medkit") {
        player.hp = Math.min(player.maxHp, player.hp + 30);
        msg = "+30 HP";
        color = COLORS.green;
      } else if (p.kind === "ammo") {
        player.ammo.pistol.reserve += 30;
        player.ammo.rifle.reserve += 30;
        player.ammo.shotgun.reserve += 8;
        msg = "+AMMO";
        color = COLORS.cyan;
      } else {
        player.weapon = p.kind as WeaponType;
        msg = `${WEAPONS[p.kind as WeaponType].name}!`;
        color = COLORS.yellow;
      }
      gs.floatTexts.push({
        id: gs.nextId++,
        x: p.x,
        y: p.y - 15,
        text: msg,
        life: 1.2,
        maxLife: 1.2,
        color,
      });
    }
  }

  // ── Float texts ──
  for (const ft of gs.floatTexts) {
    ft.life -= dt;
    ft.y -= 25 * dt;
  }
  gs.floatTexts = gs.floatTexts.filter((ft) => ft.life > 0);
}

// ─── Component ────────────────────────────────────────────────────────────────
type Screen = "start" | "playing" | "gameover";

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [screen, setScreen] = useState<Screen>("start");
  const [finalStats, setFinalStats] = useState({ kills: 0, time: 0 });
  const screenRef = useRef<Screen>("start");

  const startGame = useCallback(() => {
    gsRef.current = createInitialState();
    screenRef.current = "playing";
    setScreen("playing");
  }, []);

  const handleRestart = useCallback(() => {
    startGame();
  }, [startGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Input ──
    const onKeyDown = (e: KeyboardEvent) => {
      if (gsRef.current) gsRef.current.keys[e.key] = true;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      )
        e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (gsRef.current) gsRef.current.keys[e.key] = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (gsRef.current) {
        gsRef.current.mouseX = e.clientX;
        gsRef.current.mouseY = e.clientY;
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && gsRef.current) gsRef.current.mouseDown = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && gsRef.current) gsRef.current.mouseDown = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (!gsRef.current) return;
      const gs = gsRef.current;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth / 2) {
          // Left side => joystick
          if (!gs.touch.joystickActive) {
            gs.touch.joystickActive = true;
            gs.touch.joystickId = t.identifier;
            gs.touch.joystickBaseX = t.clientX;
            gs.touch.joystickBaseY = t.clientY;
            gs.touch.joystickCurrX = t.clientX;
            gs.touch.joystickCurrY = t.clientY;
          }
        } else {
          // Right side => shoot
          gs.touch.shootActive = true;
          gs.touch.shootX = t.clientX;
          gs.touch.shootY = t.clientY;
          gs.mouseDown = true;
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!gsRef.current) return;
      const gs = gsRef.current;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === gs.touch.joystickId) {
          const maxDist = 50;
          const ddx = t.clientX - gs.touch.joystickBaseX;
          const ddy = t.clientY - gs.touch.joystickBaseY;
          const dl = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dl > maxDist) {
            gs.touch.joystickCurrX =
              gs.touch.joystickBaseX + (ddx / dl) * maxDist;
            gs.touch.joystickCurrY =
              gs.touch.joystickBaseY + (ddy / dl) * maxDist;
          } else {
            gs.touch.joystickCurrX = t.clientX;
            gs.touch.joystickCurrY = t.clientY;
          }
        } else {
          gs.touch.shootX = t.clientX;
          gs.touch.shootY = t.clientY;
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (!gsRef.current) return;
      const gs = gsRef.current;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === gs.touch.joystickId) {
          gs.touch.joystickActive = false;
          gs.touch.joystickId = -1;
        } else {
          gs.touch.shootActive = false;
          gs.mouseDown = false;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    // ── Game Loop ──
    const loop = (time: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const rawDt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      const dt = Math.min(rawDt, 0.05);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;

      if (screenRef.current === "start") {
        drawStartScreen(ctx, W, H, time);
        return;
      }

      const gs = gsRef.current;
      if (!gs) return;

      if (screenRef.current === "playing") {
        updateGame(gs, dt, W, H);

        if (!gs.player.alive) {
          const elapsed = (performance.now() - gs.startTime) / 1000;
          setFinalStats({ kills: gs.player.kills, time: elapsed });
          screenRef.current = "gameover";
          setScreen("gameover");
        }
      }

      // Draw frame
      ctx.clearRect(0, 0, W, H);
      drawGrass(ctx, gs.cameraX, gs.cameraY, W, H);
      drawZone(ctx, gs, W, H);
      drawObstacles(ctx, gs.obstacles, gs.cameraX, gs.cameraY, W, H);
      drawTrees(ctx, gs.trees, gs.cameraX, gs.cameraY, W, H);
      drawPickups(ctx, gs.pickups, gs.cameraX, gs.cameraY);
      drawBullets(ctx, gs.bullets, gs.cameraX, gs.cameraY);
      drawEnemies(ctx, gs.enemies, gs.cameraX, gs.cameraY);
      drawPlayer(ctx, gs.player, gs.cameraX, gs.cameraY);
      drawFloatTexts(ctx, gs.floatTexts, gs.cameraX, gs.cameraY);
      drawJoystick(ctx, gs.touch);

      const elapsed = (performance.now() - gs.startTime) / 1000;
      drawHUD(ctx, gs, W, H, elapsed);
    };

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Keep screenRef in sync
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#0B0F12",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          cursor: screen === "playing" ? "crosshair" : "default",
        }}
      />

      {/* Start Screen Overlay */}
      {screen === "start" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(160deg, #0B0F12 0%, #111820 50%, #0d1008 100%)",
            fontFamily: "'BricolageGrotesque', system-ui, sans-serif",
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              color: "rgba(255,90,31,0.85)",
              fontSize: "clamp(11px, 1.5vw, 14px)",
              fontWeight: 700,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              marginBottom: "16px",
              border: "1px solid rgba(255,90,31,0.3)",
              padding: "6px 18px",
              borderRadius: "3px",
            }}
            data-ocid="start.panel"
          >
            2D TOP-DOWN SHOOTER GAME
          </div>

          {/* Title */}
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(70px, 14vw, 160px)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: "#E8E0CC",
              textShadow:
                "0 0 60px rgba(255,90,31,0.3), 0 4px 0 #0B0F12, 0 8px 0 rgba(0,0,0,0.5)",
              WebkitTextStroke: "2px rgba(0,0,0,0.6)",
              textTransform: "uppercase",
            }}
          >
            USTAD JI
          </h1>

          {/* Subtitle */}
          <p
            style={{
              marginTop: "20px",
              marginBottom: "0",
              fontSize: "clamp(12px, 2vw, 16px)",
              color: "rgba(232,236,239,0.65)",
              letterSpacing: "0.08em",
              textAlign: "center",
              maxWidth: "500px",
              fontWeight: 500,
            }}
          >
            The Ultimate 2D Survival Showdown.
            <br />
            Last One Standing Wins.
          </p>

          {/* Play button */}
          <button
            type="button"
            data-ocid="start.primary_button"
            onClick={startGame}
            style={{
              marginTop: "44px",
              padding: "18px 56px",
              fontSize: "clamp(16px, 2.5vw, 20px)",
              fontWeight: 800,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              background:
                "linear-gradient(135deg, #FF5A1F 0%, #FF8C42 50%, #FF5A1F 100%)",
              color: "#0B0F12",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              boxShadow:
                "0 0 30px rgba(255,90,31,0.5), 0 0 60px rgba(255,90,31,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              (e.target as HTMLButtonElement).style.boxShadow =
                "0 0 40px rgba(255,90,31,0.7), 0 0 80px rgba(255,90,31,0.3), inset 0 1px 0 rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.transform = "scale(1)";
              (e.target as HTMLButtonElement).style.boxShadow =
                "0 0 30px rgba(255,90,31,0.5), 0 0 60px rgba(255,90,31,0.2), inset 0 1px 0 rgba(255,255,255,0.2)";
            }}
          >
            ▶ PLAY NOW
          </button>

          {/* Controls hint */}
          <div
            style={{
              marginTop: "40px",
              display: "flex",
              gap: "24px",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {[
              ["WASD", "Move"],
              ["MOUSE", "Aim"],
              ["LMB", "Shoot"],
              ["1/2/3", "Weapons"],
            ].map(([key, label]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "rgba(232,236,239,0.5)",
                  fontSize: "12px",
                }}
              >
                <span
                  style={{
                    background: "rgba(255,90,31,0.15)",
                    border: "1px solid rgba(255,90,31,0.4)",
                    borderRadius: "3px",
                    padding: "3px 8px",
                    fontWeight: 700,
                    color: "rgba(255,140,66,0.9)",
                    fontSize: "11px",
                    letterSpacing: "0.05em",
                  }}
                >
                  {key}
                </span>
                {label}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              position: "absolute",
              bottom: "20px",
              color: "rgba(232,236,239,0.25)",
              fontSize: "12px",
            }}
          >
            © {new Date().getFullYear()}. Built with ❤️ using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgba(255,90,31,0.5)", textDecoration: "none" }}
            >
              caffeine.ai
            </a>
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {screen === "gameover" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(11,15,18,0.92)",
            fontFamily: "'BricolageGrotesque', system-ui, sans-serif",
          }}
          data-ocid="gameover.modal"
        >
          <div
            style={{
              background: "linear-gradient(160deg, #0f1418 0%, #141c10 100%)",
              border: "1px solid rgba(255,90,31,0.3)",
              borderRadius: "8px",
              padding: "clamp(32px, 5vw, 56px) clamp(40px, 7vw, 80px)",
              textAlign: "center",
              boxShadow:
                "0 0 60px rgba(255,90,31,0.15), 0 0 120px rgba(0,0,0,0.8)",
              maxWidth: "480px",
              width: "90%",
            }}
          >
            <div
              style={{
                fontSize: "clamp(48px, 9vw, 80px)",
                fontWeight: 900,
                color: COLORS.orange,
                textShadow: "0 0 40px rgba(255,90,31,0.6)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              GAME OVER
            </div>

            <div
              style={{
                marginTop: "32px",
                display: "flex",
                gap: "32px",
                justifyContent: "center",
              }}
            >
              <div>
                <div
                  style={{
                    color: "rgba(232,236,239,0.45)",
                    fontSize: "12px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                  }}
                >
                  Kills
                </div>
                <div
                  style={{
                    color: "#E8ECEF",
                    fontSize: "clamp(32px, 6vw, 52px)",
                    fontWeight: 900,
                    lineHeight: 1.1,
                  }}
                >
                  {finalStats.kills}
                </div>
              </div>
              <div
                style={{
                  width: "1px",
                  background: "rgba(255,90,31,0.2)",
                  margin: "4px 0",
                }}
              />
              <div>
                <div
                  style={{
                    color: "rgba(232,236,239,0.45)",
                    fontSize: "12px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                  }}
                >
                  Time Survived
                </div>
                <div
                  style={{
                    color: "#E8ECEF",
                    fontSize: "clamp(32px, 6vw, 52px)",
                    fontWeight: 900,
                    lineHeight: 1.1,
                  }}
                >
                  {String(Math.floor(finalStats.time / 60)).padStart(2, "0")}:
                  {String(Math.floor(finalStats.time % 60)).padStart(2, "0")}
                </div>
              </div>
            </div>

            <button
              type="button"
              data-ocid="gameover.primary_button"
              onClick={handleRestart}
              style={{
                marginTop: "40px",
                padding: "16px 48px",
                fontSize: "16px",
                fontWeight: 800,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                background:
                  "linear-gradient(135deg, #FF5A1F 0%, #FF8C42 50%, #FF5A1F 100%)",
                color: "#0B0F12",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                boxShadow: "0 0 30px rgba(255,90,31,0.4)",
                transition: "transform 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              ↺ PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Start Screen Canvas Draw ─────────────────────────────────────────────────
function drawStartScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  _time: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0B0F12";
  ctx.fillRect(0, 0, w, h);

  // Subtle scanline effect
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0, y, w, 1);
  }

  // Ambient glow from center-bottom
  const grd = ctx.createRadialGradient(
    w / 2,
    h * 0.8,
    0,
    w / 2,
    h * 0.8,
    w * 0.5,
  );
  grd.addColorStop(0, "rgba(255,90,31,0.05)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
}
