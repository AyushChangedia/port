import * as THREE from 'three';

/**
 * World signage.
 *
 * Each structure carries a sign you can read from across the plaza. They are
 * drawn to a canvas as dark text on an opaque plate — never translucent type
 * floating over the scene — and rendered as sprites so they always face you.
 */
export function makeSign(title: string, sub: string): THREE.Sprite {
  const scale = 2; // supersample, then let the GPU downfilter
  const padX = 30 * scale;
  const padY = 20 * scale;
  const titleSize = 46 * scale;
  const subSize = 22 * scale;

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('2D canvas unavailable');

  measure.font = `700 ${titleSize}px Archivo, Helvetica, Arial, sans-serif`;
  const titleW = measure.measureText(title).width;
  measure.font = `500 ${subSize}px "IBM Plex Mono", monospace`;
  const subW = measure.measureText(sub.toUpperCase()).width;

  const w = Math.ceil(Math.max(titleW, subW) + padX * 2);
  const h = Math.ceil(titleSize + subSize + padY * 2 + 12 * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  // Opaque plate. This is the whole point: text on a solid ground.
  ctx.fillStyle = '#f4f1eb';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b8391a';
  ctx.fillRect(0, 0, w, 5 * scale);

  ctx.fillStyle = '#17171b';
  ctx.font = `700 ${titleSize}px Archivo, Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(title, padX, padY);

  ctx.fillStyle = '#63626c';
  ctx.font = `500 ${subSize}px "IBM Plex Mono", monospace`;
  ctx.letterSpacing = `${2 * scale}px`;
  ctx.fillText(sub.toUpperCase(), padX, padY + titleSize + 10 * scale);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: false, depthTest: true }),
  );

  // Big enough to read from across the plaza — these are wayfinding, not
  // decoration, so they are sized for the far case, not the near one.
  const worldH = 1.75;
  sprite.scale.set((w / h) * worldH, worldH, 1);
  return sprite;
}

export function disposeSign(sprite: THREE.Sprite): void {
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
}
