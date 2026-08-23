export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatFee(fee: number | undefined): string {
  if (fee === undefined) return "Free";
  return `Rs ${fee}`;
}

export function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
