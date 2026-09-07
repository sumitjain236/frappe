const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(value) {
	if (!value) return "";
	const d = new Date(String(value).replace(" ", "T"));
	if (Number.isNaN(d.getTime())) return String(value);
	const sameYear = d.getFullYear() === new Date().getFullYear();
	return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? "" : " " + d.getFullYear()}`;
}

export function longDate(value) {
	if (!value) return "";
	const d = new Date(String(value).replace(" ", "T"));
	if (Number.isNaN(d.getTime())) return String(value);
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
