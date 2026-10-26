/**
 * 色彩与流光背景处理工具库
 * 1:1 对齐 Afilmory 的色彩计算与微图背景生成体系
 */

export interface BackdropResult {
  backdropUrl: string;
  accentRgb: string; // "r, g, b" 格式，方便用于 rgba(...) 和 color-mix
  accentHex: string;
}

// 内存缓存，避免重复切换照片时频繁生成 Canvas
const backdropCache = new Map<string, BackdropResult>();

/**
 * 规范化 URL 键名（去除 host 前缀差异）
 */
function getCacheKey(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

/**
 * 同步从 DOM 中已加载渲染的 <img> 元素直接提取流光背景图与主色调
 * 0 毫秒极速完成，无需任何二次网络请求，点击瞬间即获全色背景
 */
export function extractBackdropFromImageElement(img: HTMLImageElement): BackdropResult | null {
  try {
    if (!img.complete || img.naturalWidth === 0) return null;

    const cacheKey = getCacheKey(img.src);
    if (backdropCache.has(cacheKey)) {
      return backdropCache.get(cacheKey)!;
    }

    const canvas = document.createElement('canvas');
    const w = 32;
    const h = 32;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, w, h);
    const backdropUrl = canvas.toDataURL('image/jpeg', 0.5);

    const imgData = ctx.getImageData(0, 0, w, h).data;
    let r = 0,
      g = 0,
      b = 0,
      count = 0;

    for (let i = 0; i < imgData.length; i += 4) {
      const alpha = imgData[i + 3];
      if (alpha > 40) {
        r += imgData[i];
        g += imgData[i + 1];
        b += imgData[i + 2];
        count++;
      }
    }

    if (count === 0) return null;

    let avgR = Math.round(r / count);
    let avgG = Math.round(g / count);
    let avgB = Math.round(b / count);

    // 提炼生动主色调，对低对比度进行微调拉伸，避免死灰
    const max = Math.max(avgR, avgG, avgB);
    const min = Math.min(avgR, avgG, avgB);
    const diff = max - min;

    if (diff > 8) {
      const avg = (avgR + avgG + avgB) / 3;
      const boost = 1.35;
      avgR = Math.min(240, Math.max(25, Math.round(avg + (avgR - avg) * boost)));
      avgG = Math.min(240, Math.max(25, Math.round(avg + (avgG - avg) * boost)));
      avgB = Math.min(240, Math.max(25, Math.round(avg + (avgB - avg) * boost)));
    } else {
      avgR = Math.min(220, Math.max(60, avgR));
      avgG = Math.min(220, Math.max(60, avgG));
      avgB = Math.min(220, Math.max(60, avgB));
    }

    const accentRgb = `${avgR}, ${avgG}, ${avgB}`;
    const accentHex = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;

    const result: BackdropResult = {
      backdropUrl,
      accentRgb,
      accentHex,
    };

    backdropCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn('[ColorExtract] Synchronous extraction failed, will use fallback:', err);
    return null;
  }
}

/**
 * 异步通过 URL 提取主色调与流光背景
 */
export async function extractImageBackdrop(imgUrl: string): Promise<BackdropResult> {
  const cacheKey = getCacheKey(imgUrl);
  if (backdropCache.has(cacheKey)) {
    return backdropCache.get(cacheKey)!;
  }

  return new Promise((resolve) => {
    const fallbackResult: BackdropResult = {
      backdropUrl: imgUrl,
      accentRgb: '120, 120, 128',
      accentHex: '#787880',
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = 32;
        const h = 32;
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(fallbackResult);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const backdropUrl = canvas.toDataURL('image/jpeg', 0.5);
        const imgData = ctx.getImageData(0, 0, w, h).data;
        let r = 0,
          g = 0,
          b = 0,
          count = 0;

        for (let i = 0; i < imgData.length; i += 4) {
          const alpha = imgData[i + 3];
          if (alpha > 40) {
            r += imgData[i];
            g += imgData[i + 1];
            b += imgData[i + 2];
            count++;
          }
        }

        if (count === 0) {
          resolve(fallbackResult);
          return;
        }

        let avgR = Math.round(r / count);
        let avgG = Math.round(g / count);
        let avgB = Math.round(b / count);

        const max = Math.max(avgR, avgG, avgB);
        const min = Math.min(avgR, avgG, avgB);
        const diff = max - min;

        if (diff > 8) {
          const avg = (avgR + avgG + avgB) / 3;
          const boost = 1.35;
          avgR = Math.min(240, Math.max(25, Math.round(avg + (avgR - avg) * boost)));
          avgG = Math.min(240, Math.max(25, Math.round(avg + (avgG - avg) * boost)));
          avgB = Math.min(240, Math.max(25, Math.round(avg + (avgB - avg) * boost)));
        } else {
          avgR = Math.min(220, Math.max(60, avgR));
          avgG = Math.min(220, Math.max(60, avgB));
          avgB = Math.min(220, Math.max(60, avgB));
        }

        const result: BackdropResult = {
          backdropUrl,
          accentRgb: `${avgR}, ${avgG}, ${avgB}`,
          accentHex: `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`,
        };

        backdropCache.set(cacheKey, result);
        resolve(result);
      } catch {
        resolve(fallbackResult);
      }
    };

    img.onerror = () => {
      resolve(fallbackResult);
    };

    img.src = imgUrl;
  });
}
