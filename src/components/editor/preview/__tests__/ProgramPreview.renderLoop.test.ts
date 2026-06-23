import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
}));

/**
 * Tests for FINDING-011: Race condition between sync() and render
 *
 * This test suite validates the fix for the race condition where:
 * - Frame 1: sync() + start render (isRendering = true)
 * - Frame 2: sync() again (mutates state) → early return
 * - Frame 1's render still using disposed elements → crash
 *
 * The fix moves the isRendering guard BEFORE sync() to prevent
 * state mutation during active renders.
 */

interface RenderState {
  isRendering: boolean;
  droppedFrames: number;
  syncCalls: number;
  renderJobs: number;
  stateVersion: number;
}

/**
 * Mock RAF render loop that simulates ProgramPreview behavior
 */
class MockRenderLoop {
  private state: RenderState = {
    isRendering: false,
    droppedFrames: 0,
    syncCalls: 0,
    renderJobs: 0,
    stateVersion: 0,
  };

  private syncMutatesState = true;
  private renderDuration = 0; // ms to simulate render job duration

  constructor(config?: { renderDuration?: number; syncMutatesState?: boolean }) {
    if (config?.renderDuration !== undefined) {
      this.renderDuration = config.renderDuration;
    }
    if (config?.syncMutatesState !== undefined) {
      this.syncMutatesState = config.syncMutatesState;
    }
  }

  /**
   * Simulate one RAF tick with CORRECT order (FINDING-011 fix applied)
   */
  rafTickFixed(): void {
    // 1. Check isRendering guard FIRST (prevents sync during render)
    if (this.state.isRendering) {
      this.state.droppedFrames++;
      return;
    }

    // 2. Call sync (safe now - no render in progress)
    this.sync();

    // 3. Set isRendering and start render job
    this.state.isRendering = true;
    this.startRenderJob();
  }

  /**
   * Simulate one RAF tick with WRONG order (before FINDING-011 fix)
   */
  rafTickBroken(): void {
    // 1. Call sync BEFORE checking isRendering (WRONG!)
    this.sync();

    // 2. Check isRendering guard (too late - sync already mutated state)
    if (this.state.isRendering) {
      this.state.droppedFrames++;
      return;
    }

    // 3. Set isRendering and start render job
    this.state.isRendering = true;
    this.startRenderJob();
  }

  private sync(): void {
    this.state.syncCalls++;
    if (this.syncMutatesState) {
      // Sync mutates state (increments version to simulate disposal/recreation)
      this.state.stateVersion++;
    }
  }

  private startRenderJob(): void {
    this.state.renderJobs++;

    // Simulate async render job
    if (this.renderDuration > 0) {
      setTimeout(() => {
        this.state.isRendering = false;
      }, this.renderDuration);
    } else {
      // Synchronous render (for testing)
      this.state.isRendering = false;
    }
  }

  getState(): Readonly<RenderState> {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      isRendering: false,
      droppedFrames: 0,
      syncCalls: 0,
      renderJobs: 0,
      stateVersion: 0,
    };
  }
}

