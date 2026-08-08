/** 업로드 전 브라우저에서 사진을 줄인다. 전송량과 토큰 비용을 함께 줄이기 위함. */
const MAX_EDGE = 1536;
const QUALITY = 0.85;

export type PreparedImage = {
  base64: string;
  mediaType: "image/jpeg";
  previewUrl: string;
};

export async function prepareImage(file: File): Promise<PreparedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리할 수 없습니다.");
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    return {
      base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      mediaType: "image/jpeg",
      previewUrl: dataUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("이미지를 읽지 못했습니다. JPG 또는 PNG 파일로 다시 시도해주세요."));
    image.src = src;
  });
}
