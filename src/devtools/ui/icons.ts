/**
 * Aktion DevTools — icon set.
 *
 * Drawn for this panel on a 24px grid with a 1.75px round stroke, so every
 * glyph shares one weight and one optical size. The first-generation panel used
 * Unicode symbols (⚡ ◎ ◆ ▲ ⇅), which render in whatever font the host page
 * happens to fall back to — different weights, different baselines, and on some
 * systems a colour emoji in the middle of a monochrome toolbar.
 *
 * Shapes are written in a tiny DSL so the table stays readable:
 *
 *   `M…`             an SVG path
 *   `c:cx,cy,r`      a circle
 *   `r:x,y,w,h,rx`   a rounded rect
 *   prefix `f:`      filled instead of stroked (`f:c:12,12,2`)
 *
 * Shapes are separated by `|`.
 */

import { h, type VElement } from "../core/vdom.js";

const ICONS = {
  /* ---- sections ---- */
  overview: "r:3.5,3.5,7,9,1.5|r:13.5,3.5,7,5,1.5|r:13.5,11.5,7,9,1.5|r:3.5,15.5,7,5,1.5",
  inspect: "M12 3l8 4.5v9L12 21l-8-4.5v-9z|M12 12l8-4.5|M12 12v9|M12 12L4 7.5",
  state: "M8 4H7a2 2 0 0 0-2 2v3.5a2.5 2.5 0 0 1-2 2.5 2.5 2.5 0 0 1 2 2.5V18a2 2 0 0 0 2 2h1|M16 4h1a2 2 0 0 1 2 2v3.5a2.5 2.5 0 0 0 2 2.5 2.5 2.5 0 0 0-2 2.5V18a2 2 0 0 1-2 2h-1|f:c:12,12,1.6",
  data: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z|M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6|M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  routes: "c:6,19,2|c:18,5,2|M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16",
  timeline: "M4 6h8|M8 12h11|M6 18h7|M3.5 3v18",
  network: "M7 4v16|M3.5 7.5L7 4l3.5 3.5|M17 20V4|M13.5 16.5L17 20l3.5-3.5",
  console: "r:3,4,18,16,2.5|M7.5 9.5l3 2.5-3 2.5|M13 15h3.5",
  effects: "M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z",
  profiler: "M4.6 18.5a9 9 0 1 1 14.8 0|M12 13.5l3.8-3.8|f:c:12,13.5,1.6",
  a11y: "c:12,12,9|f:c:12,7.3,1.4|M7.5 10l4.5 1.1 4.5-1.1|M12 11.1v3.1|M12 14.2l-2.4 3.8|M12 14.2l2.4 3.8",
  security: "M12 3l7 2.8v5.4c0 4.8-3.2 8.3-7 9.8-3.8-1.5-7-5-7-9.8V5.8z|M9 12l2.2 2.2L15.2 10",
  test: "M9 3h6|M10 3v6.2l-5.3 9.2A1.8 1.8 0 0 0 6.3 21h11.4a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3|M7.3 15.5h9.4",
  source: "M8 7l-5 5 5 5|M16 7l5 5-5 5|M13.6 4.5l-3.2 15",
  theme: "M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.3-4-7.6-9-7.6z|f:c:7.5,11,1.2|f:c:10.5,7,1.2|f:c:15,7.5,1.2",
  settings: "M4 7h9|M17 7h3|M4 17h3|M11 17h9|c:15,7,2|c:9,17,2",

  /* ---- actions ---- */
  pick: "M4.5 9V5.5a1 1 0 0 1 1-1H9|M15 4.5h3.5a1 1 0 0 1 1 1V9|M9 19.5H5.5a1 1 0 0 1-1-1V15|M11 11l8.5 3.2-3.7 1.3-1.4 3.9z",
  search: "c:10.5,10.5,6.5|M20 20l-4.8-4.8",
  close: "M6 6l12 12|M18 6L6 18",
  plus: "M12 5v14|M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  chevronRight: "M9.5 6l6 6-6 6",
  chevronDown: "M6 9.5l6 6 6-6",
  chevronLeft: "M14.5 6l-6 6 6 6",
  chevronUp: "M6 14.5l6-6 6 6",
  arrowRight: "M5 12h14|M13 6l6 6-6 6",
  arrowUpRight: "M7 17L17 7|M8 7h9v9",
  copy: "r:8.5,8.5,11.5,11.5,2|M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5",
  download: "M12 4v11|M7 10.5l5 4.5 5-4.5|M5 20h14",
  upload: "M12 15V4|M7 8.5L12 4l5 4.5|M5 20h14",
  trash: "M4 7h16|M10 11v6|M14 11v6|M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12|M9 7V4.5h6V7",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5|M4.5 3.5v4h4|M4 13a8 8 0 0 0 14.6 4.5|M19.5 20.5v-4h-4",
  play: "f:M8 5.2v13.6a.6.6 0 0 0 .9.5l10.3-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z",
  pause: "M8.5 5v14|M15.5 5v14",
  stop: "f:r:6.5,6.5,11,11,2",
  record: "f:c:12,12,6",
  stepBack: "M18 6l-8 6 8 6z|M6 6v12",
  stepForward: "M6 6l8 6-8 6z|M18 6v12",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z|c:12,12,3",
  eyeOff: "M3 3l18 18|M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4|M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.4-.6 4.7-1.4|M9.9 9.9a3 3 0 0 0 4.2 4.2",
  pin: "M15 4l5 5|M16.5 5.5l-4.3 4.3-4.7 1 5.7 5.7 1-4.7 4.3-4.3|M9.3 14.7L4 20",
  filter: "M4 5h16l-6.2 7.6V19l-3.6 2v-8.4z",
  more: "f:c:5.5,12,1.5|f:c:12,12,1.5|f:c:18.5,12,1.5",
  moreVertical: "f:c:12,5.5,1.5|f:c:12,12,1.5|f:c:12,18.5,1.5",
  dockRight: "r:3,4.5,18,15,2|M14.5 4.5v15",
  dockBottom: "r:3,4.5,18,15,2|M3 13.5h18",
  dockLeft: "r:3,4.5,18,15,2|M9.5 4.5v15",
  dockFloat: "r:5.5,7.5,15,12,2|M3.5 15V6a1.5 1.5 0 0 1 1.5-1.5h11",
  popout: "M14 4h6v6|M20 4l-8.5 8.5|M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10",
  sun: "c:12,12,4|M12 2.5v2|M12 19.5v2|M4.6 4.6l1.4 1.4|M18 18l1.4 1.4|M2.5 12h2|M19.5 12h2|M4.6 19.4L6 18|M18 6l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z",
  keyboard: "r:2.5,6,19,12,2.5|M6.5 10h.01|M10 10h.01|M14 10h.01|M17.5 10h.01|M7.5 14h9",
  command: "M9 9H6.5A2.5 2.5 0 1 1 9 6.5z|M15 9V6.5A2.5 2.5 0 1 1 17.5 9z|M15 15h2.5a2.5 2.5 0 1 1-2.5 2.5z|M9 15v2.5A2.5 2.5 0 1 1 6.5 15z|r:9,9,6,6,0",
  info: "c:12,12,9|M12 11v5.5|f:c:12,7.8,1.1",
  warning: "M12 3.5l9.5 16.5h-19z|M12 10v4.5|f:c:12,17.3,1.1",
  error: "c:12,12,9|M15 9l-6 6|M9 9l6 6",
  checkCircle: "c:12,12,9|M8 12.3l2.8 2.8L16.2 9.5",
  clock: "c:12,12,9|M12 7.5V12l3 2",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1|M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1",
  external: "M14 4h6v6|M20 4l-9 9|M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5",
  target: "c:12,12,8|c:12,12,3|M12 2v3|M12 19v3|M2 12h3|M19 12h3",
  layers: "M12 3.5l9 4.8-9 4.8-9-4.8z|M3 12.4l9 4.8 9-4.8|M3 16.4l9 4.8 9-4.8",
  box: "M21 8l-9-5-9 5v8l9 5 9-5z|M3 8l9 5 9-5|M12 13v8",
  flame: "M12 21c-3.9 0-6.5-2.7-6.5-6.2 0-3.8 3-5.7 3.9-9.3.3-1.3 1.8-1.8 2.6-.8 1.1 1.4 1.6 3 1.7 4.4.9-.5 1.5-1.4 1.8-2.3.3-.9 1.5-1.1 2 0 1 1.9 1.5 4 1.5 6 0 5-3.1 8.2-7 8.2z|M12 21c-1.6 0-2.8-1.2-2.8-2.8 0-1.8 1.4-2.6 2.2-4 .2-.4.8-.4 1 0 .9 1.4 2.4 2.4 2.4 4 0 1.6-1.2 2.8-2.8 2.8z",
  graph: "c:5,6,2|c:19,6,2|c:12,18,2.5|c:12,9,1.6|M6.8 7l3.8 1.4|M17.2 7l-3.8 1.4|M12 10.6v4.9",
  bug: "r:7,7.5,10,13,5|M12 11v9|M7 13H3.5|M20.5 13H17|M7.5 9L5 6.5|M16.5 9L19 6.5|M7.2 17.5L4.5 20|M16.8 17.5l2.7 2.5|M9 7.5a3 3 0 0 1 6 0",
  wand: "M4 20L15 9|M13.5 7.5l3 3|M17 3v3|M15.5 4.5h3|M20 8.5v2|M19 9.5h2|M8.5 4v2|M7.5 5h2",
  sparkles: "M12 3.5l1.9 5.1L19 10.5l-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z|M18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  offline: "M3 3l18 18|M8.5 16.5a5 5 0 0 1 7 0|M5 12.9a10 10 0 0 1 3.9-2.5|M12.6 9.5A10 10 0 0 1 19 12.9|M1.5 9.5A15 15 0 0 1 6 6.6|M11 4.5a15 15 0 0 1 11.5 5|f:c:12,19.8,1.2",
  gauge: "M4.6 18.5a9 9 0 1 1 14.8 0|M12 13.5l3.8-3.8|f:c:12,13.5,1.6",
  cpu: "r:6,6,12,12,2|r:9.5,9.5,5,5,1|M9 2.5V6|M15 2.5V6|M9 18v3.5|M15 18v3.5|M2.5 9H6|M2.5 15H6|M18 9h3.5|M18 15h3.5",
  list: "M9 6h11|M9 12h11|M9 18h11|f:c:4.5,6,1.2|f:c:4.5,12,1.2|f:c:4.5,18,1.2",
  tree: "M5 4v13a2 2 0 0 0 2 2h3|M5 9h5|f:r:12,6.5,8,5,1.5|f:r:12,16.5,8,5,1.5",
  grid: "r:4,4,7,7,1.5|r:13,4,7,7,1.5|r:4,13,7,7,1.5|r:13,13,7,7,1.5",
  history: "M3.5 12a8.5 8.5 0 1 0 2.5-6|M3 3.5V8h4.5|M12 8v4l3 2",
  bookmark: "M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.5L5.5 21V4.5a1 1 0 0 1 1-1z",
  save: "M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5z|M8 3.5V8h7V3.5|r:7.5,13,9,7.5,1",
  undo: "M9 14L4 9l5-5|M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5|M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z|M13.5 6.5l4 4",
  hash: "M4 9h16|M4 15h16|M10 3.5L8 20.5|M16 3.5l-2 17",
  type: "M5 7V5h14v2|M12 5v14|M9 19h6",
  image: "r:3.5,4.5,17,15,2|f:c:9,9.5,1.6|M20.5 15.5l-5-5-9.5 9",
  cursor: "M5 3.5l13 7.1-5.6 1.5-2.6 5.4z|M12.4 12.1l5.1 6.4",
  lock: "r:5,10.5,14,10,2|M8 10.5V7.5a4 4 0 0 1 8 0v3",
  unlock: "r:5,10.5,14,10,2|M8 10.5V7.5a4 4 0 0 1 7.7-1.5",
  key: "c:8,15,4.5|M11.2 11.8L20 3|M16.5 6.5l2.5 2.5|M14 9l2 2",
  cookie: "M12 3a9 9 0 1 0 9 9 3.5 3.5 0 0 1-4-3.5A3.5 3.5 0 0 1 13.5 5 2 2 0 0 1 12 3z|f:c:8.5,10,1.1|f:c:11,15.5,1.1|f:c:15.5,14,1.1",
  globe: "c:12,12,9|M3 12h18|M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  server: "r:3.5,4,17,7,2|r:3.5,13,17,7,2|f:c:7.5,7.5,1.1|f:c:7.5,16.5,1.1",
  send: "M21 3L10.5 13.5|M21 3l-6.5 18-4-7.5-7.5-4z",
  user: "c:12,8,4|M4.5 20.5a7.5 7.5 0 0 1 15 0",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z",
  contrast: "c:12,12,9|f:M12 3a9 9 0 0 1 0 18z",
  droplet: "M12 3.5s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.5 12 3.5 12 3.5z",
  ruler: "M3.5 16.5L16.5 3.5l4 4-13 13z|M7.5 12.5l2 2|M10.5 9.5l2 2|M13.5 6.5l2 2",
  diff: "c:6,6,2.5|c:18,18,2.5|M13 6h3a2 2 0 0 1 2 2v7.5|M11 18H8a2 2 0 0 1-2-2V8.5|M15.5 3.5L13 6l2.5 2.5|M8.5 15.5L11 18l-2.5 2.5",
  file: "M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z|M14 3.5v5h5",
  folder: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  puzzle: "M10 4.5a2 2 0 0 1 4 0V6h3.5a1 1 0 0 1 1 1v3.5H20a2 2 0 0 1 0 4h-1.5V18a1 1 0 0 1-1 1H14v-1.5a2 2 0 0 0-4 0V19H6.5a1 1 0 0 1-1-1v-3.5H7a2 2 0 0 0 0-4H5.5V7a1 1 0 0 1 1-1H10z",
  live: "c:12,12,2.5|M7.8 16.2a6 6 0 0 1 0-8.4|M16.2 7.8a6 6 0 0 1 0 8.4|M4.9 19.1a10 10 0 0 1 0-14.2|M19.1 4.9a10 10 0 0 1 0 14.2",
  camera: "M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z|c:12,13,3.5",
  dice: "r:4,4,16,16,3.5|f:c:8.5,8.5,1.3|f:c:15.5,8.5,1.3|f:c:12,12,1.3|f:c:8.5,15.5,1.3|f:c:15.5,15.5,1.3",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  zap: "M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z",
  split: "r:3.5,4.5,17,15,2|M12 4.5v15",
  maximize: "M4 9V4h5|M15 4h5v5|M20 15v5h-5|M9 20H4v-5",
  minimize: "M9 4v5H4|M20 9h-5V4|M15 20v-5h5|M4 15h5v5",
  panel: "r:3.5,4.5,17,15,2|M3.5 9h17",
  dot: "f:c:12,12,3",
  move: "M12 3v18|M3 12h18|M9 5.5l3-2.5 3 2.5|M9 18.5l3 2.5 3-2.5|M5.5 9L3 12l2.5 3|M18.5 9l2.5 3-2.5 3",
  mail: "r:3,5,18,14,2|M3.5 6l8.5 7 8.5-7",
  inbox: "M4 13.5l2-8a1.5 1.5 0 0 1 1.5-1h9a1.5 1.5 0 0 1 1.5 1l2 8V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z|M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20",
  scan: "M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8|M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8|M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16|M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16|M4 12h16",
  focus: "c:12,12,3|M3.5 8V5a1.5 1.5 0 0 1 1.5-1.5h3|M16 3.5h3A1.5 1.5 0 0 1 20.5 5v3|M20.5 16v3a1.5 1.5 0 0 1-1.5 1.5h-3|M8 20.5H5A1.5 1.5 0 0 1 3.5 19v-3",
  heading: "M6 4v16|M18 4v16|M6 12h12",
  landmark: "M3.5 20.5h17|M5.5 17V10|M10 17V10|M14 17V10|M18.5 17V10|M3 8l9-4.5L21 8z",
  tabOrder: "M4 7h8|M8 3.5L12 7l-4 3.5|M20 17h-8|M16 13.5L12 17l4 3.5",
  vision: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z|f:M12 9a3 3 0 0 1 0 6z|c:12,12,3",
  code: "M8 7l-5 5 5 5|M16 7l5 5-5 5",
  brackets: "M8 4H5v16h3|M16 4h3v16h-3",
  replay: "M3.5 12a8.5 8.5 0 1 0 2.5-6|M3 3.5V8h4.5|f:M10.5 9.2v5.6a.4.4 0 0 0 .6.4l4.3-2.8a.4.4 0 0 0 0-.7l-4.3-2.8a.4.4 0 0 0-.6.3z",
  assert: "r:4,4,16,16,3|M8 12.3l2.8 2.8L16.2 9.5",
  wait: "M7 3.5h10|M7 20.5h10|M8 3.5c0 4 8 4.5 8 8.5s-8 4.5-8 8.5|M16 3.5c0 4-8 4.5-8 8.5s8 4.5 8 8.5",
  keyboardKey: "r:4,4,16,16,3|M9 12h6",
  scenario: "M4 5.5h16|M4 12h10|M4 18.5h7|M17.5 14.5l3.5 2.5-3.5 2.5z",
  tag: "M3.5 11.6V4.5a1 1 0 0 1 1-1h7.1a1 1 0 0 1 .7.3l8.4 8.4a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0l-8.4-8.4a1 1 0 0 1-.3-.7z|f:c:8,8,1.5",
} as const;

