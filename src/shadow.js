import * as THREE from 'three';

// Runder, weicher "Klecks"-Schatten unter Figuren und Autos (billig und typisch für die Zeit)
let texture = null;
function getTexture() {
  if (texture) return texture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  texture = new THREE.CanvasTexture(c);
  return texture;
}

export function makeBlobShadow(w, d) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: getTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
