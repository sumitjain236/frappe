// Stroke icons on a 24px grid, drawn inline so they recolor with currentColor.
export const ICONS = {
	shelf: '<path d="M3 6h18"/><path d="M3 13h18"/><path d="M3 20h18"/><rect x="6" y="8" width="4" height="5" rx=".5"/><rect x="12" y="9" width="5" height="4" rx=".5"/><rect x="8" y="15" width="6" height="5" rx=".5"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
	"chevron-down": '<path d="m6 9 6 6 6-6"/>',
	"chevron-right": '<path d="m9 18 6-6-6-6"/>',
	"arrow-left": '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
	"arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	"check-circle": '<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
	alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
	report: '<path d="M3 3v18h18"/><path d="M8 17v-6"/><path d="M13 17V7"/><path d="M18 17v-3"/>',
	dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
	print: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/>',
	script: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
	workspace: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
	box: '<path d="m21 8-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
	external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
	download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
	shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
	globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
	lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
	clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
	docs: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/>',
	input: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 12h.01"/><path d="M11 12h.01"/><path d="M15 12h.01"/>',
	grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
	list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
	"git-commit": '<circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5"/><path d="M15.5 12H21"/>',
	file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
	trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
	circle: '<circle cx="12" cy="12" r="9"/>',
	loader: '<path d="M12 3v3"/><path d="M12 18v3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/>',
	history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v5l3 2"/>',
};

export const CATEGORY_ICON = {
	Report: "report",
	Dashboard: "dashboard",
	"Print Format": "print",
	"Server Script": "script",
	Workspace: "workspace",
};

// frappe-ui palette, light mode
export const CATEGORY_COLOR = {
	Report: { bg: "#E6F4FF", fg: "#007BE0", text: "#0070CC" },
	Dashboard: { bg: "#E6F7F4", fg: "#0B9E92", text: "#0F736B" },
	"Print Format": { bg: "#FFF7D3", fg: "#DB7706", text: "#B35309" },
	"Server Script": { bg: "#F0EBFF", fg: "#5F46C7", text: "#4F3DA1" },
	Workspace: { bg: "#FFEFE4", fg: "#D45A08", text: "#BD3E0C" },
	Other: { bg: "#F3F3F3", fg: "#525252", text: "#383838" },
};

export function categoryStyle(category) {
	return CATEGORY_COLOR[category] || CATEGORY_COLOR.Other;
}

export function categoryIcon(category) {
	return CATEGORY_ICON[category] || "box";
}
