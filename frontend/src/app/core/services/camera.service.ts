import { Injectable, signal } from '@angular/core';

export type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'missing' | 'error';

@Injectable({ providedIn: 'root' })
export class CameraService {
  readonly state = signal<CameraState>('idle');
  readonly errorMessage = signal<string | null>(null);
  private stream: MediaStream | null = null;

  async startCamera(videoElement: HTMLVideoElement): Promise<boolean> {
    this.stopCamera(videoElement);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.state.set('missing');
      this.errorMessage.set(
        'MediaDevices API is unavailable in this browser. Switch to Simulation Mode to use mouse gestures.'
      );
      return false;
    }

    this.state.set('requesting');
    this.errorMessage.set(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60 },
          facingMode: 'user'
        },
        audio: false
      });

      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        const label = track.label || 'unknown camera';
        console.info(`[Scepter] Camera opened: "${label}" (muted=${track.muted}, state=${track.readyState})`);
        track.addEventListener('ended', () => {
          this.state.set('error');
          this.errorMessage.set(
            `Camera "${label}" stopped delivering video. Another app may have taken it, or it was unplugged. Close other apps using the camera and press Retry.`
          );
        });
        track.addEventListener('mute', () => {
          console.warn('[Scepter] Camera track muted - no frames are being delivered.');
          this.state.set('error');
          this.errorMessage.set(
            `Camera "${label}" is connected but not delivering frames. Check Windows Settings > Privacy & security > Camera, any physical privacy shutter or Fn camera key, and that no other app is using it, then press Retry.`
          );
        });
        track.addEventListener('unmute', () => {
          if (this.state() === 'error') {
            this.state.set('active');
            this.errorMessage.set(null);
          }
        });
      }
      videoElement.srcObject = stream;
      await videoElement.play();
      this.state.set(track?.muted ? 'error' : 'active');
      if (track?.muted) {
        this.errorMessage.set(
          'Camera is connected but not delivering frames. Check Windows camera privacy settings / privacy shutter and that no other app is using it, then press Retry.'
        );
      }
      return !track?.muted;
    } catch (err: any) {
      const name = err?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.state.set('denied');
        this.errorMessage.set(
          'Camera permission was denied. Allow camera access in your browser address bar or enable Mouse Simulation Mode.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this.state.set('missing');
        this.errorMessage.set(
          'No webcam was detected on this machine. Enable Mouse Simulation Mode in the header to test Scepter without a camera.'
        );
      } else {
        this.state.set('error');
        this.errorMessage.set(
          err?.message || 'Unable to start webcam. Use Mouse Simulation Mode to continue.'
        );
      }
      return false;
    }
  }

  stopCamera(videoElement?: HTMLVideoElement): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
    this.state.set('idle');
  }
}

