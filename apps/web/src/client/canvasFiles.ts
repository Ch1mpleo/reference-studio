import { IMAGE_MEDIA_TYPES } from "@reference-studio/core";

export function isCanvasImage(file: { name: string; type: string }): boolean {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  const supportedExtension = extension !== undefined && ["jpg", "jpeg", "png", "webp"].includes(extension);
  if (extension !== undefined && !supportedExtension) return false;
  return IMAGE_MEDIA_TYPES.some((type) => type === file.type.toLowerCase()) || (file.type === "" && supportedExtension);
}
