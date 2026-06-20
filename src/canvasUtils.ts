export interface PlotOptions {
  xLabel?: string;
  yLabel?: string;
  title?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  grid?: boolean;
  lineWidth?: number;
  color?: string;
  strokeStyle?: string;
  fillStyle?: string;
}

export interface BarPlotOptions {
  barWidth?: number;
  barColor?: string;
  highlightIndex?: number;
  highlightColor?: string;
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  _xRange: [number, number],
  yRange: [number, number],
  numXGrids: number = 10,
  numYGrids: number = 8
): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;

  // const xStep = (xRange[1] - xRange[0]) / numXGrids;
  // const yStep = (yRange[1] - yRange[0]) / numYGrids;

  for (let i = 0; i <= numXGrids; i++) {
    const x = (i / numXGrids) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let i = 0; i <= numYGrids; i++) {
    const y = (i / numYGrids) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;

  const zeroY = yRange[0] < 0 && yRange[1] > 0
    ? height * (1 - (0 - yRange[0]) / (yRange[1] - yRange[0]))
    : height;

  if (zeroY >= 0 && zeroY <= height) {
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width, height);
  ctx.stroke();
}

export function drawAxes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  xRange: [number, number],
  yRange: [number, number],
  xLabel?: string,
  yLabel?: string,
  padding: number = 50
): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';

  const numXTicks = 6;
  const numYTicks = 5;

  for (let i = 0; i <= numXTicks; i++) {
    const x = padding + (i / numXTicks) * (width - 2 * padding);
    const value = xRange[0] + (i / numXTicks) * (xRange[1] - xRange[0]);
    const label = formatNumber(value);
    ctx.fillText(label, x, height - 10);
  }

  ctx.textAlign = 'right';
  for (let i = 0; i <= numYTicks; i++) {
    const y = height - padding - (i / numYTicks) * (height - 2 * padding);
    const value = yRange[0] + (i / numYTicks) * (yRange[1] - yRange[0]);
    const label = formatNumber(value);
    ctx.fillText(label, padding - 5, y + 4);
  }

  if (xLabel) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(xLabel, width / 2, height - 28);
  }

  if (yLabel) {
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}

