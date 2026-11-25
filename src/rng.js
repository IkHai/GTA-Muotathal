// Zufallszahlen, die bei jedem Start gleich sind (damit die Welt immer gleich aussieht)
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (min, max) => min + next() * (max - min);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
