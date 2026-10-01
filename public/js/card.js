// Share card, rendered client side. The player posts it with their own thumb; we never hold it.

export const FORMATS = { feed: [1080, 1350], story: [1080, 1920] };

const BEAUTY = '#ffcf6b';
const BEAST = '#7dff6b';

// heat: mirrored heatmap canvas (with or without face). r: result from game.result().
// beautyCheek: 'left' | 'right'. In the mirrored image the player's left cheek is on screen left.
export function renderCard(heat, r, beautyCheek, { format = 'feed', url = '' } = {}) {
  const [W, H] = FORMATS[format];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a0f24');
  g.addColorStop(1, '#07060a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const pad = 60;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f3eefa';
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText('PUOLISKO', pad, pad + 40);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#b9a7cf';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(r.title, W - pad, pad + 40);
  ctx.textAlign = 'left';

  // Face / heatmap area
  const top = pad + 80;
  const scoreBlock = 430;
  const imgH = H - top - scoreBlock - pad;
  const imgW = W - pad * 2;
  roundRect(ctx, pad, top, imgW, imgH, 36);
  ctx.save();
  ctx.clip();
  cover(ctx, heat, pad, top, imgW, imgH);
  ctx.restore();

  const beautyLeft = beautyCheek === 'left';
  pill(ctx, 'BEAUTY', beautyLeft ? pad + 28 : W - pad - 28, top + 28, BEAUTY, !beautyLeft);
  pill(ctx, 'BEAST', beautyLeft ? W - pad - 28 : pad + 28, top + 28, BEAST, beautyLeft);

  // Scores
  const y0 = top + imgH + 70;
  const col = (x, label, value, color, align) => {
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.fillText(label, x, y0);
    ctx.font = '800 96px system-ui, sans-serif';
    ctx.fillText(value.toFixed(1), x, y0 + 100);
  };
  col(pad, beautyLeft ? 'BEAUTY' : 'BEAST', beautyLeft ? r.beauty : r.beast, beautyLeft ? BEAUTY : BEAST, 'left');
  col(W - pad, beautyLeft ? 'BEAST' : 'BEAUTY', beautyLeft ? r.beast : r.beauty, beautyLeft ? BEAST : BEAUTY, 'right');

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f3eefa';
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText('GAP', W / 2, y0);
  ctx.font = '900 150px system-ui, sans-serif';
  ctx.fillText(signed(r.gap), W / 2, y0 + 150);

  ctx.fillStyle = '#8f80a3';
  ctx.font = '500 28px system-ui, sans-serif';
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
  ctx.font = '800 34px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 44;
  const left = alignRight ? x - w : x;
  ctx.fillStyle = color;
  roundRect(ctx, left, y, w, 58, 29);
  ctx.fill();
  ctx.fillStyle = '#120c18';
  ctx.textAlign = 'left';
  ctx.fillText(text, left + 22, y + 42);
}
