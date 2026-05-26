import { TextEffectDefinition } from "./types";
import { applyFontConfig } from "./helpers";

/**
 * Procedural Canvas 2D Gold Gradient & Yellow Neon Glow Premium Text Renderer with Sparkle Particles.
 * Draws triple-layered radiating yellow neon glows (WebKit-proof), crisp black outside stroke,
 * vertical gold-yellow linear gradient body, and deterministic 4-pointed star sparkles.
 */
export const renderGlowYellowSparkles = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  effect: TextEffectDefinition,
  fontSize: number,
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  lines: string[],
  lineHeightPx: number,
  textWidth: number,
  textHeight: number
) => {
  applyFontConfig(ctx, effect.font, fontSize);

  // 1. Draw Organic Radiating Neon Glow Layers (Back-to-Front blurs to bypass WebKit shadow bounds clipping)
  const glowColor = "#FFFF00";
  const glowBlurs = [75, 35, 15];
  const glowAlphas = [0.4, 0.8, 1.0];

  glowBlurs.forEach((blur, idx) => {
    ctx.save();
    ctx.globalAlpha = glowAlphas[idx];
    if (blur > 0) {
      (ctx as any).filter = `blur(${blur}px)`;
    }
    
    // Draw wide strokes and fills to grow the bloom organically from the outline shape
    lines.forEach((line, index) => {
      const lineY = y - ((lines.length - 1) * lineHeightPx) / 2 + index * lineHeightPx;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 12; // Outlined glow spread
      ctx.lineJoin = "round";
      ctx.strokeText(line, x, lineY);
      
      ctx.fillStyle = glowColor;
      ctx.fillText(line, x, lineY);
    });
    ctx.restore();
  });

  // 2. Draw Crisp Outside Stroke (protective black outline)
  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1.0;
  lines.forEach((line, index) => {
    const lineY = y - ((lines.length - 1) * lineHeightPx) / 2 + index * lineHeightPx;
    ctx.strokeText(line, x, lineY);
  });
  ctx.restore();

  // 3. Draw Vertical Gold Linear Gradient Text Body Fill
  ctx.save();
  const gradient = ctx.createLinearGradient(x - textWidth / 2, y - textHeight / 2, x - textWidth / 2, y + textHeight / 2);
  gradient.addColorStop(0, "#8B7500");   // Antique/Dark Gold
  gradient.addColorStop(0.5, "#FFD700"); // Rich Gold
  gradient.addColorStop(1, "#FFFF99");   // Champagne highlights
  ctx.fillStyle = gradient;
  
  lines.forEach((line, index) => {
    const lineY = y - ((lines.length - 1) * lineHeightPx) / 2 + index * lineHeightPx;
    ctx.fillText(line, x, lineY);
  });
  ctx.restore();

  // 4. Draw Delicate Sparkle Particles on Top
  if (effect.sparkles && effect.sparkles.enabled) {
    const config = effect.sparkles;
    // Tighter spread – sparkles cluster near and over the text, not at canvas edges
    const spreadX = textWidth * config.spread;
    const spreadY = textHeight * config.spread;

    // Deterministic pseudo-random for consistent sparkle positions across re-renders
    const seed = textWidth + textHeight;
    const random = (index: number) => {
      const v = Math.sin(seed + index * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };

    for (let i = 0; i < config.count; i++) {
      const sparkleX = x - spreadX / 2 + random(i * 2) * spreadX;
      const sparkleY = y - spreadY / 2 + random(i * 2 + 1) * spreadY;
      const size = config.minSize + random(i * 3) * (config.maxSize - config.minSize);
      const sparkleAlpha = 0.5 + random(i * 4) * 0.5; // vary individual brightness

      drawSparkle(ctx, sparkleX, sparkleY, size, config.color, config.opacity * sparkleAlpha);
    }
  }
};

/**
 * Draws a delicate, photorealistic 4-pointed sparkle pinpoint of light.
 * - Hair-thin flare beams (main cross + shorter diagonals)
 * - Soft radial glow bloom behind the sparkle
 * - Tiny bright center dot
 */
function drawSparkle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;

  // --- Soft radial glow bloom behind the sparkle ---
  const bloomRadius = size * 2.5;
  const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, bloomRadius);
  bloom.addColorStop(0, color);
  bloom.addColorStop(0.3, color + "66"); // ~40% alpha
  bloom.addColorStop(1, color + "00"); // fully transparent
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(0, 0, bloomRadius, 0, Math.PI * 2);
  ctx.fill();

  // --- Hair-thin flare beams (main cross) ---
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const beamWidth = Math.max(0.4, size * 0.12); // hair-thin

  // Vertical beam (slightly longer for natural 4-point star look)
  ctx.lineWidth = beamWidth;
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.1);
  ctx.lineTo(0, size * 1.1);
  ctx.stroke();

  // Horizontal beam
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();

  // --- Shorter, even thinner diagonal flares ---
  const diagLen = size * 0.45;
  const diagWidth = Math.max(0.3, size * 0.08);
  ctx.lineWidth = diagWidth;

  ctx.beginPath();
  ctx.moveTo(-diagLen, -diagLen);
  ctx.lineTo(diagLen, diagLen);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(diagLen, -diagLen);
  ctx.lineTo(-diagLen, diagLen);
  ctx.stroke();

  // --- Bright center dot ---
  ctx.globalAlpha = Math.min(1, alpha * 1.3);
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.4, size * 0.15), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