export type IconName = keyof typeof ICONS;

interface ShapeSpec {
  tag: "path" | "circle" | "rect";
  attrs: Record<string, string>;
  filled: boolean;
}

const parsed = new Map<string, ShapeSpec[]>();

function parseShapes(source: string): ShapeSpec[] {
  const cached = parsed.get(source);
  if (cached) return cached;
  const shapes: ShapeSpec[] = [];
  for (let raw of source.split("|")) {
    let filled = false;
    if (raw.startsWith("f:")) {
      filled = true;
      raw = raw.slice(2);
    }
    if (raw.startsWith("c:")) {
      const [cx, cy, r] = raw.slice(2).split(",");
      shapes.push({ tag: "circle", attrs: { cx: cx!, cy: cy!, r: r! }, filled });
    } else if (raw.startsWith("r:")) {
      const [x, y, width, height, rx] = raw.slice(2).split(",");
      shapes.push({ tag: "rect", attrs: { x: x!, y: y!, width: width!, height: height!, rx: rx ?? "0" }, filled });
    } else {
      shapes.push({ tag: "path", attrs: { d: raw }, filled });
    }
  }
  parsed.set(source, shapes);
  return shapes;
}

/**
 * An icon as a vnode. Decorative by default (`aria-hidden`); pass `label` for
 * a standalone icon that must be announced.
 */
