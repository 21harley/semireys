import * as THREE from 'three';

/**
 * Relleno por inundación (flood fill) sobre un canvas 2D.
 * Se detiene automáticamente al llegar a un borde de color muy distinto.
 */
export function floodFillCanvas(
	ctx: CanvasRenderingContext2D,
	startX: number,
	startY: number,
	fillColor: [number, number, number, number],
	tolerance: number = 50
) {
	const { width, height } = ctx.canvas;
	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;

	startX = Math.floor(startX);
	startY = Math.floor(startY);
	if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;

	const idxAt = (x: number, y: number) => (y * width + x) * 4;
	const startIdx = idxAt(startX, startY);
	const targetColor = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];

	const colorsMatch = (c1: number[], c2: number[], tol: number) =>
		Math.abs(c1[0] - c2[0]) <= tol &&
		Math.abs(c1[1] - c2[1]) <= tol &&
		Math.abs(c1[2] - c2[2]) <= tol;

	if (colorsMatch(targetColor, fillColor, 5)) return;

	const stack: [number, number][] = [[startX, startY]];
	const visited = new Uint8Array(width * height);

	while (stack.length > 0) {
		const item = stack.pop();
		if (!item) break;
		const [x, y] = item;

		if (x < 0 || y < 0 || x >= width || y >= height) continue;

		const pixelIndex = y * width + x;
		if (visited[pixelIndex]) continue;

		const idx = pixelIndex * 4;
		const currentColor = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];

		if (!colorsMatch(currentColor, targetColor, tolerance)) continue;

		visited[pixelIndex] = 1;
		data[idx] = fillColor[0];
		data[idx + 1] = fillColor[1];
		data[idx + 2] = fillColor[2];
		data[idx + 3] = fillColor[3];

		stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
	}

	ctx.putImageData(imageData, 0, 0);
}

/**
 * Convierte coordenada UV normalizada (0-1, de una intersección de raycaster)
 * a coordenada de pixel dentro del canvas de textura.
 */
export function uvToCanvasPixel(uv: THREE.Vector2, canvasWidth: number, canvasHeight: number, flipY = true) {
	const x = uv.x * canvasWidth;
	const y = flipY ? (1 - uv.y) * canvasHeight : uv.y * canvasHeight;
	return { x, y };
}

export interface PintarOptions {
	raycaster: THREE.Raycaster;
	shirtMeshes: THREE.Mesh[];
	shirtCanvas: HTMLCanvasElement;
	shirtCtx: CanvasRenderingContext2D;
	shirtTexture: THREE.CanvasTexture;
	colorHex: string;
	tolerance?: number;
}

/**
 * Manejador de clic en modo "pintar por zona".
 * Convierte la colisión UV 3D en pixel 2D y realiza un flood fill sobre el lienzo UV.
 */
export function pintarPorClick({
	raycaster,
	shirtMeshes,
	shirtCanvas,
	shirtCtx,
	shirtTexture,
	colorHex,
	tolerance = 50,
}: PintarOptions): boolean {
	const intersects = raycaster.intersectObjects(shirtMeshes);
	if (intersects.length === 0) return false;

	const hit = intersects[0];
	if (!hit.uv) {
		console.warn('El mesh tocado no tiene coordenadas UV disponibles.');
		return false;
	}

	const { x, y } = uvToCanvasPixel(hit.uv, shirtCanvas.width, shirtCanvas.height, true);

	const color = new THREE.Color(colorHex);
	const fillRGBA: [number, number, number, number] = [
		Math.round(color.r * 255),
		Math.round(color.g * 255),
		Math.round(color.b * 255),
		255,
	];

	floodFillCanvas(shirtCtx, x, y, fillRGBA, tolerance);
	shirtTexture.needsUpdate = true;
	return true;
}
