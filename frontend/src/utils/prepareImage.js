const MAX_IMAGE_DIMENSION = 2400;
const WEBP_QUALITY = 0.88;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read the image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('The image could not be decoded.'));
    };
    image.src = objectUrl;
  });
}

function estimateDataUrlBytes(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return Number.POSITIVE_INFINITY;
  return Math.ceil((dataUrl.length - commaIndex - 1) * 0.75);
}

export async function prepareImage(file) {
  const image = await loadImage(file);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / longestEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return {
      dataUrl: await readAsDataUrl(file),
      width: image.naturalWidth,
      height: image.naturalHeight,
      originalBytes: file.size,
      optimizedBytes: file.size,
    };
  }

  context.drawImage(image, 0, 0, width, height);
  const optimizedDataUrl = canvas.toDataURL('image/webp', WEBP_QUALITY);
  const optimizedBytes = estimateDataUrlBytes(optimizedDataUrl);

  if (!optimizedDataUrl.startsWith('data:image/webp') || (scale === 1 && optimizedBytes >= file.size)) {
    return {
      dataUrl: await readAsDataUrl(file),
      width: image.naturalWidth,
      height: image.naturalHeight,
      originalBytes: file.size,
      optimizedBytes: file.size,
    };
  }

  return {
    dataUrl: optimizedDataUrl,
    width,
    height,
    originalBytes: file.size,
    optimizedBytes,
  };
}
