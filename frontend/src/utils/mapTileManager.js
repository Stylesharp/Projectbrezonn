// Real-Time Web Mercator Satellite Tile & AWS Terrarium Elevation DEM Stitcher
// Drapes the EXACT Esri World Imagery / CartoDB Dark map tiles & real-world elevation onto the 3D terrain!
import * as THREE from 'three';
import { latLonToWorldXZ } from './flightConfig';

const TILE_ZOOM = 14;
const GRID_TILES = 5; // 5x5 tiles at Z14 = ~9.6 km x 9.6 km (~96 x 96 world units)
const SAT_TILE_PX = 256;
const SAT_SIZE = GRID_TILES * SAT_TILE_PX; // 1280 x 1280 crisp satellite texture
const DEM_RES = 256; // 256 x 256 decoded smooth real-world elevation grid
const MAX_ELEV_METERS = 360.0; // Normalized 0..360m range for smooth 16-bit GPU heightmap

export function latLonToTileFloat(lat, lon, zoom = TILE_ZOOM) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function tileToLatLon(tx, ty, zoom = TILE_ZOOM) {
  const n = Math.pow(2, zoom);
  const lon = (tx / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lon };
}

class LiveMapTileManager {
  constructor() {
    this.centerTx = null;
    this.centerTy = null;
    this.activeLayer = 'SATELLITE';
    this.hasRealDem = false;
    this.hasRealSat = false;
    this.loadGeneration = 0;

    // World bounds of the currently stitched 5x5 tile patch in North-Up 3D world units
    this.bounds = {
      minWx: -48,
      maxWx: 48,
      minWz: -48,
      maxWz: 48,
    };

    // 1. Satellite Color CanvasTexture
    this.satCanvas = document.createElement('canvas');
    this.satCanvas.width = SAT_SIZE;
    this.satCanvas.height = SAT_SIZE;
    this.satCtx = this.satCanvas.getContext('2d');
    this._drawFallbackGrid();

    this.satTexture = new THREE.CanvasTexture(this.satCanvas);
    this.satTexture.colorSpace = THREE.SRGBColorSpace;
    this.satTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.satTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.satTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.satTexture.magFilter = THREE.LinearFilter;
    this.satTexture.anisotropy = 8;

    // 2. Real-World Elevation DataTexture + CPU Float32Array lookup (exact GPU/CPU parity!)
    this.demMeters = new Float32Array(DEM_RES * DEM_RES);
    this.demBytes = new Uint8Array(DEM_RES * DEM_RES * 4);
    this.demTexture = new THREE.DataTexture(this.demBytes, DEM_RES, DEM_RES, THREE.RGBAFormat);
    this.demTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.demTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.demTexture.minFilter = THREE.LinearFilter;
    this.demTexture.magFilter = THREE.LinearFilter;
    this.demTexture.flipY = true; // Matches CanvasTexture UV convention (v=1 North, v=0 South)
    this.demTexture.needsUpdate = true;

    this.demScratchCanvas = document.createElement('canvas');
    this.demScratchCanvas.width = DEM_RES;
    this.demScratchCanvas.height = DEM_RES;
    this.demScratchCtx = this.demScratchCanvas.getContext('2d', { willReadFrequently: true });
  }

