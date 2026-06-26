import { ReferenceFuel } from '@irdashies/types';

/**
 * Pre-computes and stores Fritsch-Carlson PCHIP tangents for each point in the lap.
 * Mutates the ReferenceFuel object.
 */
export function precomputePCHIPTangents(lap: ReferenceFuel): void {
  if (lap.fuelConsumed.length < 2) return;

  const x = lap.pointPos;
  const y = lap.fuelConsumed;

  const lapFuel = lap.startFuel - lap.finishFuel;
  // Compute tangents
  const tangents = computePCHIPTangents(x, y, lapFuel);

  for (let i = 0; i < lap.fuelConsumed.length; i++) {
    lap.tangents[i] = tangents[i];
  }
}

function computePCHIPTangents(
  x: Float32Array,
  y: Float32Array,
  lapFuel: number
): Float32Array {
  const n = x.length;
  const tangents = new Float32Array(n);
  const deltas = new Float32Array(n - 1);

  // Calculate deltas for interior points
  for (let k = 0; k < n - 1; k++) {
    deltas[k] = (y[k + 1] - y[k]) / (x[k + 1] - x[k]);
  }

  // For the first point (x[0]), we need to look back to the last point
  // The "previous" point wraps around: it's at position (x[n-1] - 1) with fuel (y[n-1] - lapFuel)
  const delta_before_first =
    (y[0] - (y[n - 1] - lapFuel)) / (x[0] - (x[n - 1] - 1));

  // For the last point (x[n-1]), we need to look forward to the first point
  // The "next" point wraps around: it's at position (x[0] + 1) with fuel (y[0] + lapFuel)
  const delta_after_last = (y[0] + lapFuel - y[n - 1]) / (x[0] + 1 - x[n - 1]);

  // Calculate tangent for first point
  const d_0 = delta_before_first;
  const d_1 = deltas[0];
  if (d_0 * d_1 <= 0) {
    tangents[0] = 0;
  } else {
    const dx_after = x[1] - x[0];
    const dx_before = x[0] - (x[n - 1] - 1);
    const w1 = 2 * dx_after + dx_before;
    const w2 = dx_after + 2 * dx_before;
    tangents[0] = (w1 + w2) / (w1 / d_0 + w2 / d_1);
  }

  // Calculate tangent for last point
  const d_nm2 = deltas[n - 2];
  const d_nm1 = delta_after_last;
  if (d_nm2 * d_nm1 <= 0) {
    tangents[n - 1] = 0;
  } else {
    const dx_before = x[n - 1] - x[n - 2];
    const dx_after = x[0] + 1 - x[n - 1];
    const w1 = 2 * dx_after + dx_before;
    const w2 = dx_after + 2 * dx_before;
    tangents[n - 1] = (w1 + w2) / (w1 / d_nm2 + w2 / d_nm1);
  }

  // Interior points remain the same
  for (let k = 1; k < n - 1; k++) {
    const d_k = deltas[k - 1];
    const d_kp1 = deltas[k];
    if (d_k * d_kp1 <= 0) {
      tangents[k] = 0;
    } else {
      const w1 = 2 * (x[k + 1] - x[k]) + (x[k] - x[k - 1]);
      const w2 = x[k + 1] - x[k] + 2 * (x[k] - x[k - 1]);
      tangents[k] = (w1 + w2) / (w1 / d_k + w2 / d_kp1);
    }
  }

  return tangents;
}
