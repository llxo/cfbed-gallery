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
 * 从图片中提取极低频色彩分布（16x12 微图）与主色调 Accent Color
 * 配合双线性平滑插值，呈现出如梦似幻、无噪点的流光氛围
 */
export async function extractImageBackdrop(imgUrl: string): Promise<BackdropResult> {
  if (backdropCache.has(imgUrl)) {
    return backdropCache.get(imgUrl)!;
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
        const w = 16;
        const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(fallbackResult);
          return;
        }

        // 绘制微缩图，抹除高频杂波，提取宏观色彩分布
        ctx.drawImage(img, 0, 0, w, h);
        const backdropUrl = canvas.toDataURL('image/jpeg', 0.6);

        // 计算加权均值色彩作为主色调 Accent
        const imgData = ctx.getImageData(0, 0, w, h).data;
        let r = 0, g = 0, b = 0, count = 0;

        for (let i = 0; i < imgData.length; i += 4) {
          const alpha = imgData[i + 3];
          if (alpha > 30) {
            r += imgData[i];
            g += imgData[i + 1];
            b += imgData[i + 2];
            count++;
          }
        }

        let accentRgb = '120, 120, 128';
        let accentHex = '#787880';

        if (count > 0) {
          const avgR = Math.round(r / count);
          const avgG = Math.round(g / count);
          const avgB = Math.round(b / count);

          // 适度提亮并限制饱和度，防止过暗或过刺眼
          const clampedR = Math.min(220, Math.max(50, avgR));
          const clampedG = Math.min(220, Math.max(50, avgG));
          const clampedB = Math.min(220, Math.max(50, avgB));

          accentRgb = `${clampedR}, ${clampedG}, ${clampedB}`;
          accentHex = `#${clampedR.toString(16).padStart(2, '0')}${clampedG.toString(16).padStart(2, '0')}${clampedB.toString(16).padStart(2, '0')}`;
        }

        const result: BackdropResult = {
          backdropUrl,
          accentRgb,
          accentHex,
        };

        backdropCache.set(imgUrl, result);
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

/**
 * 兼容旧方法
 */
export async function generateSmoothBackdrop(imgUrl: string): Promise<string | null> {
  const res = await extractImageBackdrop(imgUrl);
  return res.backdropUrl;
}