  _drawFallbackGrid() {
    const ctx = this.satCtx;
    ctx.fillStyle = '#071324';
    ctx.fillRect(0, 0, SAT_SIZE, SAT_SIZE);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= SAT_SIZE; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, SAT_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(SAT_SIZE, i);
      ctx.stroke();
    }
  }

  // Ensures the 5x5 satellite + DEM tile patch is centered around the UAV's current GPS tile
  ensureLoaded(lat, lon, layer = 'SATELLITE') {
    const tf = latLonToTileFloat(lat, lon, TILE_ZOOM);
    const tx = Math.floor(tf.x);
    const ty = Math.floor(tf.y);

    const layerChanged = layer !== this.activeLayer;
    const movedFar =
      this.centerTx === null ||
      Math.abs(tx - this.centerTx) >= 1 ||
      Math.abs(ty - this.centerTy) >= 1;

    if (!layerChanged && !movedFar) return;

    this.centerTx = tx;
    this.centerTy = ty;
    this.activeLayer = layer;
    const gen = ++this.loadGeneration;

    const half = Math.floor(GRID_TILES / 2); // 2
    const minTx = tx - half;
    const minTy = ty - half;
    const maxTx = tx + half + 1;
    const maxTy = ty + half + 1;

    // Compute exact 3D world bounds of this 5x5 tile grid
    const nw = tileToLatLon(minTx, minTy, TILE_ZOOM);
    const se = tileToLatLon(maxTx, maxTy, TILE_ZOOM);
    const nwW = latLonToWorldXZ(nw.lat, nw.lon);
    const seW = latLonToWorldXZ(se.lat, se.lon);

    this.bounds.minWx = nwW.wx;
    this.bounds.maxWx = seW.wx;
    this.bounds.minWz = nwW.wz; // Northernmost (-Z)
    this.bounds.maxWz = seW.wz; // Southernmost (+Z)

    const maxTile = Math.pow(2, TILE_ZOOM);
    const cellDemPx = DEM_RES / GRID_TILES;

    // Fetch 5x5 Satellite Imagery tiles
    for (let dx = 0; dx < GRID_TILES; dx++) {
      for (let dy = 0; dy < GRID_TILES; dy++) {
        const curX = ((minTx + dx) % maxTile + maxTile) % maxTile;
        const curY = minTy + dy;
        if (curY < 0 || curY >= maxTile) continue;

        const satUrl =
          layer === 'DARK'
            ? `https://a.basemaps.cartocdn.com/dark_all/${TILE_ZOOM}/${curX}/${curY}.png`
            : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_ZOOM}/${curY}/${curX}`;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (gen !== this.loadGeneration) return;
          this.satCtx.drawImage(img, dx * SAT_TILE_PX, dy * SAT_TILE_PX, SAT_TILE_PX, SAT_TILE_PX);
          this.hasRealSat = true;
          this.satTexture.needsUpdate = true;
        };
        img.src = satUrl;

        // Fetch matching AWS Terrarium Real Elevation DEM tile (only when center moved)
        if (movedFar || !this.hasRealDem) {
          const demUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TILE_ZOOM}/${curX}/${curY}.png`;
          const dImg = new Image();
          dImg.crossOrigin = 'anonymous';
          dImg.onload = () => {
            if (gen !== this.loadGeneration) return;
            const px0 = Math.floor(dx * cellDemPx);
            const py0 = Math.floor(dy * cellDemPx);
            const pw = Math.ceil(cellDemPx);
            const ph = Math.ceil(cellDemPx);
            this.demScratchCtx.drawImage(dImg, px0, py0, pw, ph);
            this._decodeDemRegion(px0, py0, pw, ph);
          };
          dImg.src = demUrl;
        }
      }
    }
  }

  _decodeDemRegion(px0, py0, pw, ph) {
    const imgData = this.demScratchCtx.getImageData(px0, py0, pw, ph).data;
    for (let y = 0; y < ph; y++) {
      const gy = py0 + y;
      if (gy < 0 || gy >= DEM_RES) continue;
      for (let x = 0; x < pw; x++) {
        const gx = px0 + x;
        if (gx < 0 || gx >= DEM_RES) continue;
        const srcIdx = (y * pw + x) * 4;
        const r = imgData[srcIdx];
        const g = imgData[srcIdx + 1];
        const b = imgData[srcIdx + 2];
        // AWS Terrarium standard formula: meters = (R * 256 + G + B / 256) - 32768
        const meters = Math.max(0, r * 256 + g + b / 256 - 32768);
        const gridIdx = gy * DEM_RES + gx;
        this.demMeters[gridIdx] = meters;

        // Encode into normalized 16-bit (R=high, G=low) + B=waterFlag for smooth LinearFilter GPU sampling
        const norm = Math.min(1, meters / MAX_ELEV_METERS);
        const val16 = Math.round(norm * 65535);
        const outIdx = gridIdx * 4;
        this.demBytes[outIdx] = (val16 >> 8) & 0xff;
        this.demBytes[outIdx + 1] = val16 & 0xff;
        this.demBytes[outIdx + 2] = meters <= 1.2 ? 255 : 0; // Water mask (Bay / Ocean)
        this.demBytes[outIdx + 3] = 255;
      }
    }
    this.hasRealDem = true;
    this.demTexture.needsUpdate = true;
  }

  // Bilinear CPU elevation lookup in meters for any North-Up 3D world coordinate (wx, wz)
  sampleElevationMeters(wx, wz) {
    if (!this.hasRealDem) return null;
    const spanX = this.bounds.maxWx - this.bounds.minWx || 1;
    const spanZ = this.bounds.maxWz - this.bounds.minWz || 1;
    const u = (wx - this.bounds.minWx) / spanX;
    const vNorthDown = (wz - this.bounds.minWz) / spanZ;
    if (u < 0 || u > 1 || vNorthDown < 0 || vNorthDown > 1) return 0;

    const fx = u * (DEM_RES - 1);
    const fy = vNorthDown * (DEM_RES - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(DEM_RES - 1, x0 + 1);
    const y1 = Math.min(DEM_RES - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;

    const h00 = this.demMeters[y0 * DEM_RES + x0];
    const h10 = this.demMeters[y0 * DEM_RES + x1];
    const h01 = this.demMeters[y1 * DEM_RES + x0];
    const h11 = this.demMeters[y1 * DEM_RES + x1];

    const top = h00 * (1 - tx) + h10 * tx;
    const bot = h01 * (1 - tx) + h11 * tx;
    return top * (1 - ty) + bot * ty;
  }
}

export const mapTileManager = new LiveMapTileManager();
