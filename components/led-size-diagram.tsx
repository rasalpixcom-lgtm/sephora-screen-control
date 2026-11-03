"use client";

import { useId } from "react";
import Image from "next/image";
import { ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { manualLedSize } from "@/lib/screen-hardware";

export default function LedSizeDiagram({ widthMm, heightMm, area, resolution, pixelPitch }: { widthMm: string; heightMm: string; area?: string; resolution?: string; pixelPitch?: string }) {
  const clipId = useId();
  const size = manualLedSize(widthMm, heightMm);
  if (!size) return null;

  const { width, height, ratio } = size;
  const displayWidth = Math.min(540, 260 * ratio);
  const displayHeight = displayWidth / ratio;
  const x = 110 + (540 - displayWidth) / 2;
  const y = 35 + (260 - displayHeight) / 2;
  const heightMeasureX = x + displayWidth + 25;

  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="led-diagram-trigger" aria-label="View LED display size diagram">
        <Image src="/led-display-sample.webp" width={112} height={64} alt="" aria-hidden="true" className="led-diagram-thumb" />
        <span><ZoomIn size={15} aria-hidden="true" />View size diagram</span>
      </button>
    </DialogTrigger>
    <DialogContent className="adm-dialog led-diagram-dialog">
      <DialogHeader>
        <DialogTitle>LED display size</DialogTitle>
        <DialogDescription className="sr-only">Illustrative display diagram based on the manually entered width and height.</DialogDescription>
      </DialogHeader>
      <svg className="led-diagram-graphic" viewBox="0 0 800 380" role="img" aria-label={`LED display diagram: ${width} millimeters wide and ${height} millimeters high`}>
        <defs><clipPath id={clipId}><rect x={x} y={y} width={displayWidth} height={displayHeight} rx="4" /></clipPath></defs>
        <rect className="led-diagram-face" x={x} y={y} width={displayWidth} height={displayHeight} rx="4" />
        <image href="/led-display-sample.webp" x={x} y={y} width={displayWidth} height={displayHeight} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} aria-hidden="true" />
        {Array.from({ length: 7 }, (_, index) => <line className="led-diagram-grid" key={`v${index}`} x1={x + displayWidth * (index + 1) / 8} x2={x + displayWidth * (index + 1) / 8} y1={y} y2={y + displayHeight} />)}
        {Array.from({ length: 3 }, (_, index) => <line className="led-diagram-grid" key={`h${index}`} x1={x} x2={x + displayWidth} y1={y + displayHeight * (index + 1) / 4} y2={y + displayHeight * (index + 1) / 4} />)}
        <line className="led-diagram-measure" x1={x} x2={x + displayWidth} y1="325" y2="325" />
        <line className="led-diagram-measure" x1={x} x2={x} y1="317" y2="333" />
        <line className="led-diagram-measure" x1={x + displayWidth} x2={x + displayWidth} y1="317" y2="333" />
        <text className="led-diagram-label" x={x + displayWidth / 2} y="356" textAnchor="middle">Width {width} mm</text>
        <line className="led-diagram-measure" x1={heightMeasureX} x2={heightMeasureX} y1={y} y2={y + displayHeight} />
        <line className="led-diagram-measure" x1={heightMeasureX - 8} x2={heightMeasureX + 8} y1={y} y2={y} />
        <line className="led-diagram-measure" x1={heightMeasureX - 8} x2={heightMeasureX + 8} y1={y + displayHeight} y2={y + displayHeight} />
        <text className="led-diagram-label" x={heightMeasureX + 36} y="165" textAnchor="middle" transform={`rotate(90 ${heightMeasureX + 36} 165)`}>Height {height} mm</text>
      </svg>
      <dl className="led-diagram-facts">
        {resolution && <div><dt>Resolution</dt><dd>{resolution} px</dd></div>}
        {pixelPitch && <div><dt>Pixel pitch</dt><dd>{pixelPitch} mm</dd></div>}
        <div><dt>Dimensions</dt><dd>{width} × {height} mm</dd></div>
        {area && <div><dt>Total area</dt><dd>{area} m²</dd></div>}
      </dl>
    </DialogContent>
  </Dialog>;
}
