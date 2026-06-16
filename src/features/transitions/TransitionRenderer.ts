/**
 * Transition Renderer
 * Handles transitions between clips on timeline
 */

export type TransitionType = "fade" | "dissolve";

export class TransitionRenderer {
  static render(ctx: CanvasRenderingContext2D, fromCanvas: HTMLCanvasElement, toCanvas: HTMLCanvasElement, transitionType: TransitionType, params: Record<string, any>, progress: number): void {
    const { width, height } = ctx.canvas;

    switch (transitionType) {
      case "fade":
      case "dissolve":
        // Draw from frame
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(fromCanvas, 0, 0, width, height);

        // Draw to frame
        ctx.globalAlpha = progress;
        ctx.drawImage(toCanvas, 0, 0, width, height);

        // Reset alpha
        ctx.globalAlpha = 1;
        break;

      default:
        console.warn(`[TransitionRenderer] Unknown transition type: ${transitionType}`);
        // Default to dissolve
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(fromCanvas, 0, 0, width, height);
        ctx.globalAlpha = progress;
        ctx.drawImage(toCanvas, 0, 0, width, height);
        ctx.globalAlpha = 1;
    }
  }
}
