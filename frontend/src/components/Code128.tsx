import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type Props = {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
};

export function Code128({
  value,
  height = 50,
  width = 1.6,
  fontSize = 12,
  displayValue = true,
  className = '',
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, value, {
      format: 'CODE128',
      height,
      width,
      fontSize,
      displayValue,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    });
  }, [value, height, width, fontSize, displayValue]);

  return (
    <span dir="ltr" className={className}>
      <svg ref={svgRef} />
    </span>
  );
}
