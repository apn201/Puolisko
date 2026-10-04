// Share card, rendered client side. The player posts it with their own thumb; we never hold it.

export const FORMATS = { feed: [1080, 1350], story: [1080, 1920] };

const BEAUTY = '#ff7ad9';
const BEAST = '#9dff3c';
const PUMPKIN = '#ff7a1a';
const SHADOW = '#07030c';
// Same faces as the app. The page's CSS has loaded both before a result can be shared.
const DISPLAY = 'Creepster, Fredoka, system-ui, sans-serif';
const ROUND = 'Fredoka, system-ui, sans-serif';
const BAT = 'M32 9L29 4L28 10C22 5 12 3 2 6C6 9 8 13 8 18C11 15 15 15 17 18C19 16 23 16 25 20C27 19 29 21 32 26C35 21 37 19 39 20C41 16 45 16 47 18C49 15 53 15 56 18C56 13 58 9 62 6C52 3 42 5 36 10L35 4Z';

// heat: mirrored heatmap canvas (with or without face). r: result from game.result().
// beautyCheek: 'left' | 'right'. In the mirrored image the player's left cheek is on screen left.
export function renderCard(heat, r, beautyCheek, { format = 'feed', url = '' } = {}) {
  const [W, H] = FORMATS[format];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2c1248');
  g.addColorStop(0.55, '#140a20');
  g.addColorStop(1, SHADOW);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  moon(ctx, W - 60, 30, 130);
  bat(ctx, W - 520, 40, 0.9, -0.15);

  const pad = 60;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `64px ${DISPLAY}`;
  shadowText(ctx, 'PUOLISKO', pad, pad + 46, PUMPKIN, 4);
  ctx.textAlign = 'right';
  ctx.font = `600 34px ${ROUND}`;
  shadowText(ctx, r.title, W - pad, pad + 40, '#fff4e6', 3);
  ctx.textAlign = 'left';

  // Face / heatmap area, sticker style: hard shadow, thick outline
  const top = pad + 80;
  const scoreBlock = 430;
  const imgH = H - top - scoreBlock - pad;
  const imgW = W - pad * 2;
  roundRect(ctx, pad + 12, top + 12, imgW, imgH, 36);
  ctx.fillStyle = SHADOW;
  ctx.fill();
  roundRect(ctx, pad, top, imgW, imgH, 36);
  ctx.save();
  ctx.clip();
  cover(ctx, heat, pad, top, imgW, imgH);
  ctx.restore();
  ctx.lineWidth = 8;
  ctx.strokeStyle = SHADOW;
  ctx.stroke();

  const beautyLeft = beautyCheek === 'left';
  pill(ctx, 'BEAUTY', beautyLeft ? pad + 28 : W - pad - 28, top + 28, BEAUTY, !beautyLeft);
  pill(ctx, 'BEAST', beautyLeft ? W - pad - 28 : pad + 28, top + 28, BEAST, beautyLeft);

  // Scores
  const y0 = top + imgH + 80;
  const col = (x, label, value, color, align) => {
    ctx.textAlign = align;
    ctx.font = label === 'BEAST' ? `44px ${DISPLAY}` : `700 36px ${ROUND}`;
    shadowText(ctx, label, x, y0, color, 3);
    ctx.font = `700 100px ${ROUND}`;
    shadowText(ctx, value.toFixed(1), x, y0 + 106, color, 5);
  };
  col(pad, beautyLeft ? 'BEAUTY' : 'BEAST', beautyLeft ? r.beauty : r.beast, beautyLeft ? BEAUTY : BEAST, 'left');
  col(W - pad, beautyLeft ? 'BEAST' : 'BEAUTY', beautyLeft ? r.beast : r.beauty, beautyLeft ? BEAST : BEAUTY, 'right');

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c9b3e6';
  ctx.font = `700 34px ${ROUND}`;
  ctx.fillText('G A P', W / 2, y0);
  ctx.font = `170px ${DISPLAY}`;
  const gap = signed(r.gap);
  const gw = ctx.measureText(gap).width;
  const gg = ctx.createLinearGradient(W / 2 - gw / 2, 0, W / 2 + gw / 2, 0);
  gg.addColorStop(0, BEAUTY);
  gg.addColorStop(0.5, '#ffd23f');
  gg.addColorStop(1, BEAST);
  shadowText(ctx, gap, W / 2, y0 + 172, gg, 7);

  ctx.fillStyle = '#9a86b5';
  ctx.font = `500 28px ${ROUND}`;
  ctx.fillText(`Scored by YouCam AI Skin Analysis${url ? ' · ' + url : ''}`, W / 2, H - pad + 10);
  ctx.textAlign = 'left';
  return c;
}

// Native share sheet with the PNG, or a download where that is not supported.
export async function shareCard(canvas, filename = 'puolisko.png') {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Puolisko', text: 'Beauty vs Beast, judged by skin AI.' });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}

export const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);

function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pill(ctx, text, x, y, color, alignRight) {
  ctx.font = text === 'BEAST' ? `42px ${DISPLAY}` : `700 34px ${ROUND}`;
  const w = ctx.measureText(text).width + 44;
  const left = alignRight ? x - w : x;
  roundRect(ctx, left + 4, y + 4, w, 58, 29);
  ctx.fillStyle = SHADOW;
  ctx.fill();
  roundRect(ctx, left, y, w, 58, 29);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = SHADOW;
  ctx.stroke();
  ctx.fillStyle = '#1a0b22';
  ctx.textAlign = 'left';
  ctx.fillText(text, left + 22, y + 42);
}

// Text with a hard offset shadow, the app's sticker look.
function shadowText(ctx, text, x, y, fill, d) {
  ctx.fillStyle = SHADOW;
  ctx.fillText(text, x + d, y + d);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function moon(ctx, x, y, r) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.shadowColor = 'rgba(255, 200, 110, .6)';
  ctx.shadowBlur = 90;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff7dc');
  g.addColorStop(0.6, '#ffe6a6');
  g.addColorStop(1, '#f2c46b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function bat(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s * 1.6, s * 1.6);
  ctx.translate(-32, -15);
  ctx.fillStyle = SHADOW;
  ctx.fill(new Path2D(BAT));
  ctx.restore();
}
