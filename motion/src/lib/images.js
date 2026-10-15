// Cache d'images partagé par l'aperçu, la galerie et l'export.
const cache = new Map();

export function getImg(url) {
  if (!url) return null;
  let img = cache.get(url);
  if (!img) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    cache.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Attend que toutes les images soient chargées (avant un export). */
export async function preload(urls) {
  await Promise.all(
    urls.filter(Boolean).map((u) => {
      getImg(u);
      const img = cache.get(u);
      if (img.complete) return Promise.resolve();
      return new Promise((res) => {
        img.addEventListener("load", res, { once: true });
        img.addEventListener("error", res, { once: true });
      });
    }),
  );
}

export function contentImages(content) {
  return [content.image, content.logo, ...(content.images ?? [])].filter(Boolean);
}
