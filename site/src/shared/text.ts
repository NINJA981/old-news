/** Plain-space version of engine copy (it joins numbers and units with a no-break space). */
export function plain(s: string): string {
  return s.replace(/ /g, ' ');
}
