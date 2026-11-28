/* =========================================================
   아트스캔 ArtScan — 온라인 미술 감별소 MVP (프로토타입)
   정적 웹앱 · data.js 의 샘플 데이터 사용
   ========================================================= */
(function () {
  "use strict";

  const D = window.ARTDATA;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /* ---------------- formatting ---------------- */
  function wonNum(n) {
    n = Math.round(n);
    if (n >= 100000000) {
      const v = n / 100000000;
      return (Math.round(v * 10) / 10).toLocaleString("ko-KR") + "억";
    }
    if (n >= 10000) return Math.round(n / 10000).toLocaleString("ko-KR") + "만";
    return n.toLocaleString("ko-KR");
  }
  function won(n) { return wonNum(n) + " 원"; }
  function range(low, high) { return wonNum(low) + " ~ " + wonNum(high) + " 원"; }
  function pct(n) { return (Math.round(n * 10) / 10) + "%"; }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function dateStr(d) {
    d = d || new Date();
    return d.getFullYear() + "." + pad2(d.getMonth() + 1) + "." + pad2(d.getDate());
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function todayISO() { return dateStr(new Date()); }

  /* =========================================================
     QR 코드 인코더 (byte 모드 · 오류정정 M · 버전 1~6)
     - 순수 JS, 외부 라이브러리 없음
     ========================================================= */
  const QR = (function () {
    const BLOCKS = {
      M: {
        1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0],
        4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0]
      },
      L: {
        1: [7, 1, 19, 0, 0], 2: [10, 1, 34, 0, 0], 3: [15, 1, 55, 0, 0],
        4: [20, 1, 80, 0, 0], 5: [26, 1, 108, 0, 0], 6: [18, 2, 68, 0, 0]
      }
    };
    const ECL = { L: 1, M: 0, Q: 3, H: 2 };

    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    (function () {
      let x = 1;
      for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
      }
      for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    })();
    function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

    function genPoly(n) {
      let p = [1];
      for (let i = 0; i < n; i++) {
        const next = new Array(p.length + 1).fill(0);
        for (let j = 0; j < p.length; j++) {
          next[j] ^= p[j];
          next[j + 1] ^= mul(p[j], EXP[i]);
        }
        p = next;
      }
      return p;
    }
    function rsEncode(data, ecLen) {
      const gen = genPoly(ecLen);
      const res = new Uint8Array(data.length + ecLen);
      res.set(data, 0);
      for (let i = 0; i < data.length; i++) {
        const f = res[i];
        if (f !== 0) {
          for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], f);
        }
      }
      return res.slice(data.length);
    }

    function dataCodewords(bytes, version, level) {
      const b = BLOCKS[level][version];
      const totalData = b[1] * b[2] + b[3] * b[4];
      const bits = [];
      const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
      push(4, 4);
      push(bytes.length, 8);
      for (let i = 0; i < bytes.length; i++) push(bytes[i], 8);
      const cap = totalData * 8;
      for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
      while (bits.length % 8 !== 0) bits.push(0);
      const cw = [];
      for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
        cw.push(v);
      }
      let p = 0;
      while (cw.length < totalData) {
        cw.push(p % 2 === 0 ? 0xec : 0x11);
        p++;
      }
      return cw;
    }

    function interleave(data, version, level) {
      const b = BLOCKS[level][version];
      const ecLen = b[0], n1 = b[1], d1 = b[2], n2 = b[3], d2 = b[4];
      const blocks = [];
      let idx = 0;
      for (let i = 0; i < n1; i++) { blocks.push({ data: data.slice(idx, idx + d1) }); idx += d1; }
      for (let i = 0; i < n2; i++) { blocks.push({ data: data.slice(idx, idx + d2) }); idx += d2; }
      blocks.forEach(function (bl) { bl.ec = rsEncode(bl.data, ecLen); });
      const out = [];
      const maxData = Math.max(d1, d2);
      for (let i = 0; i < maxData; i++) {
        for (let k = 0; k < blocks.length; k++) if (i < blocks[k].data.length) out.push(blocks[k].data[i]);
      }
      for (let i = 0; i < ecLen; i++) {
        for (let k = 0; k < blocks.length; k++) out.push(blocks[k].ec[i]);
      }
      return out;
    }

    function formatBits(level, mask) {
      const data = (ECL[level] << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      return ((data << 10) | rem) ^ 0x5412;
    }

    function build(version, level, codewords, mask) {
      const size = 17 + version * 4;
      const mod = [], fn = [];
      for (let i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
      function set(r, c, v) { mod[r][c] = !!v; fn[r][c] = true; }

      function finder(r0, c0) {
        for (let dr = -1; dr <= 7; dr++) {
          for (let dc = -1; dc <= 7; dc++) {
            const r = r0 + dr, c = c0 + dc;
            if (r < 0 || r >= size || c < 0 || c >= size) continue;
            const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
            set(r, c, dist === 3 || dist <= 1);
          }
        }
      }
      finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

      for (let i = 8; i < size - 8; i++) {
        set(6, i, i % 2 === 0);
        set(i, 6, i % 2 === 0);
      }

      if (version >= 2) {
        const pos = [6, 4 * version + 10];
        for (let a = 0; a < pos.length; a++) {
          for (let b = 0; b < pos.length; b++) {
            const r = pos[a], c = pos[b];
            const overlap = (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
            if (overlap) continue;
            for (let dr = -2; dr <= 2; dr++) {
              for (let dc = -2; dc <= 2; dc++) {
                set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
              }
            }
          }
        }
      }

      // reserve format info areas
      const fb = formatBits(level, mask);
      const bit = (x, i) => ((x >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(i, 8, bit(fb, i));
      set(7, 8, bit(fb, 6));
      set(8, 8, bit(fb, 7));
      set(8, 7, bit(fb, 8));
      for (let i = 9; i < 15; i++) set(8, 14 - i, bit(fb, i));
      for (let i = 0; i < 8; i++) set(8, size - 1 - i, bit(fb, i));
      for (let i = 8; i < 15; i++) set(size - 15 + i, 8, bit(fb, i));
      set(size - 8, 8, true);

      // data placement
      let bi = 0;
      const totalBits = codewords.length * 8;
      for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
          for (let j = 0; j < 2; j++) {
            const col = right - j;
            const upward = ((right + 1) & 2) === 0;
            const row = upward ? size - 1 - vert : vert;
            if (!fn[row][col] && bi < totalBits) {
              mod[row][col] = ((codewords[bi >> 3] >>> (7 - (bi & 7))) & 1) !== 0;
              bi++;
            }
          }
        }
      }

      // mask
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (fn[r][c]) continue;
          let inv = false;
          switch (mask) {
            case 0: inv = (r + c) % 2 === 0; break;
            case 1: inv = r % 2 === 0; break;
            case 2: inv = c % 3 === 0; break;
            case 3: inv = (r + c) % 3 === 0; break;
            case 4: inv = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
            case 5: inv = ((r * c) % 2) + ((r * c) % 3) === 0; break;
            case 6: inv = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
            case 7: inv = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
          }
          if (inv) mod[r][c] = !mod[r][c];
        }
      }
      return mod;
    }

    function penalty(m) {
      const size = m.length;
      let score = 0;
      // rule 1
      for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 1; c < size; c++) {
          if (m[r][c] === m[r][c - 1]) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
      for (let c = 0; c < size; c++) {
        let run = 1;
        for (let r = 1; r < size; r++) {
          if (m[r][c] === m[r - 1][c]) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
      // rule 2
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const v = m[r][c];
          if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
        }
      }
      // rule 3
      const patA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
      const patB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      function match(get, start) {
        let a = true, b = true;
        for (let i = 0; i < 11; i++) {
          const v = get(start + i) ? 1 : 0;
          if (v !== patA[i]) a = false;
          if (v !== patB[i]) b = false;
          if (!a && !b) return false;
        }
        return a || b;
      }
      for (let r = 0; r < size; r++) {
        for (let c = 0; c <= size - 11; c++) {
          if (match(function (i) { return m[r][i]; }, c)) score += 40;
        }
      }
      for (let c = 0; c < size; c++) {
        for (let r = 0; r <= size - 11; r++) {
          if (match(function (i) { return m[i][c]; }, r)) score += 40;
        }
      }
      // rule 4
      let dark = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
      const total = size * size;
      const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      score += Math.max(0, k) * 10;
      return score;
    }

    return {
      encode: function (text, level) {
        level = level || "M";
        const bytes = new TextEncoder().encode(text);
        let version = 0;
        for (let v = 1; v <= 6; v++) {
          const b = BLOCKS[level][v];
          const cap = (b[1] * b[2] + b[3] * b[4]) * 8;
          if (4 + 8 + bytes.length * 8 <= cap) { version = v; break; }
        }
        if (!version) throw new Error("QR payload too long: " + bytes.length + " bytes");
        const cw = dataCodewords(bytes, version, level);
        const all = interleave(cw, version, level);
        let best = null, bestScore = Infinity, bestMask = 0;
        for (let mask = 0; mask < 8; mask++) {
          const m = build(version, level, all, mask);
          const p = penalty(m);
          if (p < bestScore) { bestScore = p; best = m; bestMask = mask; }
        }
        return { size: best.length, modules: best, version: version, mask: bestMask };
      }
    };
  })();

  function drawQR(ctx, text, x, y, size, dark, light) {
    const qr = QR.encode(text, "M");
    const n = qr.size;
    const quiet = 4;
    const total = n + quiet * 2;
    const cell = size / total;
    ctx.fillStyle = light || "#ffffff";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = dark || "#17140f";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell),
            Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
    return qr;
  }

  /* =========================================================
     샘플 작품 일러스트 (SVG → data URL)
     ========================================================= */
  function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function svgURL(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  const SVG_HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1100" width="900" height="1100">';
  const GRAIN = '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3"/>' +
    '<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer></filter>';

  function dotsSVG(seed) {
    const rand = rng(seed || 7);
    let s = SVG_HEAD + '<defs>' + GRAIN +
      '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe6d2"/><stop offset="1" stop-color="#e3d6bd"/></linearGradient></defs>';
    s += '<rect width="900" height="1100" fill="url(#bg)"/>';
    for (let i = 0; i < 5; i++) {
      s += '<rect x="' + (40 + i * 18) + '" y="0" width="2" height="1100" fill="#d9c9ab" opacity="0.45"/>';
    }
    for (let i = 0; i < 130; i++) {
      const x = 90 + rand() * 720;
      const y = 120 + rand() * 760;
      const r = 3 + rand() * 9;
      const blues = ["#2c4f7c", "#3a6ea5", "#1f3a5f", "#5b8bb8", "#22456b"];
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) +
        '" fill="' + blues[Math.floor(rand() * blues.length)] + '" opacity="' + (0.55 + rand() * 0.4).toFixed(2) + '"/>';
    }
    for (let i = 0; i < 22; i++) {
      const x = 120 + rand() * 660, y = 160 + rand() * 700;
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (1 + rand() * 2).toFixed(1) + '" fill="#f2ead6"/>';
    }
    s += '<path d="M120 940 C 240 920 320 950 400 936" stroke="#33465c" stroke-width="2" fill="none" opacity="0.5"/>';
    s += '<rect x="120" y="972" width="66" height="66" rx="4" fill="#b02a24" opacity="0.9"/>';
    s += '<text x="153" y="1017" font-family="serif" font-size="36" fill="#f7e9d4" text-anchor="middle">點</text>';
    s += '<rect width="900" height="1100" filter="url(#g)"/>';
    return s + "</svg>";
  }

  function figureSVG() {
    let s = SVG_HEAD + '<defs>' + GRAIN +
      '<linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6d8bf"/><stop offset="1" stop-color="#cdbb9b"/></linearGradient></defs>';
    s += '<rect width="900" height="1100" fill="url(#fg)"/>';
    for (let i = 0; i < 900; i += 4) {
      s += '<rect x="0" y="' + i + '" width="900" height="2" fill="#b8a482" opacity="0.08"/>';
    }
    s += '<rect x="180" y="330" width="120" height="420" rx="10" fill="#6b5236"/>';
    s += '<rect x="330" y="270" width="150" height="480" rx="12" fill="#4a3a28"/>';
    s += '<rect x="520" y="380" width="120" height="370" rx="10" fill="#7d6242"/>';
    s += '<circle cx="395" cy="220" r="52" fill="#5b4630"/>';
    s += '<path d="M180 760 h470" stroke="#3d2f20" stroke-width="8" opacity="0.6"/>';
    s += '<rect x="640" y="880" width="64" height="64" rx="4" fill="#b02a24" opacity="0.85"/>';
    s += '<text x="672" y="923" font-family="serif" font-size="34" fill="#f7e9d4" text-anchor="middle">水</text>';
    s += '<rect width="900" height="1100" filter="url(#g)"/>';
    return s + "</svg>";
  }

  function bullSVG() {
    let s = SVG_HEAD + '<defs>' + GRAIN + '</defs>' + '<rect width="900" height="1100" fill="#e8dfcc"/>';
    s += '<rect x="60" y="60" width="780" height="980" fill="#ded3bb" opacity="0.5"/>';
    s += '<g fill="none" stroke="#3c3125" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">';
    s += '<path d="M250 560 C 300 470 380 440 470 455 C 560 470 620 520 660 600 C 690 665 660 720 600 730 C 540 740 500 700 470 665"/>';
    s += '<path d="M470 455 C 500 390 560 380 600 410 C 620 380 660 380 675 410"/>';
    s += '<path d="M300 560 C 270 640 300 700 370 720"/>';
    s += '<path d="M300 640 L 230 760"/><path d="M600 730 L 585 830"/><path d="M520 720 L 540 820"/>';
    s += '<circle cx="520" cy="500" r="9" fill="#3c3125"/>';
    s += "</g>";
    s += '<path d="M120 960 C 300 900 560 930 780 890" stroke="#b9a98c" stroke-width="4" fill="none"/>';
    s += '<rect x="700" y="960" width="70" height="70" rx="4" fill="#b02a24" opacity="0.85"/>';
    s += '<text x="735" y="1006" font-family="serif" font-size="34" fill="#f7e9d4" text-anchor="middle">仲</text>';
    s += '<rect width="900" height="1100" filter="url(#g)"/>';
    return s + "</svg>";
  }

  function colorfieldSVG() {
    let s = SVG_HEAD + '<defs><linearGradient id="cf" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#4b6b52"/><stop offset="0.55" stop-color="#2f4a3a"/><stop offset="1" stop-color="#1d332a"/></linearGradient>' +
      '<linearGradient id="cf2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8543f" stop-opacity="0.9"/><stop offset="1" stop-color="#8f2f24" stop-opacity="0.9"/></linearGradient>' + GRAIN + '</defs>';
    s += '<rect width="900" height="1100" fill="url(#cf)"/>';
    s += '<path d="M120 760 C 260 640 340 560 520 520 C 640 490 760 520 800 600 C 760 760 600 860 380 880 C 240 890 160 840 120 760 Z" fill="url(#cf2)" opacity="0.85"/>';
    s += '<path d="M140 420 C 260 330 420 320 500 380" stroke="#e6d3ac" stroke-width="6" fill="none" opacity="0.6"/>';
    s += '<rect x="120" y="940" width="62" height="62" rx="4" fill="#b02a24" opacity="0.9"/>';
    s += '<text x="151" y="983" font-family="serif" font-size="32" fill="#f7e9d4" text-anchor="middle">鏡</text>';
    s += '<rect width="900" height="1100" filter="url(#g)"/>';
    return s + "</svg>";
  }

  function printSVG() {
    let s = SVG_HEAD + '<rect width="900" height="1100" fill="#f4efe2"/>';
    s += '<rect x="110" y="110" width="680" height="820" fill="none" stroke="#2b2b2b" stroke-width="4"/>';
    const rand = rng(31);
    for (let i = 0; i < 9; i++) {
      const y = 200 + i * 78;
      const w = 120 + rand() * 420;
      s += '<rect x="190" y="' + y + '" width="' + w.toFixed(0) + '" height="' + (4 + rand() * 10).toFixed(0) + '" fill="#242424" opacity="' + (0.5 + rand() * 0.4).toFixed(2) + '"/>';
    }
    s += '<circle cx="600" cy="330" r="70" fill="none" stroke="#242424" stroke-width="3"/>';
    s += '<text x="190" y="1010" font-family="monospace" font-size="26" fill="#3a3a3a">12 / 50   Lee Ufan 1979</text>';
    return s + "</svg>";
  }

  function celadonPath(variant) {
    if (variant === "left" || variant === "right") {
      return "M 400 110 L 500 110 C 505 160 505 210 512 260 C 600 310 640 390 640 520 C 640 720 570 840 450 860 C 330 840 260 720 260 520 C 260 390 300 310 388 260 C 395 210 395 160 400 110 Z";
    }
    return "M 405 108 L 495 108 C 500 152 500 204 508 252 C 616 300 700 382 700 522 C 700 726 604 844 450 862 C 296 844 200 726 200 522 C 200 382 284 300 392 252 C 400 204 400 152 405 108 Z";
  }

  function celadonSVG(view) {
    const seed = view === "back" ? 11 : view === "left" ? 21 : view === "right" ? 33 : 5;
    let s = SVG_HEAD + '<defs>' + GRAIN +
      '<linearGradient id="cel" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#5f7f71"/><stop offset="0.28" stop-color="#9cb8a8"/>' +
      '<stop offset="0.55" stop-color="#b9d0c2"/><stop offset="0.8" stop-color="#7e9d8d"/><stop offset="1" stop-color="#557264"/>' +
      '</linearGradient></defs>';
    s += '<rect width="900" height="1100" fill="#e9e4d8"/>';
    s += '<rect x="0" y="880" width="900" height="220" fill="#dcd5c4"/>';
    s += '<ellipse cx="450" cy="905" rx="250" ry="34" fill="#c9c1ae" opacity="0.7"/>';

    if (view === "top") {
      s += '<ellipse cx="450" cy="560" rx="290" ry="290" fill="url(#cel)"/>';
      s += '<ellipse cx="450" cy="560" rx="150" ry="150" fill="#3d5348"/>';
      s += '<ellipse cx="450" cy="560" rx="128" ry="128" fill="#2c3d35"/>';
      s += '<ellipse cx="450" cy="548" rx="60" ry="52" fill="#4a6155" opacity="0.6"/>';
      s += '<ellipse cx="450" cy="560" rx="290" ry="290" fill="none" stroke="#7c9889" stroke-width="6"/>';
      s += '<rect width="900" height="1100" filter="url(#g)"/>';
      return s + "</svg>";
    }
    if (view === "foot") {
      s += '<circle cx="450" cy="540" r="250" fill="#8aa696"/>';
      s += '<circle cx="450" cy="540" r="196" fill="#c6b99c"/>';
      s += '<circle cx="450" cy="540" r="182" fill="#d8cbb0"/>';
      s += '<circle cx="450" cy="540" r="120" fill="#cbbda0" opacity="0.8"/>';
      s += '<text x="450" y="556" font-family="serif" font-size="64" fill="#8a6a3f" text-anchor="middle">根瀅</text>';
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        s += '<circle cx="' + (450 + Math.cos(a) * 205).toFixed(1) + '" cy="' + (540 + Math.sin(a) * 205).toFixed(1) + '" r="3.5" fill="#b9ab8c"/>';
      }
      s += '<rect width="900" height="1100" filter="url(#g)"/>';
      return s + "</svg>";
    }

    const p = celadonPath(view);
    s += '<path d="' + p + '" fill="url(#cel)"/>';
    s += '<path d="' + p + '" fill="none" stroke="#4f6a5d" stroke-width="4" opacity="0.55"/>';

    if (view === "front") {
      s += '<g opacity="0.92">';
      for (let i = 0; i < 3; i++) {
        const cy = 420 + i * 130;
        s += '<path d="M330 ' + cy + ' C 380 ' + (cy - 55) + ' 440 ' + (cy - 50) + ' 450 ' + cy + ' C 460 ' + (cy + 50) + ' 400 ' + (cy + 55) + ' 330 ' + cy + ' Z" fill="#f3efe0" opacity="0.9"/>';
        s += '<path d="M470 ' + cy + ' C 520 ' + (cy - 55) + ' 580 ' + (cy - 50) + ' 590 ' + cy + ' C 580 ' + (cy + 50) + ' 520 ' + (cy + 55) + ' 470 ' + cy + ' Z" fill="#f3efe0" opacity="0.9"/>';
        s += '<circle cx="450" cy="' + (cy + 4) + '" r="13" fill="#2f3d34"/>';
      }
      s += '<path d="M300 720 C 360 690 420 700 450 730 C 480 700 540 690 600 720" stroke="#f3efe0" stroke-width="9" fill="none" opacity="0.85"/>';
      s += "</g>";
    } else if (view === "back") {
      s += '<ellipse cx="450" cy="560" rx="120" ry="220" fill="#cfe0d4" opacity="0.35"/>';
      s += '<path d="M380 300 C 420 420 420 660 400 800" stroke="#dcebe0" stroke-width="18" fill="none" opacity="0.35"/>';
    } else {
      s += '<path d="M420 250 C 470 420 470 660 440 830" stroke="#d5e4d9" stroke-width="14" fill="none" opacity="0.35"/>';
    }
    s += '<path d="M400 120 C 450 150 500 150 505 120" stroke="#4f6a5d" stroke-width="6" fill="none" opacity="0.6"/>';
    s += '<rect width="900" height="1100" filter="url(#g)"/>';
    return s + "</svg>";
  }

  function buncheongSVG() {
    let s = SVG_HEAD + '<defs>' + GRAIN +
      '<linearGradient id="bc" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#8a8f83"/><stop offset="0.5" stop-color="#c9cbbd"/><stop offset="1" stop-color="#8f948a"/></linearGradient></defs>';
    s += '<rect width="900" height="1100" fill="#e8e2d5"/>';
    s += '<path d="M395 150 L 505 150 C 510 220 512 280 520 330 C 640 380 720 470 720 620 C 720 790 610 880 450 890 C 290 880 180 790 180 620 C 180 470 260 380 380 330 C 388 280 390 220 395 150 Z" fill="url(#bc)"/>';
    s += '<g opacity="0.9">';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      s += '<circle cx="' + (450 + Math.cos(a) * 120).toFixed(0) + '" cy="' + (560 + Math.sin(a) * 100).toFixed(0) + '" r="38" fill="#f2eee2" opacity="0.85"/>';
      s += '<circle cx="' + (450 + Math.cos(a) * 120).toFixed(0) + '" cy="' + (560 + Math.sin(a) * 100).toFixed(0) + '" r="16" fill="#6f6f5f"/>';
    }
    s += '<circle cx="450" cy="560" r="46" fill="#f2eee2" opacity="0.95"/><circle cx="450" cy="560" r="20" fill="#6f6f5f"/>';
    s += "</g>";
    s += '<rect width="900" height="1100" filter="url(#g)"/>';
    return s + "</svg>";
  }

  function sealDetailSVG() {
    let s = SVG_HEAD + '<defs>' + GRAIN +
      '<linearGradient id="pp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6efdf"/><stop offset="1" stop-color="#e9dfc8"/></linearGradient></defs>';
    s += '<rect width="900" height="1100" fill="url(#pp)"/>';
    for (let i = 0; i < 26; i++) {
      s += '<rect x="' + (40 + i * 32) + '" y="0" width="1" height="1100" fill="#d8cbb0" opacity="0.25"/>';
    }
    s += '<g stroke="#2c4462" stroke-linecap="round" fill="none">';
    s += '<path d="M180 640 C 250 590 300 700 350 630 C 400 560 450 690 520 620" stroke-width="9"/>';
    s += '<path d="M200 690 C 280 660 330 730 410 690" stroke-width="6" opacity="0.85"/>';
    s += '<path d="M560 682 h120" stroke-width="5" opacity="0.7"/>';
    s += '</g>';
    s += '<text x="560" y="730" font-family="monospace" font-size="30" fill="#3a4a5e">1973</text>';
    s += '<rect x="560" y="420" width="150" height="150" rx="6" fill="#b02a24"/>';
    s += '<rect x="574" y="434" width="122" height="122" rx="3" fill="none" stroke="#f5e6d2" stroke-width="3" opacity="0.7"/>';
    s += '<text x="635" y="490" font-family="serif" font-size="34" fill="#f8ead6" text-anchor="middle">樹</text>';
    s += '<text x="635" y="532" font-family="serif" font-size="34" fill="#f8ead6" text-anchor="middle">話</text>';
    s += '<text x="120" y="960" font-family="serif" font-size="26" fill="#8a7a5c">낙관 · 서명 클로즈업 (샘플)</text>';
    s += '<rect width="900" height="1100" filter="url(#g)"/>';
    return s + "</svg>";
  }

  function moonjarSVG() {
    let s = SVG_HEAD + '<defs>' + GRAIN +
      '<radialGradient id="mj" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#f2eee2"/><stop offset="1" stop-color="#d9D2c2"/></radialGradient></defs>';
    s += '<rect width="900" height="1100" fill="#e9e3d6"/>';
    s += '<ellipse cx="450" cy="900" rx="260" ry="40" fill="#cec6b4" opacity="0.7"/>';
    s += '<path d="M360 200 C 250 300 170 420 170 600 C 170 790 290 900 450 900 C 610 900 730 790 730 600 C 730 420 650 300 540 200 Z" fill="url(#mj)"/>';
    s += '<ellipse cx="450" cy="205" rx="92" ry="26" fill="#efeadd" stroke="#cfc6b3" stroke-width="5"/>';
    s += '<path d="M250 520 C 300 620 320 760 300 850" stroke="#ffffff" stroke-width="26" fill="none" opacity="0.35"/>';
    s += '<rect width="900" height="1100" filter="url(#g)"/>';
    return s + "</svg>";
  }

  const ART = {
    dots: function () { return svgURL(dotsSVG(7)); },
    figure: function () { return svgURL(figureSVG()); },
    bull: function () { return svgURL(bullSVG()); },
    colorfield: function () { return svgURL(colorfieldSVG()); },
    print: function () { return svgURL(printSVG()); },
    celadon: function () { return svgURL(celadonSVG("front")); },
    buncheong: function () { return svgURL(buncheongSVG()); },
    moonjar: function () { return svgURL(moonjarSVG()); }
  };
  function artImage(key) { return (ART[key] || ART.dots)(); }
  function ceramicShot(view) { return svgURL(celadonSVG(view)); }

  /* =========================================================
     state
     ========================================================= */
  const state = {
    genre: "painting",
    photos: {},
    artist: null,
    unknown: false,
    expertOpt: false,
    consent: false,
    scan: null,
    drafts: [],
    listings: [],
    sort: "recommended",
    settlements: [],
    bidEvents: {},
    toastTimer: null
  };

  function initData() {
    state.listings = D.LISTINGS.map(function (l) {
      const copy = JSON.parse(JSON.stringify(l));
      copy.estimateLow = copy.estimateLow || 0;
      copy.estimateHigh = copy.estimateHigh || 0;
      if (copy.type === "auction") {
        copy.endAt = Date.now() + (copy.endMinutes || 60) * 60000;
        copy.extensions = 0;
        copy.bidLog = [
          { amount: copy.startPrice, at: Date.now() - 40 * 60000, who: "입찰자 A" },
          { amount: copy.current, at: Date.now() - 12 * 60000, who: "입찰자 B" }
        ];
      }
      return copy;
    });
    state.listings.forEach(function (l) {
      if (l.opinion) {
        state.settlements.push({
          listingId: l.id, title: l.artist + " 《" + l.title + "》",
          expertId: l.opinion.expertId, date: l.opinion.adoptedAt, amount: 1000
        });
      }
    });
  }

  /* =========================================================
     tabs
     ========================================================= */
  function switchTab(name) {
    $$(".tab").forEach(function (b) {
      const on = b.getAttribute("data-tab") === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".panel").forEach(function (p) {
      const on = p.id === "panel-" + name;
      p.classList.toggle("active", on);
      if (on) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
    });
    if (name === "gallery") renderGallery();
    if (name === "db") renderDB();
    if (name === "expert") renderExpert();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* =========================================================
     scan · upload slots
     ========================================================= */
  const slotsEl = $("#uploadSlots");
  const scanBtn = $("#scanBtn");
  const scanHint = $("#scanHint");

  function renderSlots() {
    const g = D.GENRES[state.genre];
    slotsEl.innerHTML = g.slots.map(function (s) {
      const photo = state.photos[s.key];
      const reqTag = s.req
        ? '<span class="slot-req">필수</span>'
        : '<span class="slot-req recommend">권장</span>';
      if (photo) {
        return '<div class="slot filled" data-slot="' + s.key + '">' +
          '<div class="slot-preview">' +
          '<img src="' + photo + '" alt="' + esc(s.name) + ' 업로드 이미지">' +
          '<span class="slot-tag">' + esc(s.name) + '</span>' +
          '<button type="button" class="slot-clear" data-clear="' + s.key + '" aria-label="' + esc(s.name) + ' 삭제">✕</button>' +
          '<span class="slot-check">촬영 완료</span>' +
          '</div></div>';
      }
      return '<label class="slot" data-slot="' + s.key + '">' +
        '<input type="file" accept="image/*" capture="environment" data-file="' + s.key + '" aria-label="' + esc(s.name) + ' 사진 선택">' +
        '<span class="slot-inner">' +
        '<span class="slot-icon">' + s.icon + '</span>' +
        '<span class="slot-name">' + esc(s.name) + ' ' + reqTag + '</span>' +
        '<span class="slot-desc">' + esc(s.desc) + '</span>' +
        '</span></label>';
    }).join("");
    updateScanState();
  }

  function updateScanState() {
    const g = D.GENRES[state.genre];
    const missing = g.slots.filter(function (s) { return s.req && !state.photos[s.key]; });
    const ready = missing.length === 0 && state.consent;
    scanBtn.disabled = !ready;
    if (ready) {
      scanHint.innerHTML = state.expertOpt
        ? "준비 완료 · 전문가 검토 의견(+10,000원)이 포함됩니다."
        : "준비 완료 · 스캔을 시작하세요.";
    } else if (!state.consent) {
      scanHint.textContent = "출처 확인·본인인증 동의에 체크하면 스캔할 수 있습니다.";
    } else {
      scanHint.textContent = "필수 사진 " + missing.length + "컷이 남았습니다: " + missing.map(function (s) { return s.name; }).join(", ");
    }
  }

  slotsEl.addEventListener("click", function (e) {
    const clear = e.target.closest("[data-clear]");
    if (clear) {
      e.preventDefault();
      e.stopPropagation();
      delete state.photos[clear.getAttribute("data-clear")];
      renderSlots();
    }
  });

  slotsEl.addEventListener("change", function (e) {
    const input = e.target.closest("input[type=file]");
    if (!input) return;
    const key = input.getAttribute("data-file");
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast("이미지 파일만 업로드할 수 있습니다."); return; }
    const reader = new FileReader();
    reader.onload = function () {
      state.photos[key] = reader.result;
      renderSlots();
    };
    reader.readAsDataURL(file);
  });

  $$("#genreSwitch .seg").forEach(function (b) {
    b.addEventListener("click", function () {
      state.genre = b.getAttribute("data-genre");
      $$("#genreSwitch .seg").forEach(function (x) { x.classList.toggle("active", x === b); });
      $("#genreHint").innerHTML = D.GENRES[state.genre].hint;
      state.photos = {};
      state.scan = null;
      $("#scanResult").hidden = true;
      renderSlots();
    });
  });

  $("#samplePainting").addEventListener("click", function () {
    state.genre = "painting";
    $$("#genreSwitch .seg").forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-genre") === "painting"); });
    $("#genreHint").innerHTML = D.GENRES.painting.hint;
    state.photos = {
      front: svgURL(dotsSVG(7)),
      seal: svgURL(sealDetailSVG())
    };
    state.artist = D.ARTISTS[0];
    state.unknown = false;
    renderSlots();
    renderChosen();
    $("#optExpert").checked = true; state.expertOpt = true;
    $("#optConsent").checked = true; state.consent = true;
    updateScanState();
    scanBtn.focus();
    toast("샘플1(근현대 회화)을 채웠습니다 · 바로 스캔해 보세요");
  });

  $("#sampleCeramic").addEventListener("click", function () {
    state.genre = "ceramic";
    $$("#genreSwitch .seg").forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-genre") === "ceramic"); });
    $("#genreHint").innerHTML = D.GENRES.ceramic.hint;
    state.photos = {
      front: ceramicShot("front"), back: ceramicShot("back"), left: ceramicShot("left"),
      right: ceramicShot("right"), top: ceramicShot("top"), foot: ceramicShot("foot")
    };
    state.artist = D.ARTISTS[7];
    state.unknown = false;
    renderSlots();
    renderChosen();
    $("#optExpert").checked = true; state.expertOpt = true;
    $("#optConsent").checked = true; state.consent = true;
    updateScanState();
    scanBtn.focus();
    toast("샘플2(고려청자 매병)을 채웠습니다 · 바로 스캔해 보세요");
  });

  /* ---------- artist autocomplete ---------- */
  const artistInput = $("#artistInput");
  const suggestEl = $("#artistSuggest");
  const chosenEl = $("#artistChosen");
  let suggestIndex = -1;

  function artistMeta(a) {
    const life = a.died ? a.born + "–" + a.died : a.born + "–";
    return life + " · " + a.field;
  }
  function filterArtists(q) {
    q = q.trim().toLowerCase();
    if (!q) return D.ARTISTS.slice(0, 10);
    return D.ARTISTS.filter(function (a) {
      const hay = [a.ko, a.en, a.hanja, a.field, String(a.born), a.aliases.join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    }).slice(0, 10);
  }
  function renderSuggest(list) {
    if (!list.length) {
      suggestEl.innerHTML = '<li class="s-empty">일치하는 작가가 없습니다 · ‘작가 미상’으로 진행할 수 있습니다.</li>';
      suggestEl.hidden = false;
      return;
    }
    suggestEl.innerHTML = list.map(function (a, i) {
      return '<li role="option" data-artist="' + a.id + '" data-i="' + i + '" aria-selected="false">' +
        '<span><span class="s-name">' + esc(a.ko) + '</span> <span class="s-meta">' + esc(a.en) + '</span></span>' +
        '<span class="s-meta">' + esc(artistMeta(a)) + '</span></li>';
    }).join("");
    suggestEl.hidden = false;
  }
  artistInput.addEventListener("input", function () {
    suggestIndex = -1;
    state.unknown = false;
    if (state.artist) { state.artist = null; renderChosen(); }
    renderSuggest(filterArtists(artistInput.value));
    updateScanState();
  });
  artistInput.addEventListener("focus", function () {
    renderSuggest(filterArtists(artistInput.value));
  });
  artistInput.addEventListener("keydown", function (e) {
    const items = $$("#artistSuggest li[data-artist]");
    if (!items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); suggestIndex = Math.min(items.length - 1, suggestIndex + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); suggestIndex = Math.max(0, suggestIndex - 1); }
    else if (e.key === "Enter" && suggestIndex >= 0) { e.preventDefault(); items[suggestIndex].click(); return; }
    else if (e.key === "Escape") { suggestEl.hidden = true; return; }
    else return;
    items.forEach(function (li, i) { li.classList.toggle("active", i === suggestIndex); });
  });
  suggestEl.addEventListener("mousedown", function (e) {
    const li = e.target.closest("li[data-artist]");
    if (!li) return;
    e.preventDefault();
    selectArtist(li.getAttribute("data-artist"));
  });
  artistInput.addEventListener("blur", function () {
    setTimeout(function () { suggestEl.hidden = true; }, 150);
  });

  function selectArtist(id) {
    const a = D.ARTISTS.filter(function (x) { return x.id === id; })[0];
    state.artist = a || null;
    state.unknown = false;
    artistInput.value = a ? a.ko : "";
    suggestEl.hidden = true;
    renderChosen();
    updateScanState();
  }
  function renderChosen() {
    if (state.unknown) {
      chosenEl.hidden = false;
      chosenEl.innerHTML = '<div><div class="ac-name">작가 미상</div><div class="ac-meta">이미지 기반 후보 탐색으로 진행 · 신뢰도 C(시세 산정 보류)</div></div>' +
        '<button type="button" id="clearArtist">변경</button>';
    } else if (state.artist) {
      const a = state.artist;
      chosenEl.hidden = false;
      chosenEl.innerHTML = '<div><div class="ac-name">' + esc(a.ko) + ' <span class="ac-meta">' + esc(a.en) + '</span></div>' +
        '<div class="ac-meta">' + esc(artistMeta(a)) + ' · 표본 ' + a.samples + '건 · ' + esc(a.medium) + '</div></div>' +
        '<button type="button" id="clearArtist">변경</button>';
    } else {
      chosenEl.hidden = true;
      chosenEl.innerHTML = "";
    }
    const cb = $("#clearArtist");
    if (cb) cb.addEventListener("click", function () {
      state.artist = null; state.unknown = false; artistInput.value = ""; renderChosen(); updateScanState(); artistInput.focus();
    });
  }

  $("#unknownArtist").addEventListener("click", function () {
    state.artist = null; state.unknown = true; artistInput.value = "";
    renderChosen(); updateScanState();
    toast("‘작가 미상’으로 진행합니다 · 시세는 산정 보류(C등급)됩니다");
  });

  $("#optExpert").addEventListener("change", function (e) { state.expertOpt = e.target.checked; updateScanState(); });
  $("#optConsent").addEventListener("change", function (e) { state.consent = e.target.checked; updateScanState(); });

  /* =========================================================
     scan 실행 · 리포트
     ========================================================= */
  function makeVerifyId() {
    const t = Date.now().toString(36).slice(-4).toUpperCase();
    const r = Math.random().toString(36).slice(2, 5).toUpperCase();
    return "AC-2026-" + t + r;
  }

  function comparablesFor(artist) {
    const base = artist.p50;
    const today = new Date();
    const rows = [
      { m: 0.86, house: "서울옥션", months: 2, size: "52 × 41 cm" },
      { m: 1.0, house: "케이옥션", months: 7, size: "45 × 38 cm" },
      { m: 1.19, house: "마이아트옥션", months: 14, size: "60 × 45 cm" }
    ];
    return rows.map(function (r) {
      const d = new Date(today.getFullYear(), today.getMonth() - r.months, Math.max(1, today.getDate() - 3));
      return {
        date: dateStr(d),
        house: r.house,
        title: artist.medium.split("·")[0] + " 연작 (유사 작품)",
        size: r.size,
        price: Math.round((base * r.m) / 10000) * 10000
      };
    });
  }

  function runScan() {
    const g = D.GENRES[state.genre];
    const artist = state.artist;
    scanBtn.disabled = true;
    scanBtn.textContent = "AI 판독 중…";
    scanHint.textContent = "사진 " + g.slots.filter(function (s) { return state.photos[s.key]; }).length + "장을 판독하고 유사 낙찰을 검색합니다.";

    setTimeout(function () {
      let conf = "C", low = 0, high = 0, mid = 0;
      if (artist) {
        conf = artist.samples >= 10 ? "A" : "B";
        const wobble = conf === "A" ? 0.2 : 0.35;
        mid = artist.p50;
        low = Math.round((mid * (1 - wobble)) / 10000) * 10000;
        high = Math.round((mid * (1 + wobble)) / 10000) * 10000;
      }
      const scan = {
        id: makeVerifyId(),
        at: new Date(),
        genre: state.genre,
        artistId: artist ? artist.id : null,
        artistName: artist ? artist.ko : "작가 미상",
        artistEn: artist ? artist.en : "",
        photos: Object.assign({}, state.photos),
        expertRequested: state.expertOpt,
        conf: conf,
        low: low, high: high, mid: mid,
        samples: artist ? artist.samples : 0,
        comparables: artist ? comparablesFor(artist) : [],
        checks: g.checks,
        opinion: null,
        opinionExpertId: state.expertOpt ? (state.genre === "painting" ? "E-01" : "E-02") : null,
        consent: state.consent
      };
      state.scan = scan;
      state.drafts.push(scan);

      // 유료 옵션: 샘플 전문가 소견 즉시 채택 (프로토타입 시연)
      if (scan.expertRequested && scan.opinionExpertId) {
        const ex = D.EXPERTS.filter(function (x) { return x.id === scan.opinionExpertId; })[0];
        const texts = {
          "E-01": "사진상 안료층과 화면 상태가 양호하며, 서명 필획은 동일 시기 후기 서명과 유사합니다. 다만 사진 판독 한계로 진위는 실물 2차 검증이 필요합니다.",
          "E-02": "유색과 상감 문양의 발색이 해당 계열 양식에 부합합니다. 굽 안쪽 명문과 접지면 마모는 실물 확인이 필요하며, 수리 흔적은 보이지 않습니다."
        };
        scan.opinion = {
          expertId: ex.id, name: ex.name, grade: gradeOf(ex).label,
          text: texts[ex.id], adoptedAt: todayISO()
        };
        state.settlements.push({
          listingId: scan.id, title: scan.artistName + " (스캔 리포트)",
          expertId: ex.id, date: todayISO(), amount: 1000
        });
      }

      renderResult();
      scanBtn.disabled = false;
      scanBtn.textContent = "다시 스캔";
      updateScanState();
      $("#scanResult").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("스캔 완료 · 참고 추정가 리포트가 생성되었습니다");
    }, 850);
  }
  scanBtn.addEventListener("click", runScan);

  function confLabel(c) {
    return c === "A" ? "신뢰도 A · 표본 충분" : c === "B" ? "신뢰도 B · 표본 적음" : "신뢰도 C · 시세 산정 보류";
  }

  function renderResult() {
    const s = state.scan;
    if (!s) return;
    const el = $("#scanResult");
    el.hidden = false;
    const lowConf = s.conf === "C";
    const opin = s.opinion;

    const compHTML = lowConf
      ? '<p class="empty-note">작가 미상 · 표본 부족으로 유사 낙찰 근거를 제시하지 않습니다. 제휴 감정사 상담으로 연결합니다.</p>'
      : '<div class="comp">' + s.comparables.map(function (c) {
        return '<div class="comp-row"><div><div class="c-title">' + esc(c.house) + ' · ' + esc(c.title) + '</div>' +
          '<div class="c-meta">' + c.date + ' · ' + esc(c.size) + '</div></div>' +
          '<div class="c-price">' + won(c.price) + '</div></div>';
      }).join("") + '</div><p class="hint" style="margin-top:8px">표본 ' + s.samples + '건 · 최근 24개월 8건 · 중위값 기준 (출처: K-ARTMARKET 공개 낙찰정보·샘플)</p>';

    el.innerHTML =
      '<div class="result-head">' +
        '<div><p class="eyebrow">AI 예비 분석 리포트 · ' + dateStr(s.at) + '</p>' +
        '<h3 class="result-title">' + esc(s.artistName) + (s.artistEn ? ' <span class="brand-en">' + esc(s.artistEn) + '</span>' : '') + '</h3>' +
        '<p class="hint">검증 ID ' + s.id + ' · ' + esc(D.GENRES[s.genre].short) + ' · 사진 ' + Object.keys(s.photos).length + '장</p></div>' +
        '<span class="conf ' + s.conf + '">' + confLabel(s.conf) + '</span>' +
      '</div>' +
      '<div class="result-grid">' +
        '<div class="result-col">' +
          '<div class="subcard estimate">' +
            '<span class="label">참고 추정가 (경매 데이터 기반)</span>' +
            (lowConf
              ? '<span class="value">시세 산정 보류</span><span class="sub">표본이 1건 이하이거나 작가 미상입니다. 감정사 상담만 연결됩니다.</span>'
              : '<span class="value">' + range(s.low, s.high) + '</span>' +
                '<span class="sub">위탁 권장가 ' + won(Math.round(s.mid * 0.95 / 10000) * 10000) + ' (추정가 중간값 기준) · 구매수수료·거래비용 별도</span>') +
          '</div>' +
          '<div class="subcard"><h4>유사 경매 낙찰 근거</h4>' + compHTML + '</div>' +
          '<div class="subcard"><h4>상태 체크포인트</h4><ul class="checks">' +
            s.checks.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + '</ul></div>' +
        '</div>' +
        '<div class="result-col">' +
          (s.expertRequested
            ? (opin
              ? '<div class="expert-opinion"><div class="eo-head"><span class="badge expert">전문가 소견 포함</span>' +
                '<span class="badge tier">' + esc(opin.grade) + '</span><strong>' + esc(opin.name) + ' 전문가</strong></div>' +
                '<p class="eo-text">“' + esc(opin.text) + '”</p>' +
                '<p class="eo-meta">사진·입력 정보 기반 참고 소견(150자 이내) · 채택 ' + esc(opin.adoptedAt) + ' · 정산 1,000원 · 감정서 아님</p></div>'
              : '<div class="subcard"><h4>전문가 검토 의견</h4><p class="hint">결제 완료 · 3영업일 내 등록 예정입니다. 채택되면 리포트와 공유 카드에 ‘전문가 소견 포함’ 배지가 표시됩니다.</p></div>')
            : '<div class="subcard"><h4>전문가 검토 의견</h4><p class="hint">미신청 상태입니다. 스캔 전 옵션(+10,000원)을 선택하면 150자 이내 참고 소견이 추가됩니다.</p></div>') +
          '<div class="disclaimer">' + D.TEXT.disclaimer + '</div>' +
          '<div class="subcard"><h4>다음 단계</h4>' +
            '<div class="result-actions">' +
              '<button type="button" class="btn primary" id="openShare">QR 인장 카드</button>' +
              '<button type="button" class="btn" data-register="fixed"' + (lowConf ? ' disabled' : '') + '>정가 위탁 등록</button>' +
              '<button type="button" class="btn dark" data-register="auction"' + (lowConf ? ' disabled' : '') + '>온라인 경매 등록</button>' +
            '</div>' +
            (lowConf ? '<p class="hint" style="margin-top:8px">신뢰도 C는 경매 출품이 불가합니다. 감정사 상담을 먼저 진행합니다.</p>' : '') +
            '<p class="hint" style="margin-top:10px">등록 전 본인인증·소장 경위 확인과 제휴 감정사 2차 검증을 거칩니다.</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    $("#openShare").addEventListener("click", openShare);
    $$("[data-register]", el).forEach(function (b) {
      b.addEventListener("click", function () { openRegister(b.getAttribute("data-register")); });
    });
  }

  /* =========================================================
     공유 카드 (QR 디지털 인장)
     ========================================================= */
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function wrapText(ctx, text, x, y, maxW, lineH) {
    const words = String(text).split(" ");
    let line = "", lines = [];
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * lineH); });
    return lines.length;
  }

  async function openShare() {
    const s = state.scan;
    if (!s) return;
    openModal("shareModal");
    await renderShareCard(s);
  }

  async function renderShareCard(s) {
    const c = $("#shareCanvas");
    const ctx = c.getContext("2d");
    const W = 1080;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = "#f8f2e5";
    ctx.fillRect(0, 0, W, W);

    // subtle paper grain
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = i % 2 ? "#8a7a5c" : "#ffffff";
      ctx.fillRect(Math.random() * W, Math.random() * W, 2, 2);
    }
    ctx.restore();

    // border
    ctx.strokeStyle = "#b99a63";
    ctx.lineWidth = 3;
    ctx.strokeRect(34, 34, W - 68, W - 68);
    ctx.strokeStyle = "rgba(185,154,99,.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(48, 48, W - 96, W - 96);

    // header
    ctx.fillStyle = "#b02a24";
    roundRect(ctx, 76, 78, 62, 62, 10);
    ctx.fill();
    ctx.fillStyle = "#fbeede";
    ctx.font = '700 38px "Noto Serif CJK KR", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("鑑", 107, 111);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#211d18";
    ctx.font = '700 34px "Noto Serif CJK KR", serif';
    ctx.fillText("아트스캔 ArtScan", 158, 100);
    ctx.fillStyle = "#7c7263";
    ctx.font = '500 22px "Noto Sans CJK KR", sans-serif';
    ctx.fillText("온라인 미술 감별소 · AI 예비 분석 리포트", 158, 132);

    // artwork frame
    const fx = 76, fy = 176, fw = 928, fh = 500;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(fx - 10, fy - 10, fw + 20, fh + 20);
    ctx.strokeStyle = "#e1d2b4";
    ctx.lineWidth = 2;
    ctx.strokeRect(fx - 10, fy - 10, fw + 20, fh + 20);
    try {
      const src = s.photos.front || artImage("dots");
      const img = await loadImage(src);
      ctx.save();
      roundRect(ctx, fx, fy, fw, fh, 4);
      ctx.clip();
      // cover fit
      const ir = img.width / img.height, fr = fw / fh;
      let dw = fw, dh = fh, dx = fx, dy = fy;
      if (ir > fr) { dw = fh * ir; dx = fx - (dw - fw) / 2; }
      else { dh = fw / ir; dy = fy - (dh - fh) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } catch (err) {
      ctx.fillStyle = "#e8dcc6";
      ctx.fillRect(fx, fy, fw, fh);
    }

    // expert badge over the artwork
    if (s.opinion) {
      ctx.fillStyle = "#b02a24";
      roundRect(ctx, 96, 196, 246, 44, 22);
      ctx.fill();
      ctx.fillStyle = "#fff8ec";
      ctx.font = '700 21px "Noto Sans CJK KR", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("전문가 소견 포함", 219, 213);
      ctx.textAlign = "left";
    }

    // title
    ctx.fillStyle = "#211d18";
    ctx.font = '700 40px "Noto Serif CJK KR", serif';
    const titleLine = s.artistName + (s.artistEn ? " (" + s.artistEn + ")" : "");
    ctx.fillText(titleLine, 76, 744, 760);

    ctx.fillStyle = "#7c7263";
    ctx.font = '500 24px "Noto Sans CJK KR", sans-serif';
    ctx.fillText(D.GENRES[s.genre].label + " · 분석일 " + dateStr(s.at), 76, 782);

    // estimate
    ctx.fillStyle = "#8b7a5c";
    ctx.font = '700 22px "Noto Sans CJK KR", sans-serif';
    ctx.fillText("참고 추정가 (경매 데이터 기반)", 76, 836);
    ctx.fillStyle = "#8c1f1b";
    if (s.conf === "C") {
      ctx.font = '700 56px "Noto Serif CJK KR", serif';
      ctx.fillText("시세 산정 보류", 76, 898);
    } else {
      ctx.font = '700 56px "Noto Serif CJK KR", serif';
      ctx.fillText(wonNum(s.low) + " ~ " + wonNum(s.high) + " 원", 76, 898);
    }
    ctx.fillStyle = "#7c7263";
    ctx.font = '500 22px "Noto Sans CJK KR", sans-serif';
    ctx.fillText("검증 ID " + s.id, 76, 940);

    // fixed notice
    ctx.fillStyle = "#5a5145";
    ctx.font = '600 20px "Noto Sans CJK KR", sans-serif';
    ctx.fillText("AI 시세 스캔 · 참고 추정가 확인", 76, 1000);
    ctx.fillText("(경매 데이터 기반 / 진위 보증 아님)", 76, 1028);

    // QR
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(852, 846, 178, 178);
    ctx.strokeStyle = "#e1d2b4";
    ctx.lineWidth = 1;
    ctx.strokeRect(852, 846, 178, 178);
    const shareURL = (location.protocol === "file:")
      ? "https://artscan-mvp.app/r/" + s.id
      : location.origin + location.pathname + "#r/" + s.id;
    drawQR(ctx, shareURL, 858, 852, 166, "#17140f", "#ffffff");

    // red seal stamp (rotated)
    ctx.save();
    ctx.translate(926, 722);
    ctx.rotate(-9 * Math.PI / 180);
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = "#b02a24";
    ctx.fillStyle = "rgba(176,42,36,0.05)";
    ctx.lineWidth = 5;
    roundRect(ctx, -84, -84, 168, 168, 8);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    roundRect(ctx, -73, -73, 146, 146, 5);
    ctx.stroke();
    ctx.fillStyle = "#b02a24";
    ctx.textAlign = "center";
    ctx.font = '800 28px "Noto Serif CJK KR", serif';
    ctx.fillText("참고 추정가", 0, -26);
    ctx.font = '800 24px "Noto Serif CJK KR", serif';
    ctx.fillText("확인", 0, 8);
    ctx.font = '700 16px "Noto Sans CJK KR", sans-serif';
    ctx.fillText("진위 보증 아님", 0, 44);
    ctx.restore();
  }

  $("#downloadCard").addEventListener("click", function () {
    const c = $("#shareCanvas");
    const id = state.scan ? state.scan.id : "artscan";
    c.toBlob(function (blob) {
      if (!blob) { toast("이미지 생성에 실패했습니다."); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "artscan-" + id + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast("PNG 저장을 시작했습니다 · 게시물에 첨부해 보세요");
    }, "image/png");
  });

  /* =========================================================
     등록 (정가 위탁 / 온라인 경매)
     ========================================================= */
  function incrementFor(price) {
    if (price < 1000000) return 50000;
    if (price < 3000000) return 100000;
    if (price < 5000000) return 200000;
    if (price < 10000000) return 300000;
    if (price < 30000000) return 500000;
    return 1000000;
  }
  function roundTo(v, unit) { return Math.round(v / unit) * unit; }

  function openRegister(mode) {
    const s = state.scan;
    if (!s) return;
    if (s.conf === "C") { toast("신뢰도 C는 시세 산정 보류 상태로 위탁·경매 등록이 불가합니다."); return; }
    openModal("registerModal");
    $("#registerTitle").textContent = mode === "auction" ? "온라인 경매 출품" : "정가 위탁 등록";
    const inc = incrementFor(s.mid);
    const defPrice = Math.round(s.mid / 10000) * 10000;
    const start = roundTo(s.mid * 0.6, inc);
    const reserve = Math.min(roundTo(s.mid * 0.75, inc), s.low);
    $("#registerBody").innerHTML =
      '<div class="reg-summary">' +
        '<div class="row"><span>작품</span><b>' + esc(s.artistName) + ' · ' + esc(D.GENRES[s.genre].short) + '</b></div>' +
        '<div class="row"><span>참고 추정가</span><b>' + (s.conf === "C" ? "산정 보류" : range(s.low, s.high)) + '</b></div>' +
        '<div class="row"><span>신뢰도</span><b>' + s.conf + ' 등급</b></div>' +
        '<div class="row"><span>판매자 수수료</span><b>낙찰·판매가의 18% (구매자 수수료 0원)</b></div>' +
      '</div>' +
      '<div class="field" style="margin-top:16px">' +
        '<label class="field-label" for="regPrice">' + (mode === "auction" ? "출품 추정가(중간값)" : "희망 판매가") + '</label>' +
        '<input class="input" id="regPrice" type="number" min="0" step="10000" value="' + defPrice + '">' +
        '<p class="hint" id="regCalc"></p>' +
      '</div>' +
      '<div class="disclaimer" style="margin-bottom:14px">위탁 등록 전 <b>본인인증·소장 경위 확인</b>과 <b>제휴 감정사 2차 검증</b>이 필요합니다. 검증 통과 후 갤러리에 노출됩니다. 본 화면은 시연용입니다.</div>' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn primary" id="regSubmit">' + (mode === "auction" ? "경매 출품 등록" : "정가 위탁 등록") + '</button>' +
        '<button type="button" class="btn ghost" data-close="registerModal">취소</button>' +
      '</div>';

    const priceInput = $("#regPrice");
    const calc = $("#regCalc");
    function update() {
      const v = Math.max(0, Number(priceInput.value) || 0);
      if (mode === "auction") {
        const st = roundTo(v * 0.6, incrementFor(v));
        const rs = Math.min(roundTo(v * 0.75, incrementFor(v)), Math.round(s.low || v));
        calc.innerHTML = '출품 추정가 <b>' + won(v) + '</b> · 시작가 <b>' + won(st) + '</b> (60%) · 내정가 <b>' + won(rs) +
          '</b> (75%, 비공개) · 호가 단위 ' + won(incrementFor(v));
      } else {
        calc.innerHTML = '희망가 <b>' + won(v) + '</b> 기준 · 정산 예상액 <b>' + won(Math.round(v * 0.82)) + '</b> (수수료 18% 차감, 실비 별도)';
      }
    }
    priceInput.addEventListener("input", update);
    update();

    $("#regSubmit").addEventListener("click", function () {
      const v = Math.max(10000, Number(priceInput.value) || 0);
      const id = "L-" + Math.floor(200 + Math.random() * 700);
      const base = {
        id: id, artistId: s.artistId, artist: s.artistName,
        title: "무제 (스캔 접수)", year: "", medium: D.GENRES[s.genre].short,
        size: "", type: mode === "auction" ? "auction" : "fixed",
        price: v, estimateLow: s.low, estimateHigh: s.high,
        image: s.photos.front, verified: false, views: 0,
        opinion: s.opinion ? { expertId: s.opinion.expertId, text: s.opinion.text, adoptedAt: s.opinion.adoptedAt } : null,
        scanId: s.id
      };
      if (mode === "auction") {
        base.startPrice = roundTo(v * 0.6, incrementFor(v));
        base.reserve = Math.min(roundTo(v * 0.75, incrementFor(v)), s.low || v);
        base.current = base.startPrice;
        base.bids = 0;
        base.endAt = Date.now() + 7 * 24 * 3600 * 1000;
        base.extensions = 0;
        base.bidLog = [{ amount: base.startPrice, at: Date.now(), who: "시작가" }];
      }
      state.listings.unshift(base);
      closeModal("registerModal");
      switchTab("gallery");
      renderGallery(base.id);
      toast(mode === "auction" ? "온라인 경매 회차에 출품되었습니다 (검증 대기)" : "정가 위탁으로 등록되었습니다 (검증 대기)");
    });
  }

  /* =========================================================
     gallery
     ========================================================= */
  function opinionExpert(l) {
    if (!l.opinion) return null;
    return D.EXPERTS.filter(function (e) { return e.id === l.opinion.expertId; })[0] || null;
  }
  function currentPrice(l) { return l.type === "auction" ? l.current : l.price; }

  function renderGallery(freshId) {
    const grid = $("#galleryGrid");
    if (!grid) return;
    const all = state.listings.slice();
    const boostedAll = all.filter(function (l) { return !!l.opinion; });
    const cap = Math.max(1, Math.floor(all.length * 0.4));
    const boosted = boostedAll.slice(0, cap);
    let items;
    if (state.sort === "recommended") {
      const rest = all.filter(function (l) { return boosted.indexOf(l) === -1; });
      items = boosted.concat(rest);
    } else if (state.sort === "price") {
      items = all.slice().sort(function (a, b) { return currentPrice(a) - currentPrice(b); });
    } else {
      items = all.slice().sort(function (a, b) {
        if (a.type === "auction" && b.type === "auction") return a.endAt - b.endAt;
        if (a.type === "auction") return -1;
        if (b.type === "auction") return 1;
        return 0;
      });
    }

    grid.innerHTML = items.map(function (l) {
      const ex = opinionExpert(l);
      const g = D.GRADES[gradeOf(ex).key];
      const isBoosted = state.sort === "recommended" && boosted.indexOf(l) !== -1;
      const img = l.image && l.image.indexOf("data:") === 0 ? l.image : artImage(l.image);
      const badges = [];
      if (isBoosted) {
        badges.push('<span class="badge expert">전문가 소견</span>');
        if (ex && (gradeOf(ex).key === "gold" || gradeOf(ex).key === "master")) {
          badges.push('<span class="badge tier">' + g.label + '</span>');
        }
      }
      badges.push('<span class="badge cert">' + (l.verified ? "2차 검증 완료" : "검증 대기") + '</span>');
      const metaParts = [l.year, l.medium, (l.size && l.size !== "-") ? l.size : ""].filter(Boolean);

      const priceBlock = l.type === "auction"
        ? '<div class="gprice"><span class="p-label">현재가 · 입찰 ' + l.bids + '회</span>' +
          '<span class="p-value">' + won(l.current) + '</span>' +
          '<span class="p-range">추정 ' + range(l.estimateLow, l.estimateHigh) + '</span></div>'
        : '<div class="gprice"><span class="p-label">정가 위탁</span>' +
          '<span class="p-value">' + won(l.price) + '</span>' +
          '<span class="p-range">추정 ' + range(l.estimateLow, l.estimateHigh) + '</span></div>';

      const countdown = l.type === "auction"
        ? '<span class="countdown" data-end="' + l.endAt + '">' + fmtRemain(l.endAt - Date.now()) + '</span>'
        : '';

      return '<article class="gcard' + (isBoosted ? " boosted" : "") + (freshId === l.id ? " fresh" : "") + '" data-listing="' + l.id + '">' +
        '<div class="gthumb"><img src="' + img + '" alt="' + esc(l.artist + " " + l.title) + '">' +
        '<span class="type-tag' + (l.type === "auction" ? " auction" : "") + '">' + (l.type === "auction" ? "온라인 경매" : "정가 위탁") + '</span>' +
        countdown + '</div>' +
        '<div class="gbody">' +
        '<div class="gbadges">' + badges.join("") + '</div>' +
        '<h4 class="gtitle">' + esc(l.artist) + ' 《' + esc(l.title) + '》</h4>' +
        '<p class="gmeta">' + esc(metaParts.join(" · ")) + '</p>' +
        (l.opinion ? '<p class="eo-snippet">“' + esc(l.opinion.text) + '”</p>' : '') +
        priceBlock +
        '<div class="gfoot"><button type="button" class="btn ' + (l.type === "auction" ? "primary" : "") + '" data-open="' + l.id + '">' +
        (l.type === "auction" ? "입찰하기" : "상세 보기") + '</button></div>' +
        '</div></article>';
    }).join("");

    $$("#galleryGrid [data-open]").forEach(function (b) {
      b.addEventListener("click", function () { openDetail(b.getAttribute("data-open")); });
    });

    const note = $("#sortNote");
    if (state.sort === "recommended") {
      note.className = "sort-note";
      note.innerHTML = "추천순 · <b>전문가 소견 채택 매물 우대</b> (1페이지 40% 상한, 최대 " + cap + "건)";
    } else {
      note.className = "sort-note warn";
      note.innerHTML = "선택 정렬에서는 <b>전문가 소견 우대가 적용되지 않습니다</b> — 가격·마감 기준 결과만 보여줍니다.";
    }
    tickCountdowns();
  }

  $("#sortSwitch").addEventListener("click", function (e) {
    const b = e.target.closest(".seg");
    if (!b) return;
    state.sort = b.getAttribute("data-sort");
    $$("#sortSwitch .seg").forEach(function (x) { x.classList.toggle("active", x === b); });
    renderGallery();
  });

  function fmtRemain(ms) {
    if (ms <= 0) return "마감";
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return "D-" + d + " " + pad2(h) + ":" + pad2(m);
    if (h > 0) return pad2(h) + ":" + pad2(m) + ":" + pad2(s);
    return pad2(m) + ":" + pad2(s);
  }

  function tickCountdowns() {
    $$("[data-end]").forEach(function (el) {
      const end = Number(el.getAttribute("data-end"));
      const left = end - Date.now();
      el.textContent = fmtRemain(left);
      el.classList.toggle("urgent", left > 0 && left < 10 * 60000);
    });
    const t = $("#bidTimer");
    if (t) {
      const id = t.getAttribute("data-end");
      const l = state.listings.filter(function (x) { return x.id === id; })[0];
      if (l) {
        const left = l.endAt - Date.now();
        t.textContent = fmtRemain(left);
        t.classList.toggle("urgent", left > 0 && left < 10 * 60000);
        if (left <= 0) t.textContent = "경매 종료";
      }
    }
  }
  setInterval(tickCountdowns, 1000);

  /* ---------- 입찰 / 상세 ---------- */
  function openDetail(id) {
    const l = state.listings.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    openModal("bidModal");
    if (l.type === "auction") renderBid(l);
    else renderFixedDetail(l);
  }

  function renderFixedDetail(l) {
    const ex = opinionExpert(l);
    $("#bidTitle").textContent = "매물 상세 · 정가 위탁";
    const img = l.image && l.image.indexOf("data:") === 0 ? l.image : artImage(l.image);
    $("#bidBody").innerHTML =
      '<div class="bid-layout">' +
        '<div><div class="bid-img"><img src="' + img + '" alt="' + esc(l.title) + '"></div>' +
        '<div class="subcard" style="margin-top:12px"><h4>검증 이력</h4><ul class="checks">' +
          '<li>제휴 감정사 2차 검증 완료</li><li>소유권·소장 경위 확인 완료</li><li>도난·문화유산 자기확인 5문항 통과</li>' +
          '</ul></div></div>' +
        '<div class="bid-info">' +
          '<h4 class="bid-title">' + esc(l.artist) + ' 《' + esc(l.title) + '》</h4>' +
          '<p class="bid-meta">' + esc([l.year, l.medium, l.size].filter(Boolean).join(" · ")) + '</p>' +
          '<div class="bid-price-box"><span class="k">판매가</span><div class="v">' + won(l.price) + '</div>' +
            '<span class="bid-meta">추정 ' + range(l.estimateLow, l.estimateHigh) + ' · 구매자 수수료 0원</span></div>' +
          (ex
            ? '<div class="expert-opinion" style="margin:0"><div class="eo-head"><span class="badge expert">전문가 소견 포함</span>' +
              '<span class="badge tier">' + D.GRADES[gradeOf(ex).key].label + '</span><strong>' + esc(ex.name) + '</strong></div>' +
              '<p class="eo-text">“' + esc(l.opinion.text) + '”</p>' +
              '<p class="eo-meta">' + D.TEXT.boostNotice + '</p></div>'
            : '<div class="subcard"><h4>전문가 검토 의견</h4><p class="hint">이 매물에는 채택된 전문가 소견이 없습니다.</p></div>') +
          '<div class="disclaimer">결제는 에스크로로 예치되고 인수 확인 후 판매자에게 정산됩니다. 본 화면은 시연용입니다.</div>' +
          '<div class="modal-actions"><button type="button" class="btn primary" id="inquiryBtn">구매 문의</button>' +
          '<button type="button" class="btn ghost" data-close="bidModal">닫기</button></div>' +
        '</div>' +
      '</div>';
    $("#inquiryBtn").addEventListener("click", function () { toast("구매 문의가 접수되었습니다 (시연)"); });
  }

  function renderBid(l) {
    const ex = opinionExpert(l);
    const img = l.image && l.image.indexOf("data:") === 0 ? l.image : artImage(l.image);
    const inc = incrementFor(l.current);
    const ended = Date.now() >= l.endAt;
    const reserveMet = l.current >= l.reserve;
    const bids = [1, 2, 3].map(function (k) {
      const amount = l.current + inc * k;
      return '<button type="button" class="btn ' + (k === 1 ? "primary" : "") + '" data-bid="' + amount + '"' + (ended ? " disabled" : "") + '>' +
        '<b>' + won(amount) + '</b><small>+' + wonNum(inc * k) + '</small></button>';
    }).join("");

    $("#bidTitle").textContent = "온라인 경매 입찰";
    $("#bidBody").innerHTML =
      '<div class="bid-layout">' +
        '<div><div class="bid-img"><img src="' + img + '" alt="' + esc(l.title) + '"></div>' +
          '<div class="subcard" style="margin-top:12px"><h4>경매 조건</h4>' +
            '<div class="comp">' +
              '<div class="comp-row"><span>추정가</span><b>' + range(l.estimateLow, l.estimateHigh) + '</b></div>' +
              '<div class="comp-row"><span>시작가</span><b>' + won(l.startPrice) + '</b></div>' +
              '<div class="comp-row"><span>호가 단위</span><b>' + won(inc) + '</b></div>' +
              '<div class="comp-row"><span>판매자 수수료</span><b>낙찰가 18% · 출품료 0원</b></div>' +
              '<div class="comp-row"><span>내정가</span><b>비공개</b></div>' +
            '</div>' +
            '<p class="hint" style="margin-top:8px">종료 3분 전 입찰 시 <b>3분 자동 연장</b> (최대 10회) · 유찰 시 수수료 없음</p>' +
          '</div></div>' +
        '<div class="bid-info">' +
          '<h4 class="bid-title">' + esc(l.artist) + ' 《' + esc(l.title) + '》</h4>' +
          '<p class="bid-meta">' + esc([l.year, l.medium, l.size].filter(Boolean).join(" · ")) + '</p>' +
          '<div class="bid-row">' +
            '<div class="bid-price-box"><span class="k">현재가</span><div class="v">' + won(l.current) + '</div>' +
              '<span class="bid-meta">입찰 ' + l.bids + '회</span></div>' +
            '<div class="bid-price-box"><span class="k">남은 시간</span>' +
              '<div class="v timer' + (l.endAt - Date.now() < 600000 ? " urgent" : "") + '" id="bidTimer" data-end="' + l.id + '">' +
              fmtRemain(l.endAt - Date.now()) + '</div>' +
              '<span class="bid-meta">연장 ' + l.extensions + '회</span></div>' +
          '</div>' +
          '<div class="reserve ' + (reserveMet ? "met" : "unmet") + '">' +
            (ended
              ? (reserveMet ? "경매 종료 · 낙찰 처리 (내정가 도달)" : "경매 종료 · 유찰 (내정가 미달, 수수료 0원)")
              : (reserveMet ? "내정가 도달 · 이 가격 이상에서 낙찰이 확정됩니다" : "내정가 미달 상태 · 입찰을 이어갈 수 있습니다")) +
          '</div>' +
          (l.lastExtend ? '<div class="extend-note">마감 3분 전 입찰로 종료 시각이 3분 연장되었습니다 (' + l.extensions + '회 / 최대 10회)</div>' : '') +
          '<div class="bid-actions">' + bids + '</div>' +
          '<div><h4 style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#4a4238;margin-bottom:6px">입찰 기록</h4>' +
            '<ul class="bid-log">' + (l.bidLog || []).slice().reverse().map(function (b) {
              return '<li><span>' + won(b.amount) + (b.extend ? ' · 연장' : '') + '</span><span class="who">' + (b.who || "입찰자") + '</span></li>';
            }).join("") + '</ul></div>' +
          '<button type="button" class="btn ghost small" id="demoReset">⏱ 시연: 마감 2분 전으로 설정</button>' +
          '<p class="hint">시연용 입찰입니다. 실제 결제·낙찰은 발생하지 않습니다.</p>' +
        '</div>' +
      '</div>';

    $$("#bidBody [data-bid]").forEach(function (b) {
      b.addEventListener("click", function () { placeBid(l.id, Number(b.getAttribute("data-bid"))); });
    });
    $("#demoReset").addEventListener("click", function () {
      l.endAt = Date.now() + 2 * 60000;
      l.lastExtend = false;
      toast("시연 설정: 마감 2분 전으로 변경했습니다");
      renderBid(l);
    });
  }

  function placeBid(id, amount) {
    const l = state.listings.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    const now = Date.now();
    if (now >= l.endAt) { toast("경매가 종료되어 입찰할 수 없습니다."); renderBid(l); return; }
    const inc = incrementFor(l.current);
    if (amount < l.current + inc) { toast("최소 호가 단위(" + won(inc) + ") 이상이어야 합니다."); return; }

    const before = l.current;
    l.current = amount;
    l.bids += 1;
    l.bidLog = l.bidLog || [];
    let extended = false;
    if (l.endAt - now <= 3 * 60000 && l.extensions < 10) {
      l.endAt = l.endAt + 3 * 60000;
      l.extensions += 1;
      extended = true;
    }
    l.bidLog.push({ amount: amount, at: now, who: "나 (프로토타입)", extend: extended });
    l.lastExtend = extended;

    if (extended) toast("마감 3분 전 입찰 · 종료 시각이 3분 연장되었습니다 (" + l.extensions + "회/최대 10회)");
    else toast("입찰 완료 · 현재가 " + won(amount));

    if (amount >= l.reserve && before < l.reserve) {
      setTimeout(function () { toast("내정가 도달 · 이 가격 이상에서 낙찰이 확정됩니다"); }, 1200);
    }
    renderBid(l);
    renderGallery();
  }

  /* =========================================================
     DB tab
     ========================================================= */
  function renderDB() {
    const q = ($("#dbSearch").value || "").trim().toLowerCase();
    const list = D.ARTISTS.filter(function (a) {
      if (!q) return true;
      const hay = [a.ko, a.en, a.hanja, a.field, a.medium, a.aliases.join(" ")].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    $("#artistCount").textContent = list.length + " / " + D.ARTISTS.length + "명";

    if (!q) {
      $("#dbChips").innerHTML = D.ARTISTS.slice(0, 7).map(function (a) {
        return '<button type="button" class="chip" data-chip="' + esc(a.ko) + '">' + esc(a.ko) + ' · ' + esc(a.aliases[0]) + '</button>';
      }).join("");
      $$("#dbChips .chip").forEach(function (b) {
        b.addEventListener("click", function () {
          $("#dbSearch").value = b.getAttribute("data-chip");
          renderDB();
        });
      });
    }

    $("#artistList").innerHTML = list.map(function (a) {
      return '<article class="acard">' +
        '<h4>' + esc(a.ko) + ' <span class="a-en">' + esc(a.en) + ' · ' + esc(a.hanja) + '</span></h4>' +
        '<div class="a-alias">' + a.aliases.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + '</div>' +
        '<div class="a-stats">' +
          '<div class="a-stat"><div class="k">생몰</div><div class="v">' + a.born + (a.died ? "–" + a.died : "–") + '</div></div>' +
          '<div class="a-stat"><div class="k">분야 · 매체</div><div class="v">' + esc(a.field) + ' · ' + esc(a.medium) + '</div></div>' +
          '<div class="a-stat"><div class="k">호당 평균가(샘플)</div><div class="v">' + won(a.hoe) + '</div></div>' +
          '<div class="a-stat"><div class="k">참고 시세 중앙값</div><div class="v">' + won(a.p50) + '</div></div>' +
        '</div>' +
        '<p class="a-note"><b>낙관·서명 특징</b> · ' + a.seal + '</p>' +
        '<p class="a-note">' + esc(a.note) + '</p>' +
        '<div class="a-alias"><span>낙찰 표본 ' + a.samples + '건</span><span>신뢰도 ' + a.confidence + '</span><span>가격 통계 기준: ‘호당 평균가·참고 시세 중앙값’</span></div>' +
        '</article>';
    }).join("") || '<p class="empty-note">검색 결과가 없습니다.</p>';

    renderBacktest();
    renderBroadcast();
  }

  $("#dbSearch").addEventListener("input", function () { renderDB(); });
  $("#dbClear").addEventListener("click", function () { $("#dbSearch").value = ""; renderDB(); });

  function renderBacktest() {
    const board = $("#backtestBoard");
    if (!board) return;
    const refs = D.BROADCAST_REFS;
    let hit = 0, sumErr = 0, sumWidth = 0;
    const rows = refs.map(function (r) {
      const mid = (r.aiLow + r.aiHigh) / 2;
      const err = ((mid - r.broadcast) / r.broadcast) * 100;
      const inRange = r.broadcast >= r.aiLow && r.broadcast <= r.aiHigh;
      if (inRange) hit++;
      sumErr += Math.abs(err);
      sumWidth += ((r.aiHigh - r.aiLow) / 2 / mid) * 100;
      const cls = inRange ? "in" : (Math.abs(err) <= 10 ? "near" : "out");
      const label = inRange ? "범위 적중" : (Math.abs(err) <= 10 ? "근접" : "범위 밖");
      return '<tr>' +
        '<td><div class="t-title">' + esc(r.title) + '</div><div class="t-sub">' + esc(r.era) + ' · ' + esc(r.category) + '</div></td>' +
        '<td class="num">' + wonNum(r.broadcast) + ' 원</td>' +
        '<td class="num">' + wonNum(r.aiLow) + '~' + wonNum(r.aiHigh) + ' 원</td>' +
        '<td class="num">' + (err > 0 ? "+" : "") + err.toFixed(1) + '%</td>' +
        '<td><span class="errdot ' + cls + '">' + label + '</span></td>' +
        '</tr>';
    }).join("");

    board.innerHTML =
      '<div class="bt-head"><h4>AI 정확도 검증(백테스트) 보드</h4>' +
        '<span class="badge broadcast">시연용 비교 예시</span></div>' +
      '<p class="bt-note">※ 시연용 백테스트 비교 예시이며, 실서비스에서는 <b>실제 경매 낙찰가·블라인드 테스트 기준 평균 오차율(MAPE)</b>을 함께 공개합니다. 방송 감정가는 보험·방송용 추정 가치로 실제 낙찰가와 다르며, 아래 AI 추정가는 <b>시세 산출 모델 검증용 비교값</b>입니다.</p>' +
      '<div class="bt-summary">' +
        '<div class="bt-stat"><div class="k">범위 적중</div><div class="v">' + hit + ' / ' + refs.length + ' (' + pct((hit / refs.length) * 100) + ')</div></div>' +
        '<div class="bt-stat"><div class="k">평균 중앙값 오차</div><div class="v">' + pct(sumErr / refs.length) + '</div></div>' +
        '<div class="bt-stat"><div class="k">평균 범위 폭</div><div class="v">±' + pct(sumWidth / refs.length) + '</div></div>' +
      '</div>' +
      '<div class="bt-table-wrap"><table class="bt-table"><thead><tr>' +
        '<th>작품</th><th>방송 감정가</th><th>AI 추정가 범위</th><th>오차(중앙값)</th><th>판정</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="mini-legend">판정 기준 · <b>범위 적중</b>: 방송 감정가가 AI 추정가 범위 안 · <b>근접</b>: 범위 밖이나 중앙값 오차 10% 이내 · <b>범위 밖</b>: 10% 초과. 1건은 AI가 보수적으로 낮게 산정한 사례로, 오차를 숨기지 않고 함께 표기했습니다.</p>';
  }

  function renderBroadcast() {
    $("#broadcastList").innerHTML = D.BROADCAST_REFS.map(function (r) {
      const mid = (r.aiLow + r.aiHigh) / 2;
      const err = ((mid - r.broadcast) / r.broadcast) * 100;
      const inRange = r.broadcast >= r.aiLow && r.broadcast <= r.aiHigh;
      const cls = inRange ? "in" : (Math.abs(err) <= 10 ? "near" : "out");
      const label = inRange ? "AI 범위 적중" : (Math.abs(err) <= 10 ? "근접" : "범위 밖");
      return '<article class="bcard">' +
        '<div class="b-top"><div><div class="b-cat">' + esc(r.category) + '</div>' +
        '<h4>' + esc(r.title) + '</h4><div class="b-cat">' + esc(r.era) + '</div></div>' +
        '<div class="b-value">' + wonNum(r.broadcast) + ' 원</div></div>' +
        '<div class="b-ai"><span>방송 감정가 대비</span><strong>AI ' + wonNum(r.aiLow) + '~' + wonNum(r.aiHigh) + ' 원</strong>' +
        '<span class="errdot ' + cls + '">' + label + ' · ' + (err > 0 ? "+" : "") + err.toFixed(1) + '%</span></div>' +
        '<p class="b-cond"><b>상태 감별 포인트</b><br>' + esc(r.cond) + '</p>' +
        '</article>';
    }).join("");
  }

  /* =========================================================
     전문가 · 어드민
     ========================================================= */
  function gradeOf(ex) {
    if (!ex) return D.GRADES.standard;
    if (ex.adopted >= 80 && ex.sales >= 300000000) return D.GRADES.master;
    if (ex.adopted >= 30 && ex.sales >= 100000000) return D.GRADES.gold;
    if (ex.adopted >= 10 && ex.sales >= 30000000) return D.GRADES.silver;
    return D.GRADES.standard;
  }

  function renderExpert() {
    const grade = function (ex) {
      const g = gradeOf(ex);
      return '<span class="grade-badge ' + g.cls + '">' + g.label + '</span>';
    };
    $("#expertGrid").innerHTML = D.EXPERTS.map(function (ex) {
      const g = gradeOf(ex);
      const next = g.key === "standard" ? D.GRADES.silver
        : g.key === "silver" ? D.GRADES.gold
        : g.key === "gold" ? D.GRADES.master : null;
      const prog = next
        ? '다음 등급까지 채택 ' + Math.max(0, next.adopted - ex.adopted) + '건 · 판매 ' + won(Math.max(0, next.sales - ex.sales))
        : "최고 등급";
      return '<article class="ecard">' +
        '<div class="e-top"><div class="e-avatar">' + esc(ex.name.charAt(0)) + '</div>' +
          '<div><div class="e-name">' + esc(ex.name) + ' ' + grade(ex) + '</div>' +
          '<div class="e-field">' + esc(ex.field) + ' · ' + esc(ex.org) + '</div></div></div>' +
        '<div class="e-stats">' +
          '<div class="a-stat"><div class="k">누적 채택 의견</div><div class="v">' + ex.adopted + '건</div></div>' +
          '<div class="a-stat"><div class="k">채택 소견 판매액</div><div class="v">' + wonNum(ex.sales) + ' 원</div></div>' +
          '<div class="a-stat"><div class="k">최근 채택률</div><div class="v">' + ex.rate + '%</div></div>' +
          '<div class="a-stat"><div class="k">정산 단가</div><div class="v">1,000원 / 채택</div></div>' +
        '</div>' +
        '<p class="a-note">' + prog + '</p>' +
        '<p class="a-note" style="color:#7c7263">증빙: ' + esc(ex.proof) + ' · 어드민 승인 완료</p>' +
        '</article>';
    }).join("");
    $("#expertCount").textContent = D.EXPERTS.length + "명 등록 · 어드민 승인제";

    const targets = state.listings.filter(function (l) { return !l.opinion; });
    const selA = $("#reviewListing");
    const selB = $("#reviewExpert");
    const keepA = selA.value, keepB = selB.value;
    selA.innerHTML = targets.map(function (l) {
      return '<option value="' + l.id + '">' + esc(l.artist + " 《" + l.title + "》 · " + won(currentPrice(l))) + '</option>';
    }).join("") || '<option value="">대상 매물 없음</option>';
    selB.innerHTML = D.EXPERTS.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.name + " · " + gradeOf(e).label + " · " + e.field) + '</option>';
    }).join("");
    if (keepA) selA.value = keepA;
    if (keepB) selB.value = keepB;

    const tb = $("#settleTable tbody");
    tb.innerHTML = state.settlements.slice().reverse().map(function (s) {
      const ex = D.EXPERTS.filter(function (e) { return e.id === s.expertId; })[0];
      return '<tr><td>' + esc(s.title) + '</td><td>' + esc(ex ? ex.name : "-") + '</td><td>' + esc(s.date) + '</td><td>' + won(s.amount) + '</td></tr>';
    }).join("") || '<tr><td colspan="4" class="empty">아직 채택된 소견이 없습니다.</td></tr>';
  }

  const reviewText = $("#reviewText");
  reviewText.addEventListener("input", function () {
    $("#reviewCount").textContent = reviewText.value.length;
    if (reviewText.value.length > 150) reviewText.value = reviewText.value.slice(0, 150);
  });

  $("#adoptBtn").addEventListener("click", function () {
    const lid = $("#reviewListing").value;
    const eid = $("#reviewExpert").value;
    const text = reviewText.value.trim();
    if (!lid) { toast("채택할 매물이 없습니다."); return; }
    if (text.length < 10) { toast("소견을 10자 이상 작성해 주세요."); return; }
    if (text.length > 150) { toast("소견은 150자까지만 입력할 수 있습니다."); return; }
    const l = state.listings.filter(function (x) { return x.id === lid; })[0];
    const ex = D.EXPERTS.filter(function (x) { return x.id === eid; })[0];
    if (!l || !ex) return;
    if (l.opinion) { toast("이미 채택된 소견이 있습니다."); return; }
    l.opinion = { expertId: ex.id, text: text, adoptedAt: todayISO() };
    ex.adopted += 1;
    ex.sales += l.price || l.current || 0;
    state.settlements.push({ listingId: l.id, title: l.artist + " 《" + l.title + "》", expertId: ex.id, date: todayISO(), amount: 1000 });
    reviewText.value = "";
    $("#reviewCount").textContent = "0";
    renderExpert();
    renderGallery(l.id);
    toast("채택 완료 · 갤러리 상단으로 이동했습니다 (1,000원 정산 기록)");
  });

  $("#rejectBtn").addEventListener("click", function () {
    const text = reviewText.value.trim();
    if (!text) { toast("미채택 사유가 될 소견을 먼저 작성해 주세요."); return; }
    toast("미채택 처리되었습니다 · 전문가 정산은 발생하지 않습니다");
  });

  /* =========================================================
     modal · toast
     ========================================================= */
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.hidden = true;
    if (!$$(".modal").some(function (x) { return !x.hidden; })) document.body.style.overflow = "";
  }
  document.addEventListener("click", function (e) {
    const c = e.target.closest("[data-close]");
    if (c) closeModal(c.getAttribute("data-close"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      $$(".modal").forEach(function (m) { if (!m.hidden) closeModal(m.id); });
      if (suggestEl) suggestEl.hidden = true;
    }
  });

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /* =========================================================
     init
     ========================================================= */
  function init() {
    initData();
    renderSlots();
    renderChosen();
    renderGallery();
    renderDB();
    renderExpert();
    $$(".tab").forEach(function (b) {
      b.addEventListener("click", function () { switchTab(b.getAttribute("data-tab")); });
      b.id = "tab-" + b.getAttribute("data-tab");
    });
    $("#genreHint").innerHTML = D.GENRES[state.genre].hint;
    updateScanState();

    // 공유 카드 QR 유입 (#r/검증ID)
    const hashMatch = (location.hash || "").match(/^#r\/([A-Za-z0-9-]+)$/);
    if (hashMatch) {
      setTimeout(function () {
        toast("공유 카드 QR로 연결되었습니다 · 검증 ID " + hashMatch[1] + " (시연)");
      }, 700);
    }

    // PWA service worker
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () { /* 프로토타입: 오프라인 캐시는 선택 */ });
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // 테스트/디버그용 (읽기 전용 노출)
  window.ARTSCAN = {
    state: state,
    QR: QR,
    openTab: switchTab,
    share: openShare,
    scan: runScan
  };
})();
