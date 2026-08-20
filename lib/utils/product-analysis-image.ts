export const PRODUCT_ANALYSIS_MAX_IMAGES = 6;
export const PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS = 1_200_000;

const MAX_DIMENSION = 2048;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法解析图片：" + file.name));
    };
    image.src = objectUrl;
  });
}

export async function prepareProductAnalysisImage(file: File) {
  if (!SUPPORTED_TYPES.has(file.type.toLowerCase())) {
    throw new Error("仅支持 JPG、PNG 或 WebP 图片");
  }

  const original = await readAsDataUrl(file);
  const image = await loadImage(file);
  if (
    original.length <= PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS &&
    Math.max(image.naturalWidth, image.naturalHeight) <= MAX_DIMENSION
  ) {
    return original;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return original;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.88, 0.78, 0.68, 0.58]) {
    const candidate = canvas.toDataURL("image/jpeg", quality);
    if (candidate.length <= PRODUCT_ANALYSIS_MAX_DATA_URL_CHARS) return candidate;
  }
  return canvas.toDataURL("image/jpeg", 0.5);
}
