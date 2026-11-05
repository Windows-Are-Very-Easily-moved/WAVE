import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  ViewChild
} from '@angular/core';
import { GestureFrameSnapshot, ScepterSettings } from '../../core/models/gesture.model';
import { HandLandmarks } from '../../core/models/landmark.model';
import { SnapPosition } from '../../core/models/snap-action.model';

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Pinky & Palm
];

@Component({
  selector: 'app-hud-overlay',
  standalone: true,
  template: `
    <canvas #hudCanvas class="hud-canvas"></canvas>
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
export class HudOverlayComponent implements AfterViewInit, OnChanges {
  @ViewChild('hudCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input({ required: true }) frame!: GestureFrameSnapshot;
  @Input({ required: true }) settings!: ScepterSettings;
  @Input() simulationMode = false;

  private ctx: CanvasRenderingContext2D | null = null;
  private cycleBannerText: string | null = null;
  private cycleBannerUntilMs = 0;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.render();
  }

  ngOnChanges(): void {
    if (this.frame?.cycleIssued) {
      this.cycleBannerText = '⚡ SWIPE UP ↑ NEXT WINDOW';
      this.cycleBannerUntilMs = performance.now() + 900;
    }
    this.render();
  }

  private render(): void {
    if (!this.ctx || !this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const ownerWin = canvas.ownerDocument.defaultView || window;
    const dpr = ownerWin.devicePixelRatio || 1;

    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    if (!this.frame || !this.settings) {
      ctx.restore();
      return;
    }

    // 1. Draw edge snap zones (translucent panels + pulse when armed)
    this.drawEdgeZones(ctx, w, h);

    // 2. Draw ghost preview rectangle when a zone is hovered during grab/drag or armed
    const activePreviewZone =
      this.frame.armedZone ??
      (this.frame.isPinching ? this.frame.hoveredZone : null);

    if (activePreviewZone) {
      this.drawGhostPreview(ctx, w, h, activePreviewZone, !!this.frame.armedZone);
    }

    // 3. Draw 21-landmark hand skeleton(s)
    for (const hand of this.frame.handsMirrored) {
      this.drawHandSkeleton(ctx, w, h, hand, this.frame.isPinching, !!this.frame.isScrolling);
    }

    // 4. Draw glowing spatial cursor, tightening pinch ring, or V-sign scroll indicator
    if (this.frame.cursor) {
      this.drawCursorAndPinchRing(ctx, w, h);
    }

    // 5. Draw wave-cycle toast banner if recently triggered
    const nowMs = performance.now();
    if (this.cycleBannerText && nowMs < this.cycleBannerUntilMs) {
      const alpha = Math.min(1, (this.cycleBannerUntilMs - nowMs) / 300);
      ctx.save();
      const bw = 270;
      const bh = 40;
      const bx = (w - bw) / 2;
      const by = h * 0.18;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 20);
      ctx.fillStyle = `rgba(15, 23, 42, ${0.88 * alpha})`;
      ctx.strokeStyle = `rgba(245, 185, 66, ${0.95 * alpha})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(245, 185, 66, 0.65)';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 12px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255, 230, 163, ${alpha})`;
      ctx.fillText(this.cycleBannerText, w / 2, by + bh / 2);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawEdgeZones(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const z = this.settings.edgeZoneSize;
    const zoneW = w * z;
    const zoneH = h * z;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);

    const zones: { id: SnapPosition; x: number; y: number; width: number; height: number; label: string }[] = [
      { id: 'left', x: 8, y: zoneH + 8, width: zoneW - 12, height: h - zoneH * 2 - 16, label: 'SNAP LEFT' },
      { id: 'right', x: w - zoneW + 4, y: zoneH + 8, width: zoneW - 12, height: h - zoneH * 2 - 16, label: 'SNAP RIGHT' },
      { id: 'top', x: zoneW + 8, y: 8, width: w - zoneW * 2 - 16, height: zoneH - 12, label: 'MAXIMIZE' }
    ];

    if (this.settings.enableCorners) {
      zones.push(
        { id: 'topLeft', x: 8, y: 8, width: zoneW - 12, height: zoneH - 12, label: 'TOP-LEFT' },
        { id: 'topRight', x: w - zoneW + 4, y: 8, width: zoneW - 12, height: zoneH - 12, label: 'TOP-RIGHT' },
        { id: 'bottomLeft', x: 8, y: h - zoneH + 4, width: zoneW - 12, height: zoneH - 12, label: 'BTM-LEFT' },
        { id: 'bottomRight', x: w - zoneW + 4, y: h - zoneH + 4, width: zoneW - 12, height: zoneH - 12, label: 'BTM-RIGHT' }
      );
    }

    for (const zone of zones) {
      if (zone.width <= 0 || zone.height <= 0) continue;

      const isHovered = this.frame.hoveredZone === zone.id;
      const isArmed = this.frame.armedZone === zone.id;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(zone.x, zone.y, zone.width, zone.height, 12);

      if (isArmed) {
        const alpha = 0.22 + 0.14 * pulse;
        ctx.fillStyle = `rgba(245, 185, 66, ${alpha})`;
        ctx.strokeStyle = `rgba(255, 215, 110, ${0.85 + 0.15 * pulse})`;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = 'rgba(245, 185, 66, 0.65)';
        ctx.shadowBlur = 18;
      } else if (isHovered) {
        ctx.fillStyle = this.frame.isPinching
          ? 'rgba(245, 185, 66, 0.14)'
          : 'rgba(255, 255, 255, 0.06)';
        ctx.strokeStyle = this.frame.isPinching
          ? 'rgba(245, 185, 66, 0.55)'
          : 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.fillStyle = 'rgba(15, 19, 32, 0.22)';
        ctx.strokeStyle = 'rgba(245, 185, 66, 0.14)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
      }

      ctx.fill();
      ctx.stroke();

      // Label inside zone
      ctx.setLineDash([]);
      ctx.font = '600 10px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isArmed
        ? '#ffe39f'
        : isHovered
          ? 'rgba(245, 185, 66, 0.9)'
          : 'rgba(226, 232, 240, 0.35)';
      ctx.fillText(zone.label, zone.x + zone.width / 2, zone.y + zone.height / 2);

      // Dwell progress bar when dwelling in zone during grab
      if (isHovered && this.frame.isPinching && !isArmed && this.frame.dwellProgress > 0) {
        const barW = Math.min(80, zone.width - 16);
        const barX = zone.x + (zone.width - barW) / 2;
        const barY = zone.y + zone.height / 2 + 12;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(barX, barY, barW, 3);
        ctx.fillStyle = '#f5b942';
        ctx.fillRect(barX, barY, barW * this.frame.dwellProgress, 3);
      }

      ctx.restore();
    }
  }

  private drawGhostPreview(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    zone: SnapPosition,
    isArmed: boolean
  ): void {
    const ratio = this.settings.snapRatio;
    const pad = 14;
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
    ctx.roundRect(gx, gy, gw, gh, 16);
    ctx.fillStyle = isArmed
      ? 'rgba(245, 185, 66, 0.14)'
      : 'rgba(245, 185, 66, 0.06)';
    ctx.strokeStyle = isArmed
      ? 'rgba(245, 185, 66, 0.92)'
      : 'rgba(245, 185, 66, 0.42)';
    ctx.lineWidth = isArmed ? 2.5 : 1.5;
    if (!isArmed) {
      ctx.setLineDash([10, 6]);
    }
    ctx.shadowColor = 'rgba(245, 185, 66, 0.45)';
    ctx.shadowBlur = isArmed ? 24 : 10;
    ctx.fill();
    ctx.stroke();

    // Ghost badge in center of preview rectangle
    ctx.setLineDash([]);
    ctx.font = '700 12px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isArmed ? '#ffe6a3' : 'rgba(245, 185, 66, 0.78)';
    const badgeText = isArmed
      ? `ARMED: RELEASE TO SNAP (${zone.toUpperCase()})`
      : `HOLD TO ARM (${zone.toUpperCase()})`;
    ctx.fillText(badgeText, gx + gw / 2, gy + gh / 2);

    ctx.restore();
  }

  private drawHandSkeleton(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    hand: HandLandmarks,
    isPinching: boolean,
    isScrolling: boolean = false
  ): void {
    ctx.save();

    // Draw bones
    ctx.lineWidth = 2;
    ctx.strokeStyle = isPinching || isScrolling
      ? 'rgba(245, 185, 66, 0.78)'
      : 'rgba(148, 163, 184, 0.52)';

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const a = hand[startIdx];
      const b = hand[endIdx];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    }

    // Highlight line between thumb tip (4) and index tip (8) or V-sign tips (8 and 12)
    const thumb = hand[4];
    const index = hand[8];
    const middle = hand[12];
    if (isScrolling && index && middle) {
      ctx.beginPath();
      ctx.moveTo(index.x * w, index.y * h);
      ctx.lineTo(middle.x * w, middle.y * h);
      ctx.strokeStyle = '#86efac';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (thumb && index) {
      ctx.beginPath();
      ctx.moveTo(thumb.x * w, thumb.y * h);
      ctx.lineTo(index.x * w, index.y * h);
      ctx.strokeStyle = isPinching ? '#ffe39f' : 'rgba(245, 185, 66, 0.85)';
      ctx.lineWidth = isPinching ? 3 : 1.5;
      ctx.stroke();
    }

    // Draw 21 landmark joints (highlight index #8 and middle #12 fingertips during V-sign scroll)
    for (let i = 0; i < hand.length; i++) {
      const lm = hand[i];
      const isScrollTip = isScrolling && (i === 8 || i === 12);
      const isPinchTip = !isScrolling && (i === 4 || i === 8);
      const radius = isScrollTip ? 6.5 : isPinchTip ? 5.5 : 3.2;

      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, radius, 0, Math.PI * 2);
      ctx.fillStyle = isScrollTip
        ? '#86efac'
        : isPinchTip
          ? '#f5b942'
          : isPinching
            ? '#fde68a'
            : '#e2e8f0';
      ctx.shadowColor = isScrollTip ? 'rgba(134, 239, 172, 0.9)' : 'rgba(245, 185, 66, 0.8)';
      ctx.shadowBlur = isScrollTip ? 14 : isPinchTip ? 10 : 0;
      ctx.fill();
    }

    ctx.restore();
  }

  private drawCursorAndPinchRing(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cursor = this.frame.cursor!;
    const cx = cursor.x * w;
    const cy = cursor.y * h;
    const progress = this.frame.pinchProgress;
    const isPinching = this.frame.isPinching;
    const isScrolling = !!this.frame.isScrolling;
    const scrollDelta = this.frame.scrollDelta ?? 0;

    ctx.save();

    if (isScrolling) {
      const intensity = Math.min(1, Math.abs(scrollDelta) / 400);
      const radius = 24 + intensity * 8;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(134, 239, 172, ${0.55 + intensity * 0.45})`;
      ctx.lineWidth = 2.5 + intensity * 1.5;
      ctx.shadowColor = 'rgba(134, 239, 172, 0.9)';
      ctx.shadowBlur = 14 + intensity * 12;
      ctx.stroke();

      // Up/Down directional arrow at cursor with intensity proportional to scroll speed
      const arrowLen = 12 + intensity * 14;
      const dir = scrollDelta >= 0 ? -1 : 1; // -1 = up on canvas, +1 = down on canvas
      ctx.beginPath();
      if (scrollDelta === 0) {
        // Bidirectional idle scroll indicator
        ctx.moveTo(cx, cy - 11);
        ctx.lineTo(cx, cy + 11);
        ctx.moveTo(cx - 5, cy - 6);
        ctx.lineTo(cx, cy - 11);
        ctx.lineTo(cx + 5, cy - 6);
        ctx.moveTo(cx - 5, cy + 6);
        ctx.lineTo(cx, cy + 11);
        ctx.lineTo(cx + 5, cy + 6);
      } else {
        const tipY = cy + dir * arrowLen;
        const tailY = cy - dir * (arrowLen * 0.45);
        ctx.moveTo(cx, tailY);
        ctx.lineTo(cx, tipY);
        ctx.moveTo(cx - 6, tipY - dir * 7);
        ctx.lineTo(cx, tipY);
        ctx.lineTo(cx + 6, tipY - dir * 7);
      }
      ctx.strokeStyle = `rgba(255, 243, 196, ${0.75 + intensity * 0.25})`;
      ctx.lineWidth = 2.5 + intensity;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.restore();
      return;
    }

    // Outer tightening ring: shrinks from 36px down to 14px as pinch closes
    const ringRadius = 36 - progress * 22;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isPinching
      ? '#f5b942'
      : `rgba(245, 185, 66, ${0.35 + progress * 0.55})`;
    ctx.lineWidth = isPinching ? 3 : 2;
    ctx.shadowColor = 'rgba(245, 185, 66, 0.9)';
    ctx.shadowBlur = isPinching ? 20 : 8;
    ctx.stroke();

    // Center glowing cursor orb
    ctx.beginPath();
    ctx.arc(cx, cy, isPinching ? 7.5 : 5, 0, Math.PI * 2);
    ctx.fillStyle = isPinching ? '#fff3c4' : '#f5b942';
    ctx.shadowColor = '#f5b942';
    ctx.shadowBlur = 16;
    ctx.fill();

    ctx.restore();
  }
}