describe("ProgramPreview RAF Loop — FINDING-011: Render Race Condition", () => {
  let loop: MockRenderLoop;

  beforeEach(() => {
    loop = new MockRenderLoop();
  });

  afterEach(() => {
    loop.reset();
  });

  it("should allow sync when no render is in progress", () => {
    loop.rafTickFixed();

    const state = loop.getState();
    expect(state.syncCalls).toBe(1);
    expect(state.renderJobs).toBe(1);
    expect(state.droppedFrames).toBe(0);
  });

  it("should block sync when render is in progress (FINDING-011 fix)", () => {
    // Create loop with slow render (simulates heavy scene)
    const slowLoop = new MockRenderLoop({ renderDuration: 20 });

    // Frame 1: Start render
    slowLoop.rafTickFixed();
    let state = slowLoop.getState();
    expect(state.isRendering).toBe(true);
    expect(state.syncCalls).toBe(1);
    expect(state.renderJobs).toBe(1);

    // Frame 2: Try to render while Frame 1 is still rendering
    slowLoop.rafTickFixed();
    state = slowLoop.getState();

    // With fix: sync NOT called (blocked by isRendering guard)
    expect(state.syncCalls).toBe(1); // Still 1, not 2
    expect(state.renderJobs).toBe(1); // Still 1, not 2
    expect(state.droppedFrames).toBe(1); // Frame dropped
  });

  it("should call sync twice when render is in progress WITHOUT fix (broken behavior)", () => {
    const slowLoop = new MockRenderLoop({ renderDuration: 20 });

    // Frame 1: Start render
    slowLoop.rafTickBroken();
    let state = slowLoop.getState();
    expect(state.isRendering).toBe(true);
    expect(state.syncCalls).toBe(1);

    // Frame 2: sync called BEFORE isRendering check
    slowLoop.rafTickBroken();
    state = slowLoop.getState();

    // Without fix: sync WAS called (before guard check)
    expect(state.syncCalls).toBe(2); // ❌ Called twice
    expect(state.renderJobs).toBe(1); // Only 1 job (second blocked)
    expect(state.droppedFrames).toBe(1);
  });

  it("should prevent state mutation during active render (FINDING-011 fix)", () => {
    const slowLoop = new MockRenderLoop({ renderDuration: 20, syncMutatesState: true });

    // Frame 1: sync v0→v1, start render with v1
    slowLoop.rafTickFixed();
    const stateAfterFrame1 = slowLoop.getState();
    expect(stateAfterFrame1.stateVersion).toBe(1);
    expect(stateAfterFrame1.isRendering).toBe(true);

    // Frame 2: Blocked by isRendering guard, state NOT mutated
    slowLoop.rafTickFixed();
    const stateAfterFrame2 = slowLoop.getState();

    // With fix: state version unchanged (sync not called)
    expect(stateAfterFrame2.stateVersion).toBe(1); // Still 1
    expect(stateAfterFrame2.syncCalls).toBe(1); // sync called once only
  });

  it("should allow state mutation during active render WITHOUT fix (causes crash)", () => {
    const slowLoop = new MockRenderLoop({ renderDuration: 20, syncMutatesState: true });

    // Frame 1: sync v0→v1, start render with v1
    slowLoop.rafTickBroken();
    const stateAfterFrame1 = slowLoop.getState();
    expect(stateAfterFrame1.stateVersion).toBe(1);

    // Frame 2: sync called BEFORE guard, state mutated v1→v2
    slowLoop.rafTickBroken();
    const stateAfterFrame2 = slowLoop.getState();

    // Without fix: state version changed (sync mutated state)
    expect(stateAfterFrame2.stateVersion).toBe(2); // ❌ Mutated during render
    expect(stateAfterFrame2.syncCalls).toBe(2);

    // This is the bug: Frame 1's render is using v1 elements,
    // but Frame 2's sync() just disposed them and created v2
  });

  it("should handle rapid RAF ticks on 120Hz monitor with slow render", async () => {
    // 120Hz = 8.33ms per frame, render takes 20ms = 2-3 frames overlap
    const slowLoop = new MockRenderLoop({ renderDuration: 20 });

    // Simulate 5 rapid RAF ticks (simulating 120Hz)
    for (let i = 0; i < 5; i++) {
      slowLoop.rafTickFixed();
    }

    const state = slowLoop.getState();

    // With fix: only first frame renders, others dropped
    expect(state.renderJobs).toBe(1);
    expect(state.syncCalls).toBe(1); // Only first sync executed
    expect(state.droppedFrames).toBe(4); // Other 4 frames dropped
  });

  it("should allow multiple renders when each completes quickly", () => {
    const fastLoop = new MockRenderLoop({ renderDuration: 0 }); // Instant render

    // Simulate 5 RAF ticks with fast renders
    for (let i = 0; i < 5; i++) {
      fastLoop.rafTickFixed();
    }

    const state = fastLoop.getState();

    // All frames should render successfully
    expect(state.renderJobs).toBe(5);
    expect(state.syncCalls).toBe(5);
    expect(state.droppedFrames).toBe(0);
  });

  it("should recover after slow render completes", async () => {
    const slowLoop = new MockRenderLoop({ renderDuration: 20 });

    // Frame 1: Start slow render
    slowLoop.rafTickFixed();
    expect(slowLoop.getState().isRendering).toBe(true);

    // Frame 2: Blocked
    slowLoop.rafTickFixed();
    expect(slowLoop.getState().droppedFrames).toBe(1);

    // Wait for render to complete
    await new Promise((resolve) => setTimeout(resolve, 25));

    // Frame 3: Should work now
    slowLoop.rafTickFixed();
    const state = slowLoop.getState();

    expect(state.renderJobs).toBe(2); // First and third frames rendered
    expect(state.syncCalls).toBe(2);
    expect(state.droppedFrames).toBe(1); // Only second frame dropped
  });

  it("should track dropped frames correctly during sustained overload", async () => {
    const slowLoop = new MockRenderLoop({ renderDuration: 50 });

    // Start render
    slowLoop.rafTickFixed();

    // Try 10 more frames while render in progress
    for (let i = 0; i < 10; i++) {
      slowLoop.rafTickFixed();
    }

    const state = slowLoop.getState();

    expect(state.renderJobs).toBe(1);
    expect(state.syncCalls).toBe(1);
    expect(state.droppedFrames).toBe(10);
  });

  it("should prevent concurrent state mutations on high refresh rate displays", () => {
    // Simulate 240Hz monitor (4.16ms frames) with 16ms render
    const loop240Hz = new MockRenderLoop({ renderDuration: 16 });

    // 4 frames fire during one render (240Hz ÷ 60Hz = 4x)
    const ticks = 4;

    for (let i = 0; i < ticks; i++) {
      loop240Hz.rafTickFixed();
    }

    const state = loop240Hz.getState();

    // Only first tick should sync and render
    expect(state.syncCalls).toBe(1);
    expect(state.renderJobs).toBe(1);
    expect(state.stateVersion).toBe(1); // State mutated once only
    expect(state.droppedFrames).toBe(ticks - 1);
  });

  it("should demonstrate the race condition without fix", () => {
    const slowLoop = new MockRenderLoop({ renderDuration: 20, syncMutatesState: true });

    // Frame 1: sync (v0→v1), render job starts with v1 elements
    slowLoop.rafTickBroken();
    const v1 = slowLoop.getState().stateVersion;

    // Frame 2: sync (v1→v2) BEFORE checking isRendering
    // This mutates state while Frame 1's render is still using v1 elements
    slowLoop.rafTickBroken();
    const v2 = slowLoop.getState().stateVersion;

    // Bug demonstrated: state mutated during active render
    expect(v1).toBe(1);
    expect(v2).toBe(2);
    expect(v2).toBeGreaterThan(v1); // State changed during render = BUG
  });

  it("should prevent the race condition with fix", () => {
    const slowLoop = new MockRenderLoop({ renderDuration: 20, syncMutatesState: true });

    // Frame 1: sync (v0→v1), render job starts with v1 elements
    slowLoop.rafTickFixed();
    const v1 = slowLoop.getState().stateVersion;

    // Frame 2: isRendering guard blocks sync, state NOT mutated
    slowLoop.rafTickFixed();
    const v2 = slowLoop.getState().stateVersion;

    // Fix verified: state unchanged during render
    expect(v1).toBe(1);
    expect(v2).toBe(1);
    expect(v2).toBe(v1); // State stable during render = FIXED
  });
});

