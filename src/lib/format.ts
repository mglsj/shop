/** Replaces {name} placeholders. Unknown placeholders are left untouched. */
export function format(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** ₹1,240 / ₹150.5 (Indian digit grouping, up to 2 decimals). */
export function rupees(n: number): string {
	return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
