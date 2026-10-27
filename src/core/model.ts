/** The bundled model's size, read from the pinned manifest so UI copy never hard-codes it. */
import manifest from '../../scripts/model-manifest.json';

export const MODEL_BYTES: number = manifest.files['onnx/model_quantized.onnx'].bytes;

/** "23 MB" (decimal megabytes, rounded: the same figure the README states). */
export function modelSizeLabel(bytes: number = MODEL_BYTES): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}
