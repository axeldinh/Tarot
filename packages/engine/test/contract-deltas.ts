/** The contract's share of the deltas, with any misère transfers taken back out. */
export function contractDeltas(result: { deltas: number[]; miseres: { player: number }[] }): number[] {
  const out = [...result.deltas];
  for (const m of result.miseres) {
    for (let p = 0; p < out.length; p++) {
      if (p === m.player) continue;
      out[m.player] = (out[m.player] as number) - 10;
      out[p] = (out[p] as number) + 10;
    }
  }
  return out;
}
