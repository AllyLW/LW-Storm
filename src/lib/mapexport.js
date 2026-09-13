// Draw the battle map with assigned name-tags onto a canvas and download it.
// Canvas (not screenshot) so the output is sharp and consistent every time.
//
// The tags are painted to match the on-screen look: a dark rounded box with a
// coloured border, the building name, and the player names as chips underneath.

import { MAPS, KIND } from "./maps.js";

const BASE = import.meta.env.BASE_URL || "/";

// Rounded-rect helper.
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Load the background image once.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Main export. ev/team pick the map; assign is { buildingKey: [ids] };
// memberById resolves names. format = "png" | "jpeg". weekLabel for the filename.
export async function exportMapImage({ ev, team, assign, memberById, format, weekLabel }) {
  const layout = MAPS[ev];
  const img = await loadImage(BASE + layout.image);

  // Render at the image's natural size for a crisp result.
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // background
  ctx.drawImage(img, 0, 0, W, H);

  // scale factor so tag text is legible relative to image size
  const S = W / 800; // tuned for ~1586px wide -> ~2

  // spawns are starter camps — not labelled on the export

  // buildings with assignments
  for (const b of layout.buildings) {
    const ids = assign[b.key] || [];
    if (ids.length === 0) continue; // only draw filled buildings on the export
    const kind = KIND[b.kind];
    const names = ids.map((id) => memberById.get(id)?.name || "?");

    const cx = (b.x / 100) * W;
    const cy = (b.y / 100) * H;

    // measure
    ctx.font = `800 ${11 * S}px "Space Grotesk", sans-serif`;
    const nameW = ctx.measureText(b.name).width;
    ctx.font = `700 ${10 * S}px "Space Grotesk", sans-serif`;
    const chipHs = 15 * S;
    const chipGap = 3 * S;
    // lay chips in rows, wrap if wide
    const chipWidths = names.map((n) => ctx.measureText(n).width + 10 * S);
    const maxRowW = Math.max(nameW, 120 * S);
    // simple: stack chips vertically for reliability
    const boxW = Math.max(nameW, ...chipWidths) + 12 * S;
    const headH = 16 * S;
    const boxH = headH + names.length * (chipHs + chipGap) + 6 * S;
    const bx = cx - boxW / 2;
    const by = cy - boxH / 2;

    // box
    ctx.fillStyle = "rgba(20,18,16,0.85)";
    ctx.strokeStyle = kind.tint;
    ctx.lineWidth = 2 * S;
    roundRect(ctx, bx, by, boxW, boxH, 6 * S);
    ctx.fill();
    ctx.stroke();

    // building name
    ctx.font = `800 ${11 * S}px "Space Grotesk", sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(b.name, cx, by + 4 * S);

    // player chips
    let yy = by + headH + 2 * S;
    for (let i = 0; i < names.length; i++) {
      const cw = chipWidths[i];
      const chx = cx - cw / 2;
      ctx.fillStyle = kind.tint;
      roundRect(ctx, chx, yy, cw, chipHs, 4 * S);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${10 * S}px "Space Grotesk", sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(names[i], cx, yy + chipHs / 2 + 0.5 * S);
      yy += chipHs + chipGap;
    }
  }

  // guardians — big name tags on the edges (drawn on top of buildings)
  const guardians = assign.__guardians || {};
  for (const z of layout.zones || []) {
    const gid = guardians[z.key];
    if (!gid) continue;
    const name = memberById.get(gid)?.name || "?";
    const cx = (z.x / 100) * W;
    const cy = (z.y / 100) * H;
    ctx.font = `800 ${15 * S}px "Space Grotesk", sans-serif`;
    const tw = ctx.measureText(name).width;
    const padX = 14 * S, padY = 9 * S;
    const boxW = tw + padX * 2;
    const boxH = 15 * S + padY * 2;
    const bx = cx - boxW / 2;
    const by = cy - boxH / 2;
    // black tag with white border, like the in-game markers
    ctx.fillStyle = "#141210";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5 * S;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 6 * S;
    ctx.shadowOffsetY = 3 * S;
    roundRect(ctx, bx, by, boxW, boxH, 8 * S);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, cx, cy + 0.5 * S);
  }

  // download
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const quality = format === "jpeg" ? 0.92 : undefined;
  const dataUrl = canvas.toDataURL(mime, quality);
  const safeLabel = (weekLabel || "week").replace(/[^\w-]+/g, "-");
  const ext = format === "jpeg" ? "jpg" : "png";
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${layout.label.replace(/\s+/g, "")}-Team${team}-${safeLabel}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}