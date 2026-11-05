import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  NgZone,
  ViewChild,
  inject
} from '@angular/core';
import { GestureFrameSnapshot, ScepterSettings } from '../../core/models/gesture.model';
import { HandLandmarks } from '../../core/models/landmark.model';
import { SnapPosition } from '../../core/models/snap-action.model';
import { WaveViewModelStore } from '../../core/services/wave-view-model.store';

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Pinky & Palm
];

const FINGERTIP_INDICES = new Set([4, 8, 12, 16, 20]);

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

@Component({
  selector: 'app-hud-overlay',
  standalone: true,
  template: `
    <canvas #hudCanvas class="hud-canvas" aria-hidden="true"></canvas>
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 10;
    }
    .hud-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HudOverlayComponent implements AfterViewInit {
  @ViewChild('hudCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() frame?: GestureFrameSnapshot;
  @Input() settings?: ScepterSettings;
  @Input() simulationMode?: boolean;

  private readonly store = inject(WaveViewModelStore);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private trail: TrailPoint[] = [];
  private reducedMotion = false;
  private cycleBannerText: string | null = null;
  private cycleBannerUntilMs = 0;

  // Resolved theme colors from CSS custom properties
  private goldColor = 'oklch(0.78 0.16 75)';
  private goldBrightColor = 'oklch(0.86 0.18 80)';
  private armedColor = 'oklch(0.78 0.17 155)';
  private idleColor = 'oklch(0.65 0.04 250)';
  private bgColor = 'oklch(0.09 0.015 265)';

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    this.readThemeTokens();

    this.ngZone.runOutsideAngular(() => {
      this.syncCanvasSize();

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
        this.resizeObserver.observe(canvas);
      }

      const loop = (nowMs: number) => {
        this.renderFrame(nowMs);
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    });

    this.destroyRef.onDestroy(() => {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.resizeObserver?.disconnect();
    });
  }

  private readThemeTokens(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const style = getComputedStyle(document.documentElement);
    const read = (prop: string, fallback: string) =>
      style.getPropertyValue(prop).trim() || fallback;
    this.goldColor = read('--gold', this.goldColor);
    this.goldBrightColor = read('--gold-bright', this.goldBrightColor);
    this.armedColor = read('--armed', this.armedColor);
    this.idleColor = read('--idle', this.idleColor);
    this.bgColor = read('--background', this.bgColor);
  }

  private syncCanvasSize(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ownerWin = canvas.ownerDocument.defaultView || window;
    const dpr = Math.min(ownerWin.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }

  private renderFrame(nowMs: number): void {
    if (!this.ctx || !this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const ownerWin = canvas.ownerDocument.defaultView || window;
    const dpr = Math.min(ownerWin.devicePixelRatio || 1, 2);

    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    const frame = this.frame ?? this.store.latestFrame;
    const settings = this.settings ?? this.store.settings();

    if (frame.cycleIssued) {
      this.cycleBannerText = 'SWIPE UP · NEXT WINDOW';
      this.cycleBannerUntilMs = nowMs + 900;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // 1. Subtle spatial camera frame boundary matching reference HUD
    ctx.save();
    ctx.strokeStyle = 'oklch(0.78 0.16 75 / 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
    ctx.restore();

    // 2. Edge snap zones (translucent panels + pulse when armed)
    this.drawEdgeZones(ctx, w, h, frame, settings, nowMs);

    // 3. Ghost preview rectangle + Held-window title label
    const activePreviewZone =
      frame.armedZone ?? (frame.isPinching ? frame.hoveredZone : null);
    if (activePreviewZone) {
      this.drawGhostPreview(
        ctx,
        w,
        h,
        activePreviewZone,
        !!frame.armedZone,
        settings
      );
    }

    // 4. 21-landmark hand skeleton(s) with palm glow & fingertip highlights
    for (const hand of frame.handsMirrored) {
      this.drawHandSkeleton(
        ctx,
        w,
        h,
        hand,
        frame.isPinching,
        !!frame.isScrolling
      );
    }

    // 5. Cursor trail, tightening pinch ring, V-sign scroll indicator, and floating state pill
    if (frame.cursor) {
      this.drawCursorAndHudIndicators(ctx, w, h, frame, nowMs);
    } else {
      this.trail = [];
    }

    // 6. Wave-cycle toast banner if recently triggered
    if (this.cycleBannerText && nowMs < this.cycleBannerUntilMs) {
      const alpha = Math.min(1, (this.cycleBannerUntilMs - nowMs) / 300);
      ctx.save();
      ctx.globalAlpha = alpha;
      const bw = 240;
      const bh = 34;
      const bx = (w - bw) / 2;
      const by = h * 0.16;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 999);
      ctx.fillStyle = 'oklch(0.11 0.02 265 / 0.92)';
      ctx.strokeStyle = this.goldBrightColor;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.goldBrightColor;
      ctx.fillText(this.cycleBannerText, w / 2, by + bh / 2);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawEdgeZones(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    frame: GestureFrameSnapshot,
    settings: ScepterSettings,
    nowMs: number
  ): void {
    const z = settings.edgeZoneSize;
    const zoneW = w * z;
    const zoneH = h * z;
    const pulse = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(nowMs * 0.01);

    const zones: {
      id: SnapPosition;
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
    }[] = [
      {
        id: 'left',
        x: 10,
        y: zoneH + 10,
        width: zoneW - 14,
        height: h - zoneH * 2 - 20,
        label: 'SNAP LEFT'
      },
      {
        id: 'right',
        x: w - zoneW + 4,
        y: zoneH + 10,
        width: zoneW - 14,
        height: h - zoneH * 2 - 20,
        label: 'SNAP RIGHT'
      },
      {
        id: 'top',
        x: zoneW + 10,
        y: 10,
        width: w - zoneW * 2 - 20,
        height: zoneH - 14,
        label: 'MAXIMIZE'
      }
    ];

    if (settings.enableCorners) {
      zones.push(
        {
          id: 'topLeft',
          x: 10,
          y: 10,
          width: zoneW - 14,
          height: zoneH - 14,
          label: 'TOP-LEFT'
        },
        {
          id: 'topRight',
          x: w - zoneW + 4,
          y: 10,
          width: zoneW - 14,
          height: zoneH - 14,
          label: 'TOP-RIGHT'
        },
        {
          id: 'bottomLeft',
          x: 10,
          y: h - zoneH + 4,
          width: zoneW - 14,
          height: zoneH - 14,
          label: 'BTM-LEFT'
        },
        {
          id: 'bottomRight',
          x: w - zoneW + 4,
          y: h - zoneH + 4,
          width: zoneW - 14,
          height: zoneH - 14,
          label: 'BTM-RIGHT'
        }
      );
    }

    for (const zone of zones) {
      if (zone.width <= 0 || zone.height <= 0) continue;

      const isHovered = frame.hoveredZone === zone.id;
      const isArmed = frame.armedZone === zone.id;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(zone.x, zone.y, zone.width, zone.height, 14);

      if (isArmed) {
        const alpha = 0.18 + 0.1 * pulse;
        ctx.fillStyle = `oklch(0.78 0.17 155 / ${alpha.toFixed(3)})`;
        ctx.strokeStyle = this.armedColor;
        ctx.lineWidth = 2;
      } else if (isHovered) {
        ctx.fillStyle = frame.isPinching
          ? 'oklch(0.78 0.16 75 / 0.14)'
          : 'oklch(0.78 0.16 75 / 0.06)';
        ctx.strokeStyle = frame.isPinching
          ? this.goldBrightColor
          : 'oklch(0.78 0.16 75 / 0.35)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.fillStyle = 'oklch(0.11 0.02 265 / 0.22)';
        ctx.strokeStyle = 'oklch(0.78 0.16 75 / 0.14)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 7]);
      }

      ctx.fill();
      ctx.stroke();

      // Zone label
      ctx.setLineDash([]);
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isArmed
        ? this.armedColor
        : isHovered
          ? this.goldBrightColor
          : 'oklch(0.72 0.03 255 / 0.42)';
      ctx.fillText(zone.label, zone.x + zone.width / 2, zone.y + zone.height / 2);

      // Dwell progress bar when dwelling in zone during grab
      if (isHovered && frame.isPinching && !isArmed && frame.dwellProgress > 0) {
        const barW = Math.min(76, zone.width - 16);
        const barX = zone.x + (zone.width - barW) / 2;
        const barY = zone.y + zone.height / 2 + 12;
        ctx.fillStyle = 'oklch(0.97 0.01 85 / 0.15)';
        ctx.fillRect(barX, barY, barW, 3);
        ctx.fillStyle = this.goldBrightColor;
        ctx.fillRect(barX, barY, barW * frame.dwellProgress, 3);
      }

      ctx.restore();
    }
  }

  private drawGhostPreview(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    zone: SnapPosition,
    isArmed: boolean,
    settings: ScepterSettings
  ): void {
    const ratio = settings.snapRatio;
    const pad = 16;
    let gx = pad;
    let gy = pad;
    let gw = w - pad * 2;
    let gh = h - pad * 2;

    switch (zone) {
      case 'left':
        gw = (w - pad * 2) * ratio;
        break;
      case 'right':
        gw = (w - pad * 2) * ratio;
        gx = w - pad - gw;
        break;
      case 'top':
      case 'nextMonitor':
        break;
      case 'topLeft':
        gw = (w - pad * 2) * ratio;
        gh = (h - pad * 2) * 0.5;
        break;
      case 'topRight':
        gw = (w - pad * 2) * ratio;
        gx = w - pad - gw;
        gh = (h - pad * 2) * 0.5;
        break;
      case 'bottomLeft':
        gw = (w - pad * 2) * ratio;
        gh = (h - pad * 2) * 0.5;
        gy = h - pad - gh;
        break;
      case 'bottomRight':
        gw = (w - pad * 2) * ratio;
        gx = w - pad - gw;
        gh = (h - pad * 2) * 0.5;
        gy = h - pad - gh;
        break;
    }

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 18);
    ctx.fillStyle = isArmed
      ? 'oklch(0.78 0.17 155 / 0.12)'
      : 'oklch(0.78 0.16 75 / 0.07)';
    ctx.strokeStyle = isArmed ? this.armedColor : this.goldBrightColor;
    ctx.lineWidth = isArmed ? 2.2 : 1.5;
    if (!isArmed) {
      ctx.setLineDash([8, 6]);
    }
    ctx.fill();
    ctx.stroke();

    // Ghost badge & held-window label in center of preview rectangle
    ctx.setLineDash([]);
    const centerX = gx + gw / 2;
    const centerY = gy + gh / 2;
    const heldTitle = this.store.grabbedWindowTitle() || 'Active Window';
    const truncatedTitle =
      heldTitle.length > 36 ? heldTitle.slice(0, 35) + '…' : heldTitle;

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isArmed ? this.armedColor : this.goldBrightColor;
    const badgeText = isArmed
      ? `ARMED · RELEASE TO SNAP (${this.store.formatZoneName(zone)})`
      : `HOLD TO ARM · ${this.store.formatZoneName(zone)}`;
    ctx.fillText(badgeText, centerX, centerY - 9);

    ctx.font = '500 12px "Space Grotesk Variable", sans-serif';
    ctx.fillStyle = 'oklch(0.97 0.01 85 / 0.85)';
    ctx.fillText(truncatedTitle, centerX, centerY + 11);

    ctx.restore();
  }

  private drawHandSkeleton(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    hand: HandLandmarks,
    isPinching: boolean,
    isScrolling: boolean
  ): void {
    if (hand.length < 21) return;
    ctx.save();

    // 1. Soft radial gold glow at palm center (landmark #9) matching reference HUD
    const palm = hand[9];
    if (palm) {
      const px = palm.x * w;
      const py = palm.y * h;
      const palmGrad = ctx.createRadialGradient(px, py, 4, px, py, 90);
      palmGrad.addColorStop(
        0,
        isScrolling
          ? 'oklch(0.78 0.17 155 / 0.24)'
          : 'oklch(0.78 0.16 75 / 0.22)'
      );
      palmGrad.addColorStop(1, 'oklch(0.78 0.16 75 / 0)');
      ctx.fillStyle = palmGrad;
      ctx.beginPath();
      ctx.arc(px, py, 90, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Hand bones
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = isScrolling
      ? 'oklch(0.78 0.17 155 / 0.68)'
      : isPinching
        ? 'oklch(0.86 0.18 80 / 0.72)'
        : 'oklch(0.78 0.16 75 / 0.45)';

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const a = hand[startIdx];
      const b = hand[endIdx];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    }

    // 3. Highlighted gesture line: V-sign tips (8 & 12) when scrolling, or Pinch tips (4 & 8)
    const thumb = hand[4];
    const index = hand[8];
    const middle = hand[12];
    if (isScrolling && index && middle) {
      ctx.beginPath();
      ctx.moveTo(index.x * w, index.y * h);
      ctx.lineTo(middle.x * w, middle.y * h);
      ctx.strokeStyle = this.armedColor;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (thumb && index) {
      ctx.beginPath();
      ctx.moveTo(thumb.x * w, thumb.y * h);
      ctx.lineTo(index.x * w, index.y * h);
      ctx.strokeStyle = isPinching
        ? this.goldBrightColor
        : 'oklch(0.78 0.16 75 / 0.75)';
      ctx.lineWidth = isPinching ? 2.8 : 1.4;
      ctx.stroke();
    }

    // 4. Landmark joints (highlight index #8 and middle #12 fingertips during V-sign scroll)
    for (let i = 0; i < hand.length; i++) {
      const lm = hand[i];
      const lx = lm.x * w;
      const ly = lm.y * h;
      const isScrollTip = isScrolling && (i === 8 || i === 12);
      const isPinchTip = !isScrolling && (i === 4 || i === 8);
      const isTip = FINGERTIP_INDICES.has(i);

      if (isScrollTip) {
        const tipGlow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 16);
        tipGlow.addColorStop(0, 'oklch(0.78 0.17 155 / 0.65)');
        tipGlow.addColorStop(1, 'oklch(0.78 0.17 155 / 0)');
        ctx.fillStyle = tipGlow;
        ctx.beginPath();
        ctx.arc(lx, ly, 16, 0, Math.PI * 2);
        ctx.fill();
      } else if (isTip) {
        const tipGlow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 11);
        tipGlow.addColorStop(0, 'oklch(0.86 0.18 80 / 0.45)');
        tipGlow.addColorStop(1, 'oklch(0.86 0.18 80 / 0)');
        ctx.fillStyle = tipGlow;
        ctx.beginPath();
        ctx.arc(lx, ly, 11, 0, Math.PI * 2);
        ctx.fill();
      }

      const radius = isScrollTip ? 6 : isPinchTip ? 5 : isTip ? 4 : 2.6;
      ctx.beginPath();
      ctx.arc(lx, ly, radius, 0, Math.PI * 2);
      ctx.fillStyle = isScrollTip
        ? this.armedColor
        : isTip
          ? this.goldBrightColor
          : this.goldColor;
      ctx.fill();
    }

    ctx.restore();
  }

  private drawCursorAndHudIndicators(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    frame: GestureFrameSnapshot,
    nowMs: number
  ): void {
    const cursor = frame.cursor!;
    const cx = cursor.x * w;
    const cy = cursor.y * h;
    const isPinching = frame.isPinching;
    const isScrolling = !!frame.isScrolling;
    const isArmed = frame.armedZone !== null;
    const scrollDelta = frame.scrollDelta ?? 0;

    // 1. Cursor motion trail (respecting prefers-reduced-motion)
    if (!this.reducedMotion) {
      this.trail.push({ x: cx, y: cy, t: nowMs });
      while (this.trail.length > 14 || (this.trail[0] && nowMs - this.trail[0].t > 260)) {
        this.trail.shift();
      }
      if (this.trail.length > 1) {
        for (let i = 1; i < this.trail.length; i++) {
          const p0 = this.trail[i - 1];
          const p1 = this.trail[i];
          const ratio = i / this.trail.length;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = isScrolling
            ? `oklch(0.78 0.17 155 / ${(ratio * 0.45).toFixed(3)})`
            : `oklch(0.82 0.16 78 / ${(ratio * 0.45).toFixed(3)})`;
          ctx.lineWidth = ratio * 5;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }
    }

    ctx.save();

    const activeAccent =
      isScrolling || isArmed
        ? this.armedColor
        : isPinching
          ? this.goldBrightColor
          : this.goldColor;

    // 2. Soft radial cursor halo
    const haloRadius = isPinching || isScrolling ? 38 : 28;
    const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, haloRadius);
    halo.addColorStop(
      0,
      isScrolling || isArmed
        ? 'oklch(0.78 0.17 155 / 0.42)'
        : 'oklch(0.82 0.16 78 / 0.38)'
    );
    halo.addColorStop(1, 'oklch(0.82 0.16 78 / 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. V-Sign Scroll Mode Indicator: Ring + Up/Down Directional Arrow
    if (isScrolling) {
      const intensity = Math.min(1, Math.abs(scrollDelta) / 400);
      const radius = 22 + intensity * 8;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = this.armedColor;
      ctx.lineWidth = 2.2 + intensity * 1.3;
      ctx.stroke();

      // Up/Down directional arrow at cursor with intensity proportional to scroll speed
      const arrowLen = 11 + intensity * 13;
      const dir = scrollDelta >= 0 ? -1 : 1; // -1 = up on canvas, +1 = down on canvas
      ctx.beginPath();
      if (scrollDelta === 0) {
        ctx.moveTo(cx, cy - 10);
        ctx.lineTo(cx, cy + 10);
        ctx.moveTo(cx - 4.5, cy - 5.5);
        ctx.lineTo(cx, cy - 10);
        ctx.lineTo(cx + 4.5, cy - 5.5);
        ctx.moveTo(cx - 4.5, cy + 5.5);
        ctx.lineTo(cx, cy + 10);
        ctx.lineTo(cx + 4.5, cy + 5.5);
      } else {
        const tipY = cy + dir * arrowLen;
        const tailY = cy - dir * (arrowLen * 0.45);
        ctx.moveTo(cx, tailY);
        ctx.lineTo(cx, tipY);
        ctx.moveTo(cx - 5.5, tipY - dir * 6.5);
        ctx.lineTo(cx, tipY);
        ctx.lineTo(cx + 5.5, tipY - dir * 6.5);
      }
      ctx.strokeStyle = this.goldBrightColor;
      ctx.lineWidth = 2.2 + intensity;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      const pillText =
        scrollDelta === 0
          ? 'SCROLL'
          : scrollDelta > 0
            ? `SCROLL ↑ +${scrollDelta}`
            : `SCROLL ↓ ${scrollDelta}`;
      this.drawFloatingCursorPill(ctx, cx, cy, pillText, this.armedColor);
      ctx.restore();
      return;
    }

    // 4. Standard Hover / Pinch / Drag Cursor Ring & Progress Arc
    const progress = frame.pinchProgress;
    const ringRadius = 26 - progress * 11;

    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = activeAccent;
    ctx.lineWidth = isPinching ? 2.5 : 1.75;
    ctx.stroke();

    // Progress arc around cursor when pinching or dwelling
    const arcProgress = frame.dwellProgress > 0 ? frame.dwellProgress : progress;
    if (arcProgress > 0.05) {
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        ringRadius + 5,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, arcProgress)
      );
      ctx.strokeStyle = isArmed ? this.armedColor : this.goldBrightColor;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Center cursor dot
    ctx.beginPath();
    ctx.arc(cx, cy, isPinching ? 5.5 : 3.8, 0, Math.PI * 2);
    ctx.fillStyle = activeAccent;
    ctx.fill();

    // Floating state pill next to cursor when grabbing/dragging/armed
    if (frame.state === 'GRABBING' || frame.state === 'DRAGGING') {
      const held = this.store.grabbedWindowTitle();
      const shortHeld =
        held && held.length > 18 ? held.slice(0, 17) + '…' : held;
      const label = frame.armedZone
        ? `ARMED · ${this.store.formatZoneName(frame.armedZone)}`
        : shortHeld
          ? `HOLD · ${shortHeld}`
          : 'GRABBING';
      this.drawFloatingCursorPill(ctx, cx, cy, label, activeAccent);
    }

    ctx.restore();
  }

  private drawFloatingCursorPill(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    text: string,
    accentColor: string
  ): void {
    ctx.save();
    ctx.font = '600 11px "JetBrains Mono", monospace';
    const padX = 8;
    const pillH = 22;
    const textW = ctx.measureText(text).width;
    const pillW = textW + padX * 2;
    const px = cx + 22;
    const py = cy - 28;

    ctx.fillStyle = 'oklch(0.11 0.02 265 / 0.88)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(px, py, pillW, pillH, 999);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px + padX, py + pillH / 2);
    ctx.restore();
  }
}
