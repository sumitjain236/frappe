import { test, expect } from "../support";

test.describe("Control Rating", () => {
	test.beforeEach(async ({ page, desk }) => {
		await page.goto("/desk/website");
		await desk.ready();
	});

	function get_dialog_with_rating(desk) {
		return desk.dialog({
			title: "Rating",
			fields: [
				{
					fieldname: "rate",
					fieldtype: "Rating",
					options: 7,
				},
			],
		});
	}

	test("click on the star rating to record value", async ({ page, desk }) => {
		const dialog = await get_dialog_with_rating(desk);

		const star = page.locator("div.rating > svg .right-half").first();
		await star.click();
		await expect(star).toHaveClass(/(^|\s)star-click(\s|$)/);

		expect(await dialog.evaluate((d) => d.get_value("rate"))).toBe(1 / 7);
		await dialog.evaluate((d) => d.hide());
	});

	test("hover on the star", async ({ page, desk }) => {
		await get_dialog_with_rating(desk);

		const star = page.locator("div.rating > svg .right-half").first();
		await star.hover();
		await expect(star).toHaveClass(/(^|\s)star-hover(\s|$)/);
		await page.locator(".modal:visible .modal-title").hover();
		await expect(star).not.toHaveClass(/(^|\s)star-hover(\s|$)/);
	});

	test("check number of stars in rating", async ({ page, desk }) => {
		await get_dialog_with_rating(desk);

		await expect(page.locator("div.rating").first().locator("> svg")).toHaveCount(7);
	});

	test("set the rating with the keyboard", async ({ page, desk }) => {
		const dialog = await get_dialog_with_rating(desk);

		const rating = page.locator(".modal:visible div.rating").first();
		await rating.focus();
		await page.keyboard.press("ArrowRight");
		expect(await dialog.evaluate((d) => d.get_value("rate"))).toBe(0.5 / 7);
		await page.keyboard.press("4");
		expect(await dialog.evaluate((d) => d.get_value("rate"))).toBe(4 / 7);
		await page.keyboard.press("End");
		expect(await dialog.evaluate((d) => d.get_value("rate"))).toBe(1);
		await expect(rating).toHaveAttribute("aria-valuenow", "7");
		await dialog.evaluate((d) => d.hide());
	});

	test("a required rating can't be cleared by clicking it again", async ({ page, desk }) => {
		const dialog = await desk.dialog({
			title: "Rating",
			fields: [{ fieldname: "rate", fieldtype: "Rating", reqd: 1 }],
		});

		const star = page.locator(".modal:visible div.rating > svg .right-half").nth(2);
		await star.click();
		expect(await dialog.evaluate((d) => d.get_value("rate"))).toBe(3 / 5);
		await star.click();
		expect(await dialog.evaluate((d) => d.get_value("rate"))).toBe(3 / 5);
		await dialog.evaluate((d) => d.hide());
	});

	test("read-only stars keep one svg per star with filled halves marked", async ({ page }) => {
		const markup = await page.evaluate(() => {
			const el = $(frappe.format(0.7, { fieldtype: "Rating", options: 5 }))[0];
			return {
				stars: el.querySelectorAll(":scope > svg[data-rating]").length,
				svgs: el.querySelectorAll("svg").length,
				filled_halves: el.querySelectorAll(".star-click").length,
			};
		});
		expect(markup).toEqual({ stars: 5, svgs: 5, filled_halves: 7 });
	});
});
