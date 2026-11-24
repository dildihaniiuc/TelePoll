import { useEffect, useRef } from "react";

/**
 * Live cascading 0/1 binary stream canvas backdrop.
 * Respects `prefers-reduced-motion` and keeps CPU overhead minimal (~28 fps).
 */
export function BinaryRainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const fontSize = 15;
    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];
    let speeds: number[] = [];
    let frameId = 0;
    let lastDraw = 0;

    const initGrid = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      columns = Math.max(1, Math.floor(width / 22));
      drops = Array.from({ length: columns }, () =>
        Math.floor(Math.random() * Math.max(10, height / fontSize))
      );
      speeds = Array.from({ length: columns }, () => 0.65 + Math.random() * 0.75);

      ctx.fillStyle = "#04070B";
      ctx.fillRect(0, 0, width, height);
    };

    const drawStaticFrame = () => {
      ctx.fillStyle = "#04070B";
      ctx.fillRect(0, 0, width, height);
      ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
      for (let i = 0; i < columns; i++) {
        const x = i * 22 + 4;
        const rows = Math.floor(height / fontSize);
        for (let r = 0; r < rows; r += 2) {
          if ((i + r) % 3 === 0) {
            const bit = Math.random() > 0.5 ? "1" : "0";
            ctx.fillStyle =
              r % 6 === 0
                ? "rgba(0, 255, 119, 0.24)"
                : "rgba(16, 185, 129, 0.11)";
            ctx.fillText(bit, x, r * fontSize);
          }
        }
      }
    };

    const tick = (now: number) => {
      frameId = window.requestAnimationFrame(tick);
      if (now - lastDraw < 48) return; // ~21 fps crisp terminal cadence
      lastDraw = now;

      // Soft translucent void fade creates glowing vertical binary trails
      ctx.fillStyle = "rgba(4, 7, 11, 0.11)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;

      for (let i = 0; i < columns; i++) {
        const x = i * 22 + 4;
        const y = drops[i] * fontSize;
        const bit = Math.random() > 0.48 ? "1" : "0";

        // Bright head glyph (phosphor green with occasional cyan packet bit)
        const isCyanPacket = (i + Math.floor(drops[i])) % 17 === 0;
        ctx.fillStyle = isCyanPacket
          ? "rgba(56, 239, 255, 0.78)"
          : "rgba(110, 255, 168, 0.78)";
        ctx.fillText(bit, x, y);

        // Trailing bit slightly behind for denser matrix trail
        if (drops[i] > 1) {
          const trailBit = Math.random() > 0.5 ? "0" : "1";
          ctx.fillStyle = "rgba(16, 185, 129, 0.34)";
          ctx.fillText(trailBit, x, y - fontSize);
        }

        if (y > height && Math.random() > 0.965) {
          drops[i] = 0;
        } else {
          drops[i] += speeds[i];
        }
      }
    };

    initGrid();

    if (reducedMotion) {
      drawStaticFrame();
    } else {
      frameId = window.requestAnimationFrame(tick);
    }

    const handleResize = () => {
      initGrid();
      if (reducedMotion) {
        drawStaticFrame();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 opacity-50"
      />
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 crt-scanlines"
      />
    </>
  );
}