export function drawLinePlot(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  _xRange: [number, number],
  yRange: [number, number],
  color: string = '#4fc3f7',
  lineWidth: number = 2,
  padding: number = 50
): void {
  if (data.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;
  const yScale = plotHeight / (yRange[1] - yRange[0]);

  for (let i = 0; i < data.length; i++) {
    const x = padding + (i / (data.length - 1)) * plotWidth;
    const y = height - padding - (data[i] - yRange[0]) * yScale;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

export function drawLinePlotWithX(
  ctx: CanvasRenderingContext2D,
  xData: number[],
  yData: number[],
  width: number,
  height: number,
  xRange: [number, number],
  yRange: [number, number],
  color: string = '#4fc3f7',
  lineWidth: number = 2,
  padding: number = 50
): void {
  if (xData.length < 2 || yData.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;
  const xScale = plotWidth / (xRange[1] - xRange[0]);
  const yScale = plotHeight / (yRange[1] - yRange[0]);

  let started = false;
  for (let i = 0; i < Math.min(xData.length, yData.length); i++) {
    const xVal = xData[i];
    if (xVal < xRange[0] || xVal > xRange[1]) continue;

    const x = padding + (xVal - xRange[0]) * xScale;
    const y = height - padding - (yData[i] - yRange[0]) * yScale;

    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

export function drawBarPlot(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  _xRange: [number, number],
  yRange: [number, number],
  color: string = '#7c4dff',
  barWidthRatio: number = 0.7,
  padding: number = 50,
  highlightIndices?: number[],
  highlightColor: string = '#ffa726'
): void {
  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;
  const yScale = plotHeight / (yRange[1] - yRange[0]);
  const barWidth = (plotWidth / data.length) * barWidthRatio;

  const zeroY = height - padding - (0 - yRange[0]) * yScale;

  for (let i = 0; i < data.length; i++) {
    const x = padding + (i / data.length) * plotWidth + ((plotWidth / data.length) - barWidth) / 2;
    const value = data[i];
    const barHeight = Math.abs(value) * yScale;

    let y = zeroY;
    if (value >= 0) {
      y = zeroY - barHeight;
    }

    ctx.fillStyle = highlightIndices?.includes(i) ? highlightColor : color;
    ctx.fillRect(x, Math.min(y, zeroY), barWidth, barHeight || 1);
  }
}

export function drawStemPlot(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  _xRange: [number, number],
  yRange: [number, number],
  color: string = '#4fc3f7',
  lineWidth: number = 2,
  markerRadius: number = 4,
  padding: number = 50
): void {
  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;
  const yScale = plotHeight / (yRange[1] - yRange[0]);

  const zeroY = height - padding - (0 - yRange[0]) * yScale;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  for (let i = 0; i < data.length; i++) {
    const x = padding + (i / (data.length - 1 || 1)) * plotWidth;
    const value = data[i];
    const y = height - padding - (value - yRange[0]) * yScale;

    ctx.beginPath();
    ctx.moveTo(x, zeroY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawStemPlotWithX(
  ctx: CanvasRenderingContext2D,
  xData: number[],
  yData: number[],
  width: number,
  height: number,
  xRange: [number, number],
  yRange: [number, number],
  color: string = '#4fc3f7',
  lineWidth: number = 2,
  markerRadius: number = 4,
  padding: number = 50
): void {
  if (xData.length !== yData.length) return;

  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;
  const xScale = plotWidth / (xRange[1] - xRange[0]);
  const yScale = plotHeight / (yRange[1] - yRange[0]);

  const zeroY = height - padding - (0 - yRange[0]) * yScale;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  for (let i = 0; i < xData.length; i++) {
    const xVal = xData[i];
    if (xVal < xRange[0] || xVal > xRange[1]) continue;

    const x = padding + (xVal - xRange[0]) * xScale;
    const y = height - padding - (yData[i] - yRange[0]) * yScale;

    ctx.beginPath();
    ctx.moveTo(x, zeroY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawVerticalLines(
  ctx: CanvasRenderingContext2D,
  xPositions: number[],
  yValues: number[],
  width: number,
  height: number,
  xRange: [number, number],
  yRange: [number, number],
  color: string = '#ffa726',
  lineWidth: number = 2,
  padding: number = 50
): void {
  if (xPositions.length !== yValues.length) return;

  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;
  const xScale = plotWidth / (xRange[1] - xRange[0]);
  const yScale = plotHeight / (yRange[1] - yRange[0]);

  const zeroY = height - padding - (0 - yRange[0]) * yScale;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  for (let i = 0; i < xPositions.length; i++) {
    const x = padding + (xPositions[i] - xRange[0]) * xScale;
    const y = height - padding - (yValues[i] - yRange[0]) * yScale;

    ctx.beginPath();
    ctx.moveTo(x, zeroY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFilledArea(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  _xRange: [number, number],
  yRange: [number, number],
  color: string = 'rgba(79, 195, 247, 0.3)',
  padding: number = 50
): void {
  if (data.length < 2) return;

  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;
  const yScale = plotHeight / (yRange[1] - yRange[0]);
  const zeroY = height - padding - (0 - yRange[0]) * yScale;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(padding, zeroY);

  for (let i = 0; i < data.length; i++) {
    const x = padding + (i / (data.length - 1)) * plotWidth;
    const y = height - padding - (data[i] - yRange[0]) * yScale;
    ctx.lineTo(x, y);
  }

  ctx.lineTo(padding + plotWidth, zeroY);
  ctx.closePath();
  ctx.fill();
}

export function drawMultiLinePlot(
  ctx: CanvasRenderingContext2D,
  datasets: { data: number[]; color: string; label?: string }[],
  width: number,
  height: number,
  xRange: [number, number],
  yRange: [number, number],
  lineWidth: number = 2,
  padding: number = 50
): void {
  for (const dataset of datasets) {
    drawLinePlot(ctx, dataset.data, width, height, xRange, yRange, dataset.color, lineWidth, padding);
  }
}

export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  data: number[][],
  width: number,
  height: number,
  padding: number = 50
): void {
  const rows = data.length;
  const cols = data[0]?.length || 0;
  if (rows === 0 || cols === 0) return;

  const cellWidth = (width - 2 * padding) / cols;
  const cellHeight = (height - 2 * padding) / rows;

  let maxVal = -Infinity;
  let minVal = Infinity;
  for (const row of data) {
    for (const val of row) {
      maxVal = Math.max(maxVal, val);
      minVal = Math.min(minVal, val);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const normalized = maxVal !== minVal ? (data[row][col] - minVal) / (maxVal - minVal) : 0;
      const color = getHeatmapColor(normalized);

      ctx.fillStyle = color;
      ctx.fillRect(
        padding + col * cellWidth,
        padding + row * cellHeight,
        cellWidth,
        cellHeight
      );
    }
  }
}

export function getHeatmapColor(value: number): string {
  value = Math.max(0, Math.min(1, value));

  const r = Math.floor(255 * value);
  const g = Math.floor(255 * (1 - Math.abs(value - 0.5) * 2));
  const b = Math.floor(255 * (1 - value));

  return `rgb(${r}, ${g}, ${b})`;
}

export function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, width, height);
}

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  color: string = 'rgba(124, 77, 255, 0.3)',
  borderColor: string = '#7c4dff'
): void {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);

  ctx.fillStyle = color;
  ctx.fillRect(left, top, right - left, bottom - top);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.setLineDash([]);
}

export function formatNumber(num: number): string {
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  if (Math.abs(num) < 0.01 && num !== 0) {
    return num.toExponential(1);
  }
  return num.toFixed(1);
}

export function autoScaleY(data: number[], margin: number = 0.1): [number, number] {
  if (data.length === 0) return [-1, 1];

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 2;

  return [min - range * margin, max + range * margin];
}

export function autoScaleYWithZero(data: number[], margin: number = 0.1): [number, number] {
  if (data.length === 0) return [-1, 1];

  const min = Math.min(0, ...data);
  const max = Math.max(0, ...data);
  const range = max - min || 2;

  return [min - range * margin, max + range * margin];
}

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  width: number
): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, 20);
}

export function drawLegend(
  ctx: CanvasRenderingContext2D,
  items: { label: string; color: string }[],
  x: number,
  y: number
): void {
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';

  let currentY = y;
  const lineHeight = 18;

  for (const item of items) {
    ctx.fillStyle = item.color;
    ctx.fillRect(x, currentY - 8, 16, 4);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(item.label, x + 22, currentY);

    currentY += lineHeight;
  }
}