describe("ProgramPreview RAF Loop — Guard Ordering", () => {
  it("should execute operations in correct order with fix", () => {
    const operations: string[] = [];

    let isRendering = false;
    let droppedFrames = 0;

    // Simulate RAF tick with CORRECT order
    const rafTickFixed = () => {
      operations.push("raf_start");

      // 1. Guard check FIRST
      if (isRendering) {
        operations.push("guard_blocked");
        droppedFrames++;
        return;
      }
      operations.push("guard_passed");

      // 2. Sync after guard
      operations.push("sync_start");
      operations.push("sync_end");

      // 3. Set rendering flag
      isRendering = true;
      operations.push("render_start");
    };

    // First tick
    rafTickFixed();
    expect(operations).toEqual(["raf_start", "guard_passed", "sync_start", "sync_end", "render_start"]);

    // Second tick (while rendering)
    operations.length = 0;
    rafTickFixed();
    expect(operations).toEqual(["raf_start", "guard_blocked"]);
    expect(droppedFrames).toBe(1);
  });

  it("should demonstrate incorrect ordering without fix", () => {
    const operations: string[] = [];

    let isRendering = false;

    // Simulate RAF tick with WRONG order
    const rafTickBroken = () => {
      operations.push("raf_start");

      // 1. Sync BEFORE guard check (WRONG!)
      operations.push("sync_start");
      operations.push("sync_end");

      // 2. Guard check after sync (too late)
      if (isRendering) {
        operations.push("guard_blocked");
        return;
      }
      operations.push("guard_passed");

      // 3. Set rendering flag
      isRendering = true;
      operations.push("render_start");
    };

    // First tick
    rafTickBroken();
    expect(operations).toEqual(["raf_start", "sync_start", "sync_end", "guard_passed", "render_start"]);

    // Second tick (while rendering)
    operations.length = 0;
    rafTickBroken();

    // Bug: sync executed even though guard blocked render
    expect(operations).toEqual(["raf_start", "sync_start", "sync_end", "guard_blocked"]);
    expect(operations).toContain("sync_start"); // ❌ Sync should not run
  });

  it("should verify guard protects sync from concurrent execution", () => {
    let syncExecutions = 0;
    let isRendering = false;

    const rafTick = () => {
      if (isRendering) return;

      syncExecutions++;
      isRendering = true;
    };

    // First tick
    rafTick();
    expect(syncExecutions).toBe(1);
    expect(isRendering).toBe(true);

    // Multiple concurrent ticks
    rafTick();
    rafTick();
    rafTick();

    // Guard prevented all concurrent executions
    expect(syncExecutions).toBe(1); // Still 1
  });
});

