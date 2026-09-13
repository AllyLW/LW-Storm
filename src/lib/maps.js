// Battlefield maps. Each event uses a real game-render background image, with
// buildings positioned as % coordinates so assignment tags land on the art.
// Background images live in /public/maps and are referenced by `image`.

import { thpShort } from "./format.js";

export const MAPS = {
  DSB: {
    label: "Desert Storm",
    image: "maps/desert.png",
    aspect: 1586 / 992,
    spawns: [
      { x: 15, y: 42, team: "blue" },
      { x: 85, y: 45, team: "red" },
    ],
    // positions verified against the render
    buildings: [
      { key: "info",    name: "Info Center",    kind: "info",     x: 35, y: 17 },
      { key: "arsenal", name: "Arsenal",        kind: "buff",     x: 49, y: 20 },
      { key: "hosp4",   name: "Hospital 4",     kind: "hospital", x: 65, y: 16 },
      { key: "oil1",    name: "Oil Refinery 1", kind: "oil",      x: 24, y: 30 },
      { key: "hosp2",   name: "Hospital 2",     kind: "hospital", x: 74, y: 30 },
      { key: "silo",    name: "Nuclear Silo",   kind: "silo",     x: 49, y: 44 },
      { key: "hosp1",   name: "Hospital 1",     kind: "hospital", x: 23, y: 56 },
      { key: "oil2",    name: "Oil Refinery 2", kind: "oil",      x: 76, y: 57 },
      { key: "hosp3",   name: "Hospital 3",     kind: "hospital", x: 32, y: 65 },
      { key: "mercenary", name: "Mercenary",    kind: "debuff",   x: 49, y: 71 },
      { key: "tech",    name: "Tech Center",    kind: "tech",     x: 66, y: 71 },
    ],
    zones: [
      { key: "z-topleft",  label: "NW",     x: 22, y: 10, covers: ["info", "oil1"] },
      { key: "z-top",      label: "Center", x: 49, y: 8,  covers: ["arsenal", "silo"] },
      { key: "z-topright", label: "NE",     x: 78, y: 12, covers: ["hosp4", "hosp2"] },
      { key: "z-botleft",  label: "SW",     x: 16, y: 78, covers: ["hosp1", "hosp3"] },
      { key: "z-bot",      label: "Bottom", x: 45, y: 90, covers: ["mercenary"] },
      { key: "z-botright", label: "SE",     x: 80, y: 82, covers: ["oil2", "tech"] },
    ],
  },

  // Canyon uses the same background for now — swap `image` + positions when the
  // real Canyon render arrives.
  CSB: {
    label: "Canyon Storm",
    image: "maps/desert.png",
    aspect: 1586 / 992,
    spawns: [
      { x: 15, y: 42, team: "blue" },
      { x: 85, y: 45, team: "red" },
    ],
    buildings: [
      { key: "info",    name: "Info Center",    kind: "info",     x: 35, y: 17 },
      { key: "arsenal", name: "Arsenal",        kind: "buff",     x: 49, y: 20 },
      { key: "hosp4",   name: "Hospital 4",     kind: "hospital", x: 65, y: 16 },
      { key: "oil1",    name: "Oil Refinery 1", kind: "oil",      x: 24, y: 30 },
      { key: "hosp2",   name: "Hospital 2",     kind: "hospital", x: 74, y: 30 },
      { key: "silo",    name: "Nuclear Silo",   kind: "silo",     x: 49, y: 44 },
      { key: "hosp1",   name: "Hospital 1",     kind: "hospital", x: 23, y: 56 },
      { key: "oil2",    name: "Oil Refinery 2", kind: "oil",      x: 76, y: 57 },
      { key: "hosp3",   name: "Hospital 3",     kind: "hospital", x: 32, y: 65 },
      { key: "mercenary", name: "Mercenary",    kind: "debuff",   x: 49, y: 71 },
      { key: "tech",    name: "Tech Center",    kind: "tech",     x: 66, y: 71 },
    ],
    zones: [
      { key: "z-topleft",  label: "NW",     x: 22, y: 10, covers: ["info", "oil1"] },
      { key: "z-top",      label: "Center", x: 49, y: 8,  covers: ["arsenal", "silo"] },
      { key: "z-topright", label: "NE",     x: 78, y: 12, covers: ["hosp4", "hosp2"] },
      { key: "z-botleft",  label: "SW",     x: 16, y: 78, covers: ["hosp1", "hosp3"] },
      { key: "z-bot",      label: "Bottom", x: 45, y: 90, covers: ["mercenary"] },
      { key: "z-botright", label: "SE",     x: 80, y: 82, covers: ["oil2", "tech"] },
    ],
  },
};

// Colour per building kind — used to tint the assignment tag border.
export const KIND = {
  silo:     { tint: "#c8102e", label: "Highest points" },
  buff:     { tint: "#7a4fbf", label: "+15% hero buff" },
  debuff:   { tint: "#8a5a2b", label: "-15% enemy" },
  info:     { tint: "#2f7d6b", label: "+10% capture points" },
  hospital: { tint: "#0c7a4a", label: "Heals troops" },
  oil:      { tint: "#c67a2e", label: "Main points" },
  tech:     { tint: "#3a6ea5", label: "+50% speed" },
};

export const MAX_PER_BUILDING = 5;