export function icon(name: IconName, options: { size?: number; label?: string; className?: string } = {}): VElement {
  const size = options.size ?? 16;
  const shapes = parseShapes(ICONS[name]);
  return h(
    "svg",
    {
      class: `ic ${options.className ?? ""}`,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.75",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": options.label ? undefined : "true",
      role: options.label ? "img" : undefined,
      "aria-label": options.label,
      focusable: "false",
    },
    ...shapes.map((shape) => h(shape.tag, shape.filled ? { ...shape.attrs, fill: "currentColor", stroke: "none" } : shape.attrs)),
  );
}

/** Whether `name` is a known icon (for data-driven icon choices). */
export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

/**
 * The Aktion mark — an "A" whose right stroke becomes a rising arrow — in the
 * brand gradient. Each call gets its own gradient id: two marks in one shadow
 * root (the titlebar and the launcher) must not fight over one definition.
 */
let markSeq = 0;
export function logoMark(size = 18): VElement {
  const id = `dt-mark-${(markSeq += 1)}`;
  return h(
    "svg",
    { class: "dt-mark", width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", focusable: "false" },
    h("defs", {},
      h("linearGradient", { id, x1: "3", y1: "21", x2: "21", y2: "3", gradientUnits: "userSpaceOnUse" },
        h("stop", { offset: "0", "stop-color": "#6366f1" }),
        h("stop", { offset: "0.55", "stop-color": "#7c6cff" }),
        h("stop", { offset: "1", "stop-color": "#38bdf8" }))),
    h("path", {
      d: "M3.8 20.2L10.3 5.2c.6-1.3 2.3-1.3 2.9 0l2 4.4",
      stroke: `url(#${id})`, "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round",
    }),
    h("path", {
      d: "M8.2 15.6L19.6 5.4",
      stroke: `url(#${id})`, "stroke-width": "3", "stroke-linecap": "round",
    }),
    h("path", {
      d: "M13.8 4.9h6.1v6.1",
      stroke: `url(#${id})`, "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round",
    }),
  );
}