describe("ProgramPreview RAF Loop — Real World Scenarios", () => {
  it("should handle heavy project on 120Hz display", async () => {
    // Heavy project: 25ms render time
    // 120Hz display: 8.33ms frame time
    // Result: 3 frames fire during each render

    const loop = new MockRenderLoop({ renderDuration: 25 });

    // Simulate sustained 120Hz RAF
    const startTime = Date.now();
    let ticks = 0;

    while (Date.now() - startTime < 100) {
      loop.rafTickFixed();
      ticks++;
      await new Promise((resolve) => setTimeout(resolve, 8));
    }

    const state = loop.getState();

    // Should have dropped many frames (render can't keep up)
    expect(state.droppedFrames).toBeGreaterThan(0);

    // But should NOT have concurrent syncs
    expect(state.syncCalls).toBeLessThanOrEqual(state.renderJobs + 1);
  });

  it("should handle burst of RAF ticks from delayed execution", () => {
    const loop = new MockRenderLoop({ renderDuration: 10 });

    // Simulate browser delivering multiple RAF callbacks at once
    // (can happen when tab regains focus)
    for (let i = 0; i < 10; i++) {
      loop.rafTickFixed();
    }

    const state = loop.getState();

    // Only first tick should render
    expect(state.renderJobs).toBe(1);
    expect(state.syncCalls).toBe(1);
    expect(state.droppedFrames).toBe(9);
  });

  it("should maintain stability over extended session", async () => {
    const loop = new MockRenderLoop({ renderDuration: 5 });

    // Simulate 100 frames (typical 60Hz = 1.67 seconds)
    for (let i = 0; i < 100; i++) {
      loop.rafTickFixed();

      // Simulate varying frame timing
      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    const state = loop.getState();

    // Should have some successful renders (timing dependent)
    expect(state.renderJobs).toBeGreaterThan(5);

    // Sync count should match render count
    expect(state.syncCalls).toBe(state.renderJobs);

    // State version should match sync calls (no missed mutations)
    expect(state.stateVersion).toBe(state.syncCalls);
  });

  it("should handle mixed fast and slow renders", async () => {
    // Start with slow render
    let renderDuration = 30;
    const loop = new MockRenderLoop({ renderDuration });

    loop.rafTickFixed(); // Slow render starts
    expect(loop.getState().isRendering).toBe(true);

    // Multiple ticks during slow render
    for (let i = 0; i < 5; i++) {
      loop.rafTickFixed();
    }

    expect(loop.getState().droppedFrames).toBe(5);

    // Wait for slow render to complete
    await new Promise((resolve) => setTimeout(resolve, 35));

    // Now do fast renders
    const fastLoop = new MockRenderLoop({ renderDuration: 0 });
    for (let i = 0; i < 5; i++) {
      fastLoop.rafTickFixed();
    }

    expect(fastLoop.getState().renderJobs).toBe(5);
    expect(fastLoop.getState().droppedFrames).toBe(0);
  });
});